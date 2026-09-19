import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { ALGORITHMS } from '../../src/modules/balancer/algorithms';
import {
  DEFAULT_COMPOSITION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_WEIGHTS,
  ROLES,
  VARIETY_LEVELS,
  type RoleComposition,
} from '../../src/modules/balancer/balancer.constants';
import {
  BalancerService,
  InvalidBalancerInputError,
} from '../../src/modules/balancer/balancer.service';
import { InvalidBalancerInputError as CoreError } from '../../src/modules/balancer/core/errors';
import { evaluate } from '../../src/modules/balancer/core/evaluate';
import {
  createProblem,
  type BalancingProblem,
} from '../../src/modules/balancer/core/problem';
import { canonicalKey } from '../../src/modules/balancer/core/variant-collector';
import { balancerListSchema } from '../../src/modules/balancer/dto/balancer-input.schema';
import {
  assertValidResult,
  resolveSetup,
  splitKey,
} from './helpers/invariants';
import { createRng, randomRawPool } from './helpers/random-pool';

const service = new BalancerService();
const SMALL: RoleComposition = { tank: 1, damage: 1, support: 1 };

function problemOf(
  rawPlayers: unknown[],
  composition: RoleComposition = DEFAULT_COMPOSITION,
  teamCount = 2,
): BalancingProblem {
  return createProblem(balancerListSchema.parse(rawPlayers), {
    composition,
    teamCount,
    roleWeights: DEFAULT_ROLE_WEIGHTS,
    weights: DEFAULT_WEIGHTS,
    seed: 1,
  });
}

// ---- an independent oracle: try every placement of players into slots ----

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((rest) =>
    Array.from({ length: n }, (_, i) => [
      ...rest.slice(0, i),
      n - 1,
      ...rest.slice(i),
    ]),
  );
}

function scoreOf(problem: BalancingProblem, perm: number[]): number {
  const { players, slots, teamCount } = problem;
  const totals = new Array<number>(teamCount).fill(0);
  const stars = new Array<number>(teamCount).fill(0);
  const byRole = new Map<string, number[]>();
  for (const role of ROLES)
    byRole.set(role, new Array<number>(teamCount).fill(0));

  for (let s = 0; s < slots.length; s++) {
    const rating = players[perm[s]][slots[s].role];
    if (rating === undefined) return Infinity;
    totals[slots[s].team] += rating;
    byRole.get(slots[s].role)![slots[s].team] += rating;
    stars[slots[s].team] = Math.max(stars[slots[s].team], rating);
  }
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  return (
    DEFAULT_WEIGHTS.total * spread(totals) +
    DEFAULT_WEIGHTS.role *
      ROLES.reduce((sum, role) => sum + spread(byRole.get(role)!), 0) +
    DEFAULT_WEIGHTS.star * spread(stars)
  );
}

function keyOf(problem: BalancingProblem, perm: number[]): string {
  return problem.teamSlots
    .map((slotIndices) =>
      ROLES.map((role) =>
        slotIndices
          .filter((s) => problem.slots[s].role === role)
          .map((s) => problem.players[perm[s]].discordId)
          .sort()
          .join(','),
      ).join('|'),
    )
    .sort()
    .join('/');
}

