import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALGORITHM_NAMES,
  DEFAULT_COMPOSITION,
  ROLES,
  type AlgorithmName,
  type RoleComposition,
  type RoleWeights,
} from '../../src/modules/balancer/balancer.constants';
import {
  BalancerService,
  InvalidBalancerInputError,
} from '../../src/modules/balancer/balancer.service';
import {
  balancerInputSchema,
  type BalancerPlayerInput,
} from '../../src/modules/balancer/dto/balancer-input.schema';
import type {
  BalancedTeams,
  BalancerOptions,
} from '../../src/modules/balancer/interfaces/balanced-teams.interface';
import {
  assertValidResult,
  close,
  resolveSetup,
  splitKey,
} from './helpers/invariants';
import { createRng, randomRawPool, shuffle } from './helpers/random-pool';

const service = new BalancerService();

interface Config {
  name: string;
  teamCount: number;
  composition: RoleComposition;
  pools: number;
  /** True when the exhaustive algorithm can handle it (the optimum is known). */
  exact: boolean;
}

const CONFIGS: Config[] = [
  {
    name: '2 teams, 1/2/2',
    teamCount: 2,
    composition: DEFAULT_COMPOSITION,
    pools: 60,
    exact: true,
  },
  {
    name: '2 teams, 2/2/1',
    teamCount: 2,
    composition: { tank: 2, damage: 2, support: 1 },
    pools: 25,
    exact: true,
  },
  {
    name: '2 teams, 0/2/2',
    teamCount: 2,
    composition: { tank: 0, damage: 2, support: 2 },
    pools: 25,
    exact: true,
  },
  {
    name: '2 teams, 1/1/1',
    teamCount: 2,
    composition: { tank: 1, damage: 1, support: 1 },
    pools: 40,
    exact: true,
  },
  {
    name: '3 teams, 1/1/1',
    teamCount: 3,
    composition: { tank: 1, damage: 1, support: 1 },
    pools: 12,
    exact: true,
  },
  {
    name: '3 teams, 1/2/2',
    teamCount: 3,
    composition: DEFAULT_COMPOSITION,
    pools: 10,
    exact: false,
  },
  {
    name: '4 teams, 1/2/2',
    teamCount: 4,
    composition: DEFAULT_COMPOSITION,
    pools: 8,
    exact: false,
  },
];

const teamSize = (composition: RoleComposition) =>
  ROLES.reduce((sum, role) => sum + composition[role], 0);

interface Pool {
  raw: unknown[];
  players: BalancerPlayerInput[];
}

/** Random JSON pools that can actually be balanced under the config. */
function feasiblePools(
  config: Config,
  seed: number,
): { pools: Pool[]; attempts: number } {
  const rng = createRng(seed);
  const size = config.teamCount * teamSize(config.composition);
  const pools: Pool[] = [];
  let attempts = 0;

  while (pools.length < config.pools && attempts < config.pools * 60) {
    attempts++;
    const raw = randomRawPool(rng, size);
    const parsed = balancerInputSchema.safeParse(raw);
    assert.ok(parsed.success, 'the generator only produces valid JSON');

    try {
      service.balanceTeams(parsed.data, options(config, 'greedy'));
      pools.push({ raw, players: parsed.data });
    } catch (error) {
      if (!(error instanceof InvalidBalancerInputError)) throw error;
    }
  }
  return { pools, attempts };
}

function options(
  config: Config,
  algorithm: AlgorithmName,
  extra: Partial<BalancerOptions> = {},
): BalancerOptions {
  return {
    algorithm,
    teamCount: config.teamCount,
    composition: config.composition,
    ...extra,
  };
}

const playedRoles = (player: BalancerPlayerInput) =>
  ROLES.filter((role) => player[role] !== undefined);

function roleOf(result: BalancedTeams, id: string): string | undefined {
  for (const team of result.teams) {
    for (const slot of team.slots)
      if (slot.player.discordId === id) return slot.role;
  }
  return undefined;
}

