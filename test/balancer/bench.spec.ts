import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
  planTeams,
  withBench,
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
import { buildBalanceResultEmbed } from '../../src/modules/balancer/views/balance-teams.view';

const service = new BalancerService();
const DUO: RoleComposition = { tank: 1, damage: 1, support: 0 };

function problemOf(
  rawPlayers: unknown[],
  {
    composition = DEFAULT_COMPOSITION,
    teamCount,
    roleWeights = DEFAULT_ROLE_WEIGHTS,
  }: {
    composition?: RoleComposition;
    teamCount?: number;
    roleWeights?: typeof DEFAULT_ROLE_WEIGHTS;
  } = {},
): BalancingProblem {
  return createProblem(balancerListSchema.parse(rawPlayers), {
    composition,
    teamCount,
    roleWeights,
    weights: DEFAULT_WEIGHTS,
    seed: 1,
  });
}

const flexPlayers = (count: number, prefix = 'p') =>
  Array.from({ length: count }, (_, i) => ({
    discordId: `${prefix}${i + 1}`,
    username: `${prefix}${i + 1}`,
    tank: 100 + i * 37,
    damage: 120 + i * 41,
    support: 90 + i * 29,
  }));

describe('planTeams', () => {
  const plan = (
    count: number,
    composition = DEFAULT_COMPOSITION,
    teamCount?: number,
  ) => planTeams(count, composition, teamCount);

  const cases: [number, number, number, boolean][] = [
    // players, teams, bench, enough (teams of five)
    [0, 2, 0, false],
    [1, 2, 0, false],
    [9, 2, 0, false],
    [10, 2, 0, true],
    [11, 2, 1, true],
    [12, 2, 2, true],
    [14, 2, 4, true],
    [15, 3, 0, true],
    [16, 3, 1, true],
    [19, 3, 4, true],
    [20, 4, 0, true],
    [21, 4, 1, true],
    [24, 4, 4, true],
    [25, 5, 0, true],
    [30, 6, 0, true],
    [49, 9, 4, true],
  ];
  for (const [players, teams, bench, enough] of cases) {
    it(`${players} players -> ${teams} teams of 5, ${bench} on the bench${enough ? '' : ' (not enough)'}`, () => {
      const result = plan(players);
      assert.equal(result.teamCount, teams);
      assert.equal(result.teamSize, 5);
      assert.equal(result.benchCount, bench);
      assert.equal(result.enough, enough);
    });
  }

  it('depends on the composition, not on a fixed team size', () => {
    const trio = { tank: 1, damage: 1, support: 1 };
    assert.deepEqual(plan(5, trio), {
      teamCount: 2,
      teamSize: 3,
      benchCount: 0,
      enough: false,
    });
    assert.deepEqual(plan(6, trio), {
      teamCount: 2,
      teamSize: 3,
      benchCount: 0,
      enough: true,
    });
    assert.deepEqual(plan(8, trio), {
      teamCount: 2,
      teamSize: 3,
      benchCount: 2,
      enough: true,
    });
    assert.deepEqual(plan(9, trio), {
      teamCount: 3,
      teamSize: 3,
      benchCount: 0,
      enough: true,
    });
    const big = { tank: 2, damage: 4, support: 4 };
    assert.deepEqual(plan(21, big), {
      teamCount: 2,
      teamSize: 10,
      benchCount: 1,
      enough: true,
    });
    assert.deepEqual(plan(19, big), {
      teamCount: 2,
      teamSize: 10,
      benchCount: 0,
      enough: false,
    });
    assert.equal(plan(30, big).teamCount, 3);
  });

  it('uses an explicit team count exactly and benches the rest', () => {
    assert.deepEqual(plan(20, DEFAULT_COMPOSITION, 2), {
      teamCount: 2,
      teamSize: 5,
      benchCount: 10,
      enough: true,
    });
    assert.deepEqual(plan(12, DEFAULT_COMPOSITION, 3), {
      teamCount: 3,
      teamSize: 5,
      benchCount: 0,
      enough: false,
    });
    assert.deepEqual(plan(15, DEFAULT_COMPOSITION, 3), {
      teamCount: 3,
      teamSize: 5,
      benchCount: 0,
      enough: true,
    });
  });

  it('never plans fewer than two teams', () => {
    for (let count = 0; count < 40; count++)
      assert.ok(plan(count).teamCount >= 2);
  });

  it('never leaves a whole team on the bench', () => {
    for (let count = 10; count < 200; count++) {
      const { benchCount, teamSize } = plan(count);
      assert.ok(benchCount < teamSize, `${count} players`);
    }
  });

  it('the service exposes the same plan', () => {
    assert.deepEqual(service.planTeams(12), plan(12));
    assert.deepEqual(service.planTeams(21), plan(21));
    assert.deepEqual(
      service.planTeams(8, { composition: { tank: 1, damage: 1, support: 1 } }),
      {
        teamCount: 2,
        teamSize: 3,
        benchCount: 2,
        enough: true,
      },
    );
    assert.equal(service.planTeams(30, { teamCount: 2 }).benchCount, 20);
  });
});