function bruteForce(problem: BalancingProblem, tolerance: number) {
  const scored = permutations(problem.slots.length)
    .map((perm) => ({
      key: keyOf(problem, perm),
      score: scoreOf(problem, perm),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  const best = Math.min(...scored.map((entry) => entry.score));
  const within = new Map<string, number>();
  for (const entry of scored) {
    if (entry.score <= best + tolerance) within.set(entry.key, entry.score);
  }
  return { best, within };
}

function keysOf(problem: BalancingProblem, variants: number[][]): Set<string> {
  return new Set(variants.map((variant) => keyOf(problem, variant)));
}

/** Six-player pools with a small rating range, so that many splits tie. */
function smallPools(count: number, seed: number): BalancingProblem[] {
  const rng = createRng(seed);
  const pools: BalancingProblem[] = [];
  while (pools.length < count) {
    const raw = randomRawPool(rng, 6).map((p) => {
      const small: Record<string, unknown> = { ...p };
      for (const role of ROLES) {
        if (
          typeof small[role] === 'string' ||
          typeof small[role] === 'number'
        ) {
          small[role] = 1 + Math.floor(rng() * 4);
        }
      }
      return small;
    });
    try {
      pools.push(problemOf(raw, SMALL));
    } catch (error) {
      if (!(error instanceof CoreError)) throw error;
    }
  }
  return pools;
}

describe('exhaustive variants against a brute-force oracle', () => {
  const pools = smallPools(25, 314);

  for (const tolerance of [0, 1, 2, 5, 20, Infinity]) {
    it(`finds exactly the splits within tolerance ${tolerance} on ${pools.length} pools`, () => {
      pools.forEach((problem, index) => {
        const expected = bruteForce(problem, tolerance);
        const variants = ALGORITHMS.exhaustive.findVariants!(
          problem,
          tolerance,
        );
        const actual = keysOf(problem, variants);

        assert.equal(
          variants.length,
          actual.size,
          `pool ${index}: variants are distinct`,
        );
        assert.deepEqual(
          [...actual].sort(),
          [...expected.within.keys()].sort(),
          `pool ${index}, tolerance ${tolerance}`,
        );
      });
    });
  }

  it('lists variants best first, starting at the true optimum', () => {
    for (const problem of pools) {
      const variants = ALGORITHMS.exhaustive.findVariants!(problem, 5);
      const scores = variants.map(
        (variant) => evaluate(problem, variant).score,
      );
      assert.deepEqual(
        scores,
        [...scores].sort((a, b) => a - b),
      );
      assert.equal(scores[0], bruteForce(problem, 0).best);
    }
  });

  it('never returns fewer variants for a larger tolerance', () => {
    for (const problem of pools) {
      const counts = [0, 1, 2, 5, 20, Infinity].map(
        (tolerance) =>
          ALGORITHMS.exhaustive.findVariants!(problem, tolerance).length,
      );
      for (let i = 1; i < counts.length; i++)
        assert.ok(counts[i] >= counts[i - 1]);
    }
  });

  it('agrees with solve() on the best score', () => {
    for (const problem of pools) {
      const best = evaluate(
        problem,
        ALGORITHMS.exhaustive.solve(problem),
      ).score;
      const first = ALGORITHMS.exhaustive.findVariants!(problem, 0)[0];
      assert.equal(evaluate(problem, first).score, best);
    }
  });
});

describe('annealing variants', () => {
  const pools = smallPools(25, 271);

  for (const tolerance of [0, 2, 20]) {
    it(`only returns valid, distinct splits within tolerance ${tolerance} of the optimum`, () => {
      pools.forEach((problem, index) => {
        const { best, within } = bruteForce(problem, tolerance);
        const variants = ALGORITHMS['simulated-annealing'].findVariants!(
          problem,
          tolerance,
        );
        const keys = keysOf(problem, variants);

        assert.equal(keys.size, variants.length, `pool ${index}: distinct`);
        assert.ok(variants.length >= 1, `pool ${index}: at least one variant`);
        for (const variant of variants) {
          const score = scoreOf(problem, variant);
          assert.ok(Number.isFinite(score), `pool ${index}: valid`);
          assert.ok(
            score <= best + tolerance + 1e-9,
            `pool ${index}: within tolerance`,
          );
          assert.ok(within.has(keyOf(problem, variant)));
        }
        assert.equal(
          evaluate(problem, variants[0]).score,
          best,
          `pool ${index}: finds the optimum`,
        );
      });
    });

    // Annealing samples the near-optimal splits (then walks across equally good
    // ones); only exhaustive is guaranteed complete. This guards the coverage.
    it(`finds nearly all splits within tolerance ${tolerance} on tiny pools`, () => {
      let found = 0;
      let total = 0;
      let complete = 0;
      for (const problem of pools) {
        const { within } = bruteForce(problem, tolerance);
        const keys = keysOf(
          problem,
          ALGORITHMS['simulated-annealing'].findVariants!(problem, tolerance),
        );
        const hit = [...keys].filter((key) => within.has(key)).length;
        found += hit;
        total += within.size;
        if (hit === within.size) complete++;
      }
      assert.ok(found / total >= 0.95, `coverage ${found}/${total}`);
      assert.ok(
        complete >= pools.length - 3,
        `only ${complete}/${pools.length} pools fully covered`,
      );
    });
  }
});

describe('exact variant counts', () => {
  const duo: RoleComposition = { tank: 1, damage: 1, support: 0 };
  const identical = ['a', 'b', 'c', 'd'].map((id) => ({
    discordId: id,
    username: id,
    tank: 1000,
    damage: 1000,
  }));

  it('four identical duo players have 3 splits x 2 x 2 role placements = 12 variants', () => {
    const problem = problemOf(identical, duo);
    const exhaustive = ALGORITHMS.exhaustive.findVariants!(problem, 0);
    const annealing = ALGORITHMS['simulated-annealing'].findVariants!(
      problem,
      0,
    );

    assert.equal(exhaustive.length, 12);
    assert.equal(keysOf(problem, exhaustive).size, 12);
    assert.deepEqual(
      [...keysOf(problem, annealing)].sort(),
      [...keysOf(problem, exhaustive)].sort(),
    );
  });

  it('two teams of three identical flex players have 10 splits x 6 x 6 = 360 variants', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
      discordId: id,
      username: id,
      tank: 500,
      damage: 500,
      support: 500,
    }));
    const problem = problemOf(six, SMALL);
    assert.equal(
      ALGORITHMS.exhaustive.findVariants!(problem, 0).length,
      10 * 6 * 6,
    );
  });

  it('a pool whose best split is unique reports exactly one variant at tolerance 0', () => {
    const candidates = smallPools(80, 555);
    const problem = candidates.find(
      (candidate) => bruteForce(candidate, 0).within.size === 1,
    );
    assert.ok(
      problem,
      'a pool with a unique optimum exists among the candidates',
    );

    for (const algorithm of [
      ALGORITHMS.exhaustive,
      ALGORITHMS['simulated-annealing'],
    ]) {
      const variants = algorithm.findVariants!(problem, 0);
      assert.equal(variants.length, 1, algorithm.name);
      assert.equal(
        canonicalKey(problem, variants[0]),
        canonicalKey(problem, ALGORITHMS.exhaustive.solve(problem)),
      );
    }
  });

  it('two mirrored role placements of the same split count as two variants', () => {
    const problem = problemOf(
      [
        { discordId: 'a', username: 'a', tank: 1000, damage: 100 },
        { discordId: 'b', username: 'b', tank: 900, damage: 200 },
        { discordId: 'c', username: 'c', tank: 100, damage: 1000 },
        { discordId: 'd', username: 'd', tank: 200, damage: 900 },
      ],
      duo,
    );
    const variants = ALGORITHMS.exhaustive.findVariants!(problem, 0);
    assert.equal(variants.length, 2);
    assert.equal(keysOf(problem, variants).size, 2);
  });

  it('caps the number of variants returned', () => {
    const flex = Array.from({ length: 10 }, (_, i) => ({
      discordId: `p${i}`,
      username: `p${i}`,
      tank: 700,
      damage: 700,
      support: 700,
    }));
    const problem = problemOf(flex);
    // 126 splits x 30 x 30 role placements = 113,400 equally good splits
    const variants = ALGORITHMS.exhaustive.findVariants!(problem, 0);
    assert.equal(variants.length, 10_000);
    assert.equal(keysOf(problem, variants).size, 10_000);
    assert.ok(
      variants.every((variant) => evaluate(problem, variant).score === 0),
    );
  });
});