for (const config of CONFIGS) {
  describe(`random JSON pools: ${config.name}`, () => {
    const { pools, attempts } = feasiblePools(
      config,
      1000 + CONFIGS.indexOf(config),
    );
    const algorithms: AlgorithmName[] = ALGORITHM_NAMES.filter(
      (name) => config.exact || name !== 'exhaustive',
    );

    // Every (pool, algorithm) pair is solved once; annealing is the slow one.
    const cache = new Map<string, BalancedTeams>();
    const solve = (index: number, algorithm: AlgorithmName): BalancedTeams => {
      const key = `${index}:${algorithm}`;
      let result = cache.get(key);
      if (!result) {
        result = service.balanceTeams(
          pools[index].players,
          options(config, algorithm),
        );
        cache.set(key, result);
      }
      return result;
    };

    it('has enough balanceable pools to be meaningful', () => {
      assert.equal(
        pools.length,
        config.pools,
        `found ${pools.length} of ${config.pools} pools in ${attempts} attempts`,
      );
    });

    it('every algorithm returns a valid result and respects role restrictions', () => {
      for (const [index, pool] of pools.entries()) {
        const setup = resolveSetup(pool.players, options(config, 'greedy'));
        for (const algorithm of algorithms) {
          const result = solve(index, algorithm);
          try {
            assertValidResult(setup, result);
            for (const player of pool.players) {
              const roles = playedRoles(player);
              if (roles.length === 1) {
                assert.equal(
                  roleOf(result, player.discordId),
                  roles[0],
                  `${player.discordId} plays only ${roles[0]}`,
                );
              }
            }
          } catch (error) {
            throw new Error(
              `pool ${index}, ${algorithm}: ${(error as Error).message}\n${JSON.stringify(pool.raw)}`,
            );
          }
        }
      }
    });

    it('annealing is never worse than greedy', () => {
      for (const index of pools.keys()) {
        const greedy = solve(index, 'greedy');
        const annealing = solve(index, 'simulated-annealing');
        assert.ok(
          annealing.metrics.score <= greedy.metrics.score + 1e-9,
          `pool ${index}: annealing ${annealing.metrics.score} vs greedy ${greedy.metrics.score}`,
        );
      }
    });

    it('is deterministic for the same input', () => {
      for (const [index, pool] of pools.slice(0, 6).entries()) {
        for (const algorithm of algorithms) {
          const first = solve(index, algorithm);
          const again = service.balanceTeams(
            pool.players,
            options(config, algorithm),
          );
          assert.equal(splitKey(first), splitKey(again), algorithm);
        }
      }
    });

    if (!config.exact) return;

    it('exhaustive is never worse than any other algorithm', () => {
      for (const index of pools.keys()) {
        const optimum = solve(index, 'exhaustive').metrics.score;
        for (const algorithm of ALGORITHM_NAMES) {
          const score = solve(index, algorithm).metrics.score;
          assert.ok(
            optimum <= score + 1e-9,
            `pool ${index}: exhaustive ${optimum} vs ${algorithm} ${score}`,
          );
        }
      }
    });

    it('annealing finds the optimum in nearly every pool', () => {
      let optimal = 0;
      for (const index of pools.keys()) {
        const best = solve(index, 'exhaustive').metrics.score;
        const found = solve(index, 'simulated-annealing').metrics.score;
        if (found <= best + 1e-9) optimal++;
      }
      assert.ok(
        optimal / pools.length >= 0.9,
        `optimal in ${optimal}/${pools.length} pools`,
      );
    });

    describe('metamorphic properties of the optimum', () => {
      const optimumOf = (
        players: BalancerPlayerInput[],
        extra: Partial<BalancerOptions> = {},
        composition = config.composition,
      ) =>
        service.balanceTeams(players, {
          ...options(config, 'exhaustive', extra),
          composition,
        }).metrics.score;

      it('does not depend on the order of the players', () => {
        const rng = createRng(31);
        for (const pool of pools.slice(0, 12)) {
          const shuffled = shuffle(rng, pool.players);
          close(
            optimumOf(shuffled),
            optimumOf(pool.players),
            'optimum after shuffling',
          );
        }
      });

      it('does not depend on the ids or names', () => {
        for (const pool of pools.slice(0, 12)) {
          const renamed = pool.players.map((p, i) => ({
            ...p,
            discordId: `zz-${pool.players.length - i}`,
            username: `other ${i}`,
          }));
          close(
            optimumOf(renamed),
            optimumOf(pool.players),
            'optimum after renaming',
          );
        }
      });

      it('scales linearly with the ratings', () => {
        for (const pool of pools.slice(0, 12)) {
          const doubled = pool.players.map((p) => ({
            ...p,
            tank: p.tank === undefined ? undefined : p.tank * 2,
            damage: p.damage === undefined ? undefined : p.damage * 2,
            support: p.support === undefined ? undefined : p.support * 2,
          }));
          close(
            optimumOf(doubled),
            2 * optimumOf(pool.players),
            'optimum with doubled ratings',
          );
        }
      });

      it('scales linearly with the role weights', () => {
        const doubled: RoleWeights = { tank: 2, damage: 2, support: 2 };
        for (const pool of pools.slice(0, 12)) {
          close(
            optimumOf(pool.players, { roleWeights: doubled }),
            2 * optimumOf(pool.players),
            'optimum with doubled weights',
          );
        }
      });

      it('is symmetric when tank and support swap places', () => {
        const swapped: RoleComposition = {
          tank: config.composition.support,
          damage: config.composition.damage,
          support: config.composition.tank,
        };
        for (const pool of pools.slice(0, 12)) {
          const mirror = pool.players.map((p) => ({
            ...p,
            tank: p.support,
            support: p.tank,
          }));
          close(
            optimumOf(mirror, {}, swapped),
            optimumOf(pool.players),
            'optimum with tank and support exchanged',
          );
        }
      });

      it('does not get worse when a player gains a role they can also play equally well', () => {
        // Extra options can only help: the old split is still available.
        for (const pool of pools.slice(0, 12)) {
          const before = optimumOf(pool.players);
          const widened = pool.players.map((p) => {
            const roles = playedRoles(p);
            const missing = ROLES.find((role) => p[role] === undefined);
            return missing === undefined ? p : { ...p, [missing]: p[roles[0]] };
          });
          assert.ok(
            optimumOf(widened) <= before + 1e-9,
            'a wider role pool must not raise the best score',
          );
        }
      });
    });
  });
}

describe('random pools: player count edge cases', () => {
  it('always rejects a count that does not match the teams', () => {
    const rng = createRng(5);
    for (const size of [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 15]) {
      const players = balancerInputSchema.parse(randomRawPool(rng, size));
      for (const algorithm of ALGORITHM_NAMES) {
        assert.throws(
          () => service.balanceTeams(players, { algorithm }),
          (error: unknown) =>
            error instanceof InvalidBalancerInputError &&
            /Expected 10 players/.test(error.message),
          `${size} players with ${algorithm}`,
        );
      }
    }
  });
});
