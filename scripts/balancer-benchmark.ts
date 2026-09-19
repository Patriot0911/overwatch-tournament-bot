import { performance } from 'node:perf_hooks';
import { ALGORITHMS } from '../src/modules/balancer/algorithms';
import {
  ALGORITHM_NAMES,
  DEFAULT_COMPOSITION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_WEIGHTS,
  ROLES,
  type AlgorithmName,
  type RoleWeights,
} from '../src/modules/balancer/balancer.constants';
import { InvalidBalancerInputError } from '../src/modules/balancer/core/errors';
import { evaluate } from '../src/modules/balancer/core/evaluate';
import {
  createProblem,
  type BalancingProblem,
} from '../src/modules/balancer/core/problem';
import { createRng } from '../src/modules/balancer/core/rng';
import type { BalancerPlayerInput } from '../src/modules/balancer/dto/balancer-input.schema';

/**
 * Compares the balancing algorithms on random pools. Every player plays 1-3
 * roles (30% / 40% / 30%), strongest in one main role.
 */
function randomPlayer(index: number, rng: () => number): BalancerPlayerInput {
  const gaussian =
    Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const base = Math.min(4500, Math.max(500, 2500 + 600 * gaussian));

  const roleRoll = rng();
  const roleCount = roleRoll < 0.3 ? 1 : roleRoll < 0.7 ? 2 : 3;
  const shuffled = [...ROLES].sort(() => rng() - 0.5);
  const [main, ...others] = shuffled.slice(0, roleCount);

  const player: BalancerPlayerInput = {
    discordId: String(index),
    username: `player${index}`,
  };
  player[main] = Math.round(base);
  for (const role of others)
    player[role] = Math.round(base * (0.6 + rng() * 0.4));
  return player;
}

/** Random pool that has at least one valid role placement. */
function randomProblem(
  teamCount: number,
  roleWeights: RoleWeights,
  seed: number,
  rng: () => number,
): BalancingProblem {
  for (;;) {
    const players = Array.from({ length: teamCount * 5 }, (_, i) =>
      randomPlayer(i, rng),
    );
    try {
      return createProblem(players, {
        composition: DEFAULT_COMPOSITION,
        teamCount,
        roleWeights,
        weights: DEFAULT_WEIGHTS,
        seed,
      });
    } catch (error) {
      if (!(error instanceof InvalidBalancerInputError)) throw error;
    }
  }
}

interface Stats {
  score: number;
  total: number;
  role: number;
  star: number;
  ms: number;
  wins: number;
  runs: number;
}

function runConfig(
  teamCount: number,
  trials: number,
  roleWeights: RoleWeights = DEFAULT_ROLE_WEIGHTS,
): void {
  const rng = createRng(42);
  const stats = new Map<AlgorithmName, Stats>();

  for (let trial = 0; trial < trials; trial++) {
    const problem = randomProblem(teamCount, roleWeights, trial + 1, rng);

    const results = ALGORITHM_NAMES.filter((name) =>
      ALGORITHMS[name].supports(problem),
    ).map((name) => {
      const start = performance.now();
      const assignment = ALGORITHMS[name].solve(problem);
      return {
        name,
        ms: performance.now() - start,
        metrics: evaluate(problem, assignment),
      };
    });

    const bestScore = Math.min(...results.map((r) => r.metrics.score));
    for (const { name, ms, metrics } of results) {
      const s = stats.get(name) ?? {
        score: 0,
        total: 0,
        role: 0,
        star: 0,
        ms: 0,
        wins: 0,
        runs: 0,
      };
      s.score += metrics.score;
      s.total += metrics.totalSpread;
      s.role += metrics.roleSpread;
      s.star += metrics.starSpread;
      s.ms += ms;
      s.wins += metrics.score <= bestScore + 1e-9 ? 1 : 0;
      s.runs += 1;
      stats.set(name, s);
    }
  }

  const weightsLabel = ROLES.map(
    (role) => `${role} x${roleWeights[role]}`,
  ).join(', ');
  console.log(
    `\n${teamCount} teams x 5 players, ${trials} random pools (${weightsLabel})`,
  );
  console.table(
    Object.fromEntries(
      [...stats].map(([name, s]) => [
        name,
        {
          'avg score': +(s.score / s.runs).toFixed(1),
          'avg total spread': +(s.total / s.runs).toFixed(1),
          'avg role spread': +(s.role / s.runs).toFixed(1),
          'avg star spread': +(s.star / s.runs).toFixed(1),
          'avg ms': +(s.ms / s.runs).toFixed(2),
          'best-or-tied': `${s.wins}/${s.runs}`,
        },
      ]),
    ),
  );
}

runConfig(2, 100);
runConfig(2, 100, { ...DEFAULT_ROLE_WEIGHTS, tank: 1.6 });
runConfig(4, 100);
runConfig(6, 50);