describe('BalancerService variety mode', () => {
  const rng = createRng(4242);
  let players = balancerListSchema.parse(randomRawPool(rng, 10));
  // keep drawing until the pool can be balanced
  while (true) {
    try {
      service.balanceTeams(players);
      break;
    } catch (error) {
      if (!(error instanceof InvalidBalancerInputError)) throw error;
      players = balancerListSchema.parse(randomRawPool(rng, 10));
    }
  }
  const setup = resolveSetup(players);
  const algorithms = ['exhaustive', 'simulated-annealing'] as const;

  for (const algorithm of algorithms) {
    it(`${algorithm}: returns a valid result plus variety info`, () => {
      const result = service.balanceTeams(players, {
        algorithm,
        variety: {},
        seed: 7,
      });
      assertValidResult(setup, result);
      assert.ok(result.variety);
      assert.ok(result.variety.count >= 1);
      assert.ok(result.variety.tolerance > 0);
      assert.ok(
        result.metrics.score <=
          result.variety.bestScore + result.variety.tolerance + 1e-9,
      );
      assert.ok(result.metrics.score >= result.variety.bestScore - 1e-9);
    });

    it(`${algorithm}: bestScore is the best the algorithm finds`, () => {
      const varied = service.balanceTeams(players, {
        algorithm,
        variety: {},
        seed: 1,
      });
      const accurate = service.balanceTeams(players, { algorithm });
      assert.equal(varied.variety!.bestScore, accurate.metrics.score);
    });

    it(`${algorithm}: the same seed repeats the same pick`, () => {
      const picks = [1, 2, 3].map(() =>
        splitKey(
          service.balanceTeams(players, { algorithm, variety: {}, seed: 99 }),
        ),
      );
      assert.equal(new Set(picks).size, 1);
    });

    it(`${algorithm}: different seeds explore the variants`, () => {
      const wide = { toleranceFactor: VARIETY_LEVELS.wide };
      const first = service.balanceTeams(players, {
        algorithm,
        variety: wide,
        seed: 1,
      });
      if (first.variety!.count === 1) return;

      const seen = new Set<string>();
      for (let seed = 1; seed <= 80; seed++) {
        const result = service.balanceTeams(players, {
          algorithm,
          variety: wide,
          seed,
        });
        assertValidResult(setup, result);
        seen.add(splitKey(result));
      }
      assert.ok(
        seen.size > 1,
        `only ${seen.size} distinct pick(s) across 80 seeds`,
      );
      assert.ok(seen.size <= first.variety!.count);
    });

    it(`${algorithm}: without a seed the pick follows Math.random`, () => {
      const wide = { toleranceFactor: 0.5 };
      const first = service.balanceTeams(players, {
        algorithm,
        variety: wide,
        seed: 1,
      });
      const count = first.variety!.count;
      if (count < 2) return;

      const mocked = mock.method(Math, 'random', () => 0);
      try {
        const lowest = service.balanceTeams(players, {
          algorithm,
          variety: wide,
        });
        mocked.mock.mockImplementation(() => 0.999999);
        const highest = service.balanceTeams(players, {
          algorithm,
          variety: wide,
        });

        assert.equal(
          lowest.metrics.score,
          lowest.variety!.bestScore,
          'random 0 picks the best variant',
        );
        assert.ok(highest.metrics.score >= lowest.metrics.score);
        assert.notEqual(splitKey(lowest), splitKey(highest));
      } finally {
        mocked.mock.restore();
      }
    });
  }

  it('the default tolerance is a share of the average best-role rating', () => {
    const meanBest =
      players.reduce(
        (sum, p) => sum + Math.max(...ROLES.map((role) => p[role] ?? 0)),
        0,
      ) / players.length;

    const varied = service.balanceTeams(players, {
      algorithm: 'exhaustive',
      variety: {},
      seed: 1,
    });
    const wide = service.balanceTeams(players, {
      algorithm: 'exhaustive',
      variety: { toleranceFactor: VARIETY_LEVELS.wide },
      seed: 1,
    });

    assert.ok(
      Math.abs(varied.variety!.tolerance - meanBest * VARIETY_LEVELS.varied) <
        1e-6,
    );
    assert.ok(
      Math.abs(wide.variety!.tolerance - meanBest * VARIETY_LEVELS.wide) < 1e-6,
    );
    assert.ok(
      wide.variety!.count >= varied.variety!.count,
      'more room, at least as many variants',
    );
  });

  it('a tolerance of zero keeps only the best splits', () => {
    const result = service.balanceTeams(players, {
      algorithm: 'exhaustive',
      variety: { toleranceFactor: 1e-12 },
      seed: 3,
    });
    assert.ok(
      Math.abs(result.metrics.score - result.variety!.bestScore) < 1e-6,
    );
  });

  for (const algorithm of ['snake-draft', 'greedy'] as const) {
    it(`${algorithm} cannot produce varied results`, () => {
      assert.throws(
        () => service.balanceTeams(players, { algorithm, variety: {} }),
        (error: unknown) => {
          assert.ok(error instanceof InvalidBalancerInputError);
          assert.match(error.message, /cannot produce varied results/);
          return true;
        },
      );
    });
  }

  it('advertises which algorithms support variety', () => {
    const support = Object.fromEntries(
      service.listAlgorithms().map((a) => [a.name, a.supportsVariety]),
    );
    assert.deepEqual(support, {
      'snake-draft': false,
      greedy: false,
      exhaustive: true,
      'simulated-annealing': true,
    });
  });

  it('works for bigger pools with the annealing algorithm', () => {
    const rngBig = createRng(77);
    let checked = 0;
    while (checked < 3) {
      const big = balancerListSchema.parse(randomRawPool(rngBig, 15));
      try {
        const result = service.balanceTeams(big, {
          algorithm: 'simulated-annealing',
          teamCount: 3,
          variety: { toleranceFactor: VARIETY_LEVELS.wide },
          seed: 5,
        });
        assertValidResult(resolveSetup(big, { teamCount: 3 }), result);
        assert.ok(result.variety!.count >= 1);
        checked++;
      } catch (error) {
        if (!(error instanceof InvalidBalancerInputError)) throw error;
      }
    }
  });
});
