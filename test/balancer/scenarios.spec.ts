import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  ALGORITHM_NAMES,
  type AlgorithmName,
  type Role,
} from '../../src/modules/balancer/balancer.constants';
import {
  BalancerService,
  InvalidBalancerInputError,
} from '../../src/modules/balancer/balancer.service';
import {
  balancerInputSchema,
  formatZodIssues,
} from '../../src/modules/balancer/dto/balancer-input.schema';
import { balancerOptionsSchema } from '../../src/modules/balancer/dto/balancer-options.schema';
import type { BalancedTeams } from '../../src/modules/balancer/interfaces/balanced-teams.interface';
import {
  assertValidResult,
  close,
  resolveSetup,
  splitKey,
} from './helpers/invariants';

interface Scenario {
  name: string;
  description: string;
  players: unknown;
  options?: unknown;
  /** Algorithms to run; defaults to all of them. */
  algorithms?: AlgorithmName[];
  expect?: {
    /** The players JSON must fail validation with a message containing this. */
    schemaError?: string;
    /** The options JSON must fail validation with a message containing this. */
    optionsError?: string;
    /** Balancing must throw InvalidBalancerInputError containing this. */
    error?: string;
    /** The best possible split has score 0 (exhaustive and annealing must find it). */
    perfect?: boolean;
    /** Annealing must match the exhaustive optimum (needs both algorithms in the run). */
    annealingOptimal?: boolean;
    /** How many players must be left out of the teams. */
    benchCount?: number;
    /** Everyone on the bench must be one of these players. */
    benchAmong?: string[];
    /** Exactly these players sit out when annealing or exhaustive search decide. */
    optimizerBench?: string[];
    /** Players that every algorithm must place in exactly this role. */
    forcedRoles?: Record<string, Role>;
  };
}

const SCENARIO_DIR = join(__dirname, 'scenarios');
const service = new BalancerService();

function loadScenarioFiles(): { file: string; scenarios: Scenario[] }[] {
  return readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      scenarios: (
        JSON.parse(readFileSync(join(SCENARIO_DIR, file), 'utf8')) as {
          scenarios: Scenario[];
        }
      ).scenarios,
    }));
}

function roleOf(result: BalancedTeams, discordId: string): Role | undefined {
  for (const team of result.teams) {
    for (const slot of team.slots) {
      if (slot.player.discordId === discordId) return slot.role;
    }
  }
  return undefined;
}