describe('createProblem with surplus players', () => {
  const values = [900, 100, 800, 200, 700, 300, 600, 400, 500, 1000, 50];
  const flexEleven = values.map((value, i) => ({
    discordId: `p${i}`,
    username: `p${i}`,
    tank: value,
    damage: value,
    support: value,
  }));

  it('derives the team count from the number of players', () => {
    assert.equal(problemOf(flexEleven).teamCount, 2);
    assert.equal(problemOf(flexEleven).slots.length, 10);
    const sixteen = flexPlayers(16);
    assert.equal(problemOf(sixteen).teamCount, 3);
    assert.equal(problemOf(sixteen, { teamCount: 2 }).teamCount, 2);
  });

  it('benches the weakest flex player for the simple algorithms', () => {
    const problem = problemOf(flexEleven);
    assert.deepEqual(problem.bench, [10], 'p10 has the lowest rating (50)');
    const pooled = ROLES.flatMap((role) => problem.rolePools[role]);
    assert.equal(pooled.length, 10);
    assert.ok(!pooled.includes(10));
  });

  it('keeps the role pools full and every player pooled or benched exactly once', () => {
    const problem = problemOf(flexEleven);
    assert.equal(problem.rolePools.tank.length, 2);
    assert.equal(problem.rolePools.damage.length, 4);
    assert.equal(problem.rolePools.support.length, 4);
    const all = [
      ...ROLES.flatMap((role) => problem.rolePools[role]),
      ...problem.bench,
    ].sort((a, b) => a - b);
    assert.deepEqual(
      all,
      flexEleven.map((_, i) => i),
    );
  });

  it('benches the weakest of an over-supplied single-role group', () => {
    const problem = problemOf([
      { discordId: 't1', username: 't1', tank: 100 },
      { discordId: 't2', username: 't2', tank: 300 },
      { discordId: 't3', username: 't3', tank: 200 },
      ...['d1', 'd2', 'd3', 'd4'].map((id) => ({
        discordId: id,
        username: id,
        damage: 500,
      })),
      ...['s1', 's2', 's3', 's4'].map((id) => ({
        discordId: id,
        username: id,
        support: 500,
      })),
    ]);
    assert.deepEqual(
      problem.bench.map((i) => problem.players[i].discordId),
      ['t1'],
    );
  });

  it('role weights decide who counts as weakest', () => {
    const players = [
      { discordId: 'x', username: 'x', tank: 500, damage: 100 },
      { discordId: 'y', username: 'y', tank: 200, damage: 400 },
      ...Array.from({ length: 9 }, (_, i) => ({
        discordId: `f${i}`,
        username: 'f',
        tank: 300,
        damage: 300,
        support: 300,
      })),
    ];
    const heavyTank = problemOf(players, {
      roleWeights: { tank: 5, damage: 1, support: 1 },
    });
    assert.equal(heavyTank.bench.length, 1);
    assert.ok(
      !heavyTank.bench.includes(0),
      'with tank x5, player x (tank 500) is too valuable to bench',
    );
  });

  it('withBench appends the bench to the placed players', () => {
    const problem = problemOf(flexEleven);
    assert.deepEqual(
      withBench(problem, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.deepEqual(withBench(problem, [1, 2], [7, 8]), [1, 2, 7, 8]);
  });

  it('has an empty bench when nobody is left over', () => {
    assert.deepEqual(problemOf(flexEleven.slice(0, 10)).bench, []);
  });

  it('still reports a missing role even when there are many players', () => {
    const players = [
      { discordId: 't1', username: 't1', tank: 5 },
      ...Array.from({ length: 11 }, (_, i) => ({
        discordId: `x${i}`,
        username: 'x',
        damage: 5,
        support: 5,
      })),
    ];
    assert.throws(
      () => problemOf(players),
      (error: unknown) => {
        assert.ok(error instanceof CoreError);
        assert.match(
          error.message,
          /Not enough players who can play tank: need 2, have 1/,
        );
        return true;
      },
    );
  });
});

describe('the bench in evaluation and keys', () => {
  const players = Array.from({ length: 6 }, (_, i) => ({
    discordId: `p${i}`,
    username: `p${i}`,
    tank: 100 * (i + 1),
    damage: 50 * (i + 1),
  }));
  const problem = problemOf(players, { composition: DUO, teamCount: 2 });
  // positions 0-3 are slots (team0 tank, team0 damage, team1 tank, team1 damage); 4-5 are the bench
  const base = [0, 1, 2, 3, 4, 5];

  it('has four slots and two benched players', () => {
    assert.equal(problem.slots.length, 4);
    assert.equal(problem.bench.length, 2);
  });

  it('scores only the slots: reordering the bench changes nothing', () => {
    assert.equal(
      evaluate(problem, [0, 1, 2, 3, 5, 4]).score,
      evaluate(problem, base).score,
    );
  });

  it('scores a substitution: swapping a player with a benched one changes the score', () => {
    assert.notEqual(
      evaluate(problem, [0, 1, 2, 4, 3, 5]).score,
      evaluate(problem, base).score,
    );
  });

  it('a benched player never makes an assignment invalid', () => {
    const noTank = [
      ...players.slice(0, 5),
      { discordId: 'x', username: 'x', damage: 1 },
    ];
    const p = problemOf(noTank, { composition: DUO, teamCount: 2 });
    assert.ok(
      Number.isFinite(evaluate(p, [0, 1, 2, 3, 4, 5]).score),
      'x (damage only) on the bench',
    );
    assert.equal(
      evaluate(p, [5, 1, 2, 3, 4, 0]).score,
      Infinity,
      'x in a tank slot',
    );
  });

  it('canonicalKey ignores the order of the bench but not who is on it', () => {
    assert.equal(
      canonicalKey(problem, [0, 1, 2, 3, 4, 5]),
      canonicalKey(problem, [0, 1, 2, 3, 5, 4]),
    );
    assert.notEqual(
      canonicalKey(problem, [0, 1, 2, 3, 4, 5]),
      canonicalKey(problem, [0, 1, 4, 5, 2, 3]),
    );
  });
});

// ---- an independent oracle that also chooses who sits out ----

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
  const byRole = new Map<string, number[]>(
    ROLES.map((role) => [role, new Array<number>(teamCount).fill(0)]),
  );

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
  const teams = problem.teamSlots
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
  const bench = perm
    .slice(problem.slots.length)
    .map((i) => problem.players[i].discordId)
    .sort()
    .join(',');
  return bench ? `${teams}#${bench}` : teams;
}

type Oracle = { best: number; within: Map<string, number> };
const oracleCache = new WeakMap<BalancingProblem, Map<number, Oracle>>();

function bruteForce(problem: BalancingProblem, tolerance: number): Oracle {
  let byTolerance = oracleCache.get(problem);
  if (!byTolerance)
    oracleCache.set(problem, (byTolerance = new Map<number, Oracle>()));
  let result = byTolerance.get(tolerance);
  if (!result)
    byTolerance.set(tolerance, (result = computeOracle(problem, tolerance)));
  return result;
}

function computeOracle(problem: BalancingProblem, tolerance: number): Oracle {
  const scored = permutations(problem.players.length)
    .map((perm) => ({
      key: keyOf(problem, perm),
      score: scoreOf(problem, perm),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  const best = Math.min(...scored.map((entry) => entry.score));
  const within = new Map<string, number>();
  for (const entry of scored)
    if (entry.score <= best + tolerance) within.set(entry.key, entry.score);
  return { best, within };
}

/** Tank/damage players with a small rating range, so that many splits tie. */
function duoPools(
  count: number,
  size: number,
  seed: number,
): BalancingProblem[] {
  const rng = createRng(seed);
  const pools: BalancingProblem[] = [];
  while (pools.length < count) {
    const raw = Array.from({ length: size }, (_, i) => {
      const roll = rng();
      return {
        discordId: `p${i}`,
        username: `p${i}`,
        ...(roll < 0.75 ? { tank: 1 + Math.floor(rng() * 5) } : {}),
        ...(roll > 0.25 ? { damage: 1 + Math.floor(rng() * 5) } : {}),
      };
    });
    try {
      pools.push(problemOf(raw, { composition: DUO, teamCount: 2 }));
    } catch (error) {
      if (!(error instanceof CoreError)) throw error;
    }
  }
  return pools;
}

const keysOf = (problem: BalancingProblem, variants: number[][]) =>
  new Set(variants.map((variant) => keyOf(problem, variant)));

describe('who sits out: algorithms against a brute-force oracle', () => {
  for (const size of [5, 6]) {
    const pools = duoPools(10, size, 100 + size);

    it(`exhaustive finds the true optimum with ${size - 4} on the bench (${pools.length} pools)`, () => {
      pools.forEach((problem, index) => {
        const { best } = bruteForce(problem, 0);
        assert.equal(
          evaluate(problem, ALGORITHMS.exhaustive.solve(problem)).score,
          best,
          `pool ${index}`,
        );
      });
    });

    for (const tolerance of [0, 2, 20]) {
      it(`exhaustive lists exactly the splits (bench included) within ${tolerance} of the best, ${size - 4} on the bench`, () => {
        pools.forEach((problem, index) => {
          const expected = bruteForce(problem, tolerance);
          const variants = ALGORITHMS.exhaustive.findVariants!(
            problem,
            tolerance,
          );
          const actual = keysOf(problem, variants);
          assert.equal(actual.size, variants.length, `pool ${index}: distinct`);
          assert.deepEqual(
            [...actual].sort(),
            [...expected.within.keys()].sort(),
            `pool ${index}`,
          );
        });
      });

      if (tolerance > 2) continue; // annealing variants: tighter tolerances only (slow)

      it(`annealing only lists valid splits within ${tolerance} of the best and finds the optimum, ${size - 4} on the bench`, () => {
        pools.forEach((problem, index) => {
          const { best, within } = bruteForce(problem, tolerance);
          const variants = ALGORITHMS['simulated-annealing'].findVariants!(
            problem,
            tolerance,
          );
          assert.equal(
            keysOf(problem, variants).size,
            variants.length,
            `pool ${index}: distinct`,
          );
          for (const variant of variants)
            assert.ok(within.has(keyOf(problem, variant)), `pool ${index}`);
          assert.equal(
            evaluate(problem, variants[0]).score,
            best,
            `pool ${index}: optimum`,
          );
        });
      });
    }

    it(`annealing finds the optimum bench choice with ${size - 4} on the bench`, () => {
      pools.forEach((problem, index) => {
        const { best } = bruteForce(problem, 0);
        assert.equal(
          evaluate(problem, ALGORITHMS['simulated-annealing'].solve(problem))
            .score,
          best,
          `pool ${index}`,
        );
      });
    });

    it(`the simple algorithms bench the weakest but stay valid, ${size - 4} on the bench`, () => {
      pools.forEach((problem, index) => {
        for (const name of ['snake-draft', 'greedy'] as const) {
          const assignment = ALGORITHMS[name].solve(problem);
          assert.equal(
            assignment.length,
            problem.players.length,
            `${name}, pool ${index}: full assignment`,
          );
          assert.ok(
            Number.isFinite(evaluate(problem, assignment).score),
            `${name}, pool ${index}: valid`,
          );
          assert.deepEqual(
            assignment.slice(problem.slots.length).sort((a, b) => a - b),
            [...problem.bench].sort((a, b) => a - b),
            `${name}, pool ${index}: bench is the role-pool leftover`,
          );
        }
      });
    });
  }

  it('choosing the bench can only help: annealing is never worse than greedy', () => {
    for (const problem of duoPools(8, 6, 42)) {
      const greedy = evaluate(problem, ALGORITHMS.greedy.solve(problem)).score;
      const annealing = evaluate(
        problem,
        ALGORITHMS['simulated-annealing'].solve(problem),
      ).score;
      assert.ok(annealing <= greedy + 1e-9);
    }
  });
});

describe('who sits out: the same people should not always miss out', () => {
  // Eleven equally strong flex players: every one of them is an equally good bench choice.
  const identical = Array.from({ length: 11 }, (_, i) => ({
    discordId: `p${i + 1}`,
    username: `p${i + 1}`,
    tank: 1000,
    damage: 1000,
    support: 1000,
  }));
  const players = balancerListSchema.parse(identical);
  const setup = resolveSetup(players);

  it('accurate mode is deterministic: the same player sits out every time', () => {
    const benches = new Set(
      [1, 2, 3, 4, 5].map(() =>
        service
          .balanceTeams(players, { algorithm: 'simulated-annealing' })
          .bench.map((p) => p.discordId)
          .join(','),
      ),
    );
    assert.equal(benches.size, 1);
  });

  it('varied mode rotates who sits out across seeds', () => {
    const sittingOut = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const result = service.balanceTeams(players, {
        algorithm: 'simulated-annealing',
        variety: { toleranceFactor: VARIETY_LEVELS.varied },
        seed,
      });
      assertValidResult(setup, result);
      assert.equal(result.bench.length, 1);
      sittingOut.add(result.bench[0].discordId);
    }
    assert.ok(
      sittingOut.size >= 3,
      `only ${sittingOut.size} different players ever sat out`,
    );
  });

  it('every variant is a distinct combination of teams and bench', () => {
    const problem = problemOf(identical);
    const variants = ALGORITHMS['simulated-annealing'].findVariants!(
      problem,
      0,
    );
    assert.ok(variants.length > 1);
    const keys = new Set(
      variants.map((variant) => canonicalKey(problem, variant)),
    );
    assert.equal(keys.size, variants.length);
    const benches = new Set(
      variants.map((variant) => variant[problem.slots.length]),
    );
    assert.ok(benches.size > 1, 'variants differ in who is benched');
  });

  it('without a seed, repeated varied runs are not always the same', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = service.balanceTeams(players, {
        algorithm: 'simulated-annealing',
        variety: { toleranceFactor: VARIETY_LEVELS.wide },
      });
      outcomes.add(splitKey(result));
    }
    assert.ok(outcomes.size > 1);
  });
});

describe('BalancerService with surplus players', () => {
  const rng = createRng(909);
  let pool = balancerListSchema.parse(randomRawPool(rng, 13));
  while (true) {
    try {
      service.balanceTeams(pool, { algorithm: 'greedy' });
      break;
    } catch (error) {
      if (!(error instanceof InvalidBalancerInputError)) throw error;
      pool = balancerListSchema.parse(randomRawPool(rng, 13));
    }
  }

  it('forms two teams from thirteen players and benches three', () => {
    for (const algorithm of [
      'snake-draft',
      'greedy',
      'simulated-annealing',
    ] as const) {
      const result = service.balanceTeams(pool, { algorithm });
      assert.equal(result.teams.length, 2);
      assert.equal(result.bench.length, 3);
      assertValidResult(resolveSetup(pool), result);
    }
  });

  it('exhaustive refuses a pool this large instead of running for minutes', () => {
    assert.throws(
      () => service.balanceTeams(pool, { algorithm: 'exhaustive' }),
      /cannot handle a pool of this size/,
    );
  });

  it('an explicit team count that fits is honoured and benches the rest', () => {
    const result = service.balanceTeams(pool, {
      algorithm: 'greedy',
      teamCount: 2,
    });
    assert.equal(result.teams.length, 2);
    assert.equal(result.bench.length, 3);
  });

  it('an explicit team count that does not fit is an error', () => {
    assert.throws(
      () => service.balanceTeams(pool, { algorithm: 'greedy', teamCount: 3 }),
      /Not enough players for 3 teams of 5: need at least 15, got 13/,
    );
  });

  it('a result never lists a player twice or loses one', () => {
    const result = service.balanceTeams(pool, {
      algorithm: 'simulated-annealing',
    });
    const ids = [
      ...result.teams.flatMap((team) =>
        team.slots.map((slot) => slot.player.discordId),
      ),
      ...result.bench.map((player) => player.discordId),
    ].sort();
    assert.deepEqual(ids, pool.map((player) => player.discordId).sort());
  });

  it('adding spare players never makes the best result worse', () => {
    const rng2 = createRng(3);
    let checked = 0;
    while (checked < 6) {
      const eleven = balancerListSchema.parse(randomRawPool(rng2, 11));
      let full;
      let fewer;
      try {
        full = service.balanceTeams(eleven, {
          algorithm: 'exhaustive',
          teamCount: 2,
        });
        fewer = service.balanceTeams(eleven.slice(0, 10), {
          algorithm: 'exhaustive',
          teamCount: 2,
        });
      } catch (error) {
        if (!(error instanceof InvalidBalancerInputError)) throw error;
        continue;
      }
      assert.ok(
        full.metrics.score <= fewer.metrics.score + 1e-9,
        'one more player, at least as good',
      );
      checked++;
    }
  });
});

describe('many teams (4 to 8)', () => {
  const rng = createRng(2026);
  const feasible = (size: number) => {
    for (;;) {
      const players = balancerListSchema.parse(randomRawPool(rng, size));
      try {
        service.balanceTeams(players, { algorithm: 'greedy' });
        return players;
      } catch (error) {
        if (!(error instanceof InvalidBalancerInputError)) throw error;
      }
    }
  };

  for (const size of [20, 25, 30, 32, 35, 40]) {
    it(`${size} players: valid results and a Discord-sized embed in every mode`, () => {
      const players = feasible(size);
      const plan = service.planTeams(size);
      assert.equal(plan.teamCount, Math.floor(size / 5));

      for (const mode of ['accurate', 'varied', 'wide'] as const) {
        const result = service.balanceTeams(players, {
          algorithm: 'simulated-annealing',
          ...(mode === 'accurate'
            ? {}
            : { variety: { toleranceFactor: VARIETY_LEVELS[mode] } }),
          seed: 3,
        });
        assert.equal(result.teams.length, plan.teamCount);
        assert.equal(result.bench.length, plan.benchCount);
        assertValidResult(resolveSetup(players), result);

        const embed = buildBalanceResultEmbed(result, {
          algorithm: 'simulated-annealing',
          mode,
        }).toJSON();
        const fields = embed.fields ?? [];
        assert.ok(fields.length <= 25, 'at most 25 embed fields');
        assert.ok(
          fields.every((f) => f.value.length <= 1024),
          'field values fit',
        );
        assert.ok(JSON.stringify(embed).length < 6000, 'the whole embed fits');
      }
    });
  }
});