function registerScenario(scenario: Scenario): void {
  const expected = scenario.expect ?? {};
  const algorithms = scenario.algorithms ?? [...ALGORITHM_NAMES];

  describe(scenario.name, () => {
    if (expected.schemaError !== undefined) {
      it(`rejects the players JSON: "${expected.schemaError}"`, () => {
        const parsed = balancerInputSchema.safeParse(scenario.players);
        assert.equal(parsed.success, false, 'the JSON should be rejected');
        if (!parsed.success) {
          assert.match(
            formatZodIssues(parsed.error),
            new RegExp(escape(expected.schemaError!)),
          );
        }
      });
      return;
    }

    const players = balancerInputSchema.parse(scenario.players);

    if (expected.optionsError !== undefined) {
      it(`rejects the options: "${expected.optionsError}"`, () => {
        const parsed = balancerOptionsSchema.safeParse(scenario.options);
        assert.equal(parsed.success, false, 'the options should be rejected');
        if (!parsed.success) {
          assert.match(
            formatZodIssues(parsed.error),
            new RegExp(escape(expected.optionsError!)),
          );
        }
      });
      return;
    }

    const options = balancerOptionsSchema.parse(scenario.options ?? {});
    const setup = resolveSetup(players, options);

    if (expected.error !== undefined) {
      for (const algorithm of algorithms) {
        it(`${algorithm}: fails with "${expected.error}"`, () => {
          assert.throws(
            () => service.balanceTeams(players, { ...options, algorithm }),
            (error: unknown) => {
              assert.ok(
                error instanceof InvalidBalancerInputError,
                'error type',
              );
              assert.match(error.message, new RegExp(escape(expected.error!)));
              return true;
            },
          );
        });
      }
      return;
    }

    const results = new Map<AlgorithmName, BalancedTeams>();

    for (const algorithm of algorithms) {
      it(`${algorithm}: returns a valid balanced result`, () => {
        const result = service.balanceTeams(players, { ...options, algorithm });
        results.set(algorithm, result);

        assert.equal(result.algorithm, algorithm);
        assertValidResult(setup, result);

        for (const [id, role] of Object.entries(expected.forcedRoles ?? {})) {
          assert.equal(roleOf(result, id), role, `${id} must play ${role}`);
        }

        const benched = result.bench.map((player) => player.discordId).sort();
        if (expected.benchCount !== undefined) {
          assert.equal(benched.length, expected.benchCount, 'bench size');
        }
        for (const id of benched) {
          if (expected.benchAmong) {
            assert.ok(
              expected.benchAmong.includes(id),
              `${id} should not sit out`,
            );
          }
        }
        if (
          expected.optimizerBench &&
          (algorithm === 'exhaustive' || algorithm === 'simulated-annealing')
        ) {
          assert.deepEqual(
            benched,
            [...expected.optimizerBench].sort(),
            'who sits out',
          );
        }
      });

      it(`${algorithm}: is deterministic`, () => {
        const first =
          results.get(algorithm) ??
          service.balanceTeams(players, { ...options, algorithm });
        const second = service.balanceTeams(players, { ...options, algorithm });
        assert.equal(splitKey(first), splitKey(second));
        assert.equal(first.metrics.score, second.metrics.score);
      });
    }

    it('compares the algorithms against each other', () => {
      const run = (algorithm: AlgorithmName) =>
        results.get(algorithm) ??
        service.balanceTeams(players, { ...options, algorithm });
      const scores = new Map(
        algorithms.map((algorithm) => [
          algorithm,
          run(algorithm).metrics.score,
        ]),
      );

      const exhaustive = scores.get('exhaustive');
      if (exhaustive !== undefined) {
        for (const [algorithm, score] of scores) {
          assert.ok(
            exhaustive <= score + 1e-9,
            `exhaustive (${exhaustive}) must not be worse than ${algorithm} (${score})`,
          );
        }
      }

      const annealing = scores.get('simulated-annealing');
      const greedy = scores.get('greedy');
      if (annealing !== undefined && greedy !== undefined) {
        assert.ok(
          annealing <= greedy + 1e-9,
          `annealing (${annealing}) must not be worse than greedy (${greedy})`,
        );
      }

      if (expected.annealingOptimal) {
        assert.ok(
          exhaustive !== undefined && annealing !== undefined,
          'needs both algorithms',
        );
        close(
          annealing,
          exhaustive,
          'annealing must reach the exhaustive optimum',
        );
      }

      if (expected.perfect) {
        for (const algorithm of [
          'exhaustive',
          'simulated-annealing',
        ] as const) {
          const score = scores.get(algorithm);
          if (score !== undefined)
            close(score, 0, `${algorithm} score of a perfect pool`);
        }
      }
    });
  });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const { file, scenarios } of loadScenarioFiles()) {
  describe(`scenarios/${file}`, () => {
    for (const scenario of scenarios) registerScenario(scenario);
  });
}

describe('scenario files', () => {
  it('have unique scenario names and a description each', () => {
    const names = new Set<string>();
    for (const { file, scenarios } of loadScenarioFiles()) {
      assert.ok(scenarios.length > 0, `${file} has scenarios`);
      for (const scenario of scenarios) {
        assert.ok(
          scenario.description.length > 0,
          `${scenario.name} has a description`,
        );
        assert.ok(
          !names.has(scenario.name),
          `duplicate scenario name ${scenario.name}`,
        );
        names.add(scenario.name);
      }
    }
  });
});
