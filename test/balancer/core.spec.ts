import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_COMPOSITION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_WEIGHTS,
  ROLES,
  type RoleComposition,
  type RoleWeights,
} from '../../src/modules/balancer/balancer.constants';
import { InvalidBalancerInputError } from '../../src/modules/balancer/core/errors';
import { evaluate } from '../../src/modules/balancer/core/evaluate';
import { solveAssignment } from '../../src/modules/balancer/core/hungarian';
import {
  createProblem,
  type BalancingProblem,
} from '../../src/modules/balancer/core/problem';
import { createRng } from '../../src/modules/balancer/core/rng';
import { canonicalKey } from '../../src/modules/balancer/core/variant-collector';
import { balancerListSchema } from '../../src/modules/balancer/dto/balancer-input.schema';

function problemOf(
  rawPlayers: unknown[],
  {
    composition = DEFAULT_COMPOSITION,
    teamCount = 2,
    roleWeights = DEFAULT_ROLE_WEIGHTS,
  }: {
    composition?: RoleComposition;
    teamCount?: number;
    roleWeights?: RoleWeights;
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

describe('hungarian assignment', () => {
  it('solves a known 3x3 example', () => {
    // Optimal: row0->col1 (1), row1->col0 (2), row2->col2 (2) = 5
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    const cols = solveAssignment(cost);
    const total = cols.reduce((sum, col, row) => sum + cost[row][col], 0);
    assert.equal(total, 5);
    assert.equal(new Set(cols).size, 3, 'each column is used once');
  });

  it('returns an empty assignment for an empty matrix', () => {
    assert.deepEqual(solveAssignment([]), []);
  });

  it('handles a single cell', () => {
    assert.deepEqual(solveAssignment([[7]]), [0]);
  });

  it('handles negative costs', () => {
    const cols = solveAssignment([
      [-5, -1],
      [-2, -9],
    ]);
    assert.deepEqual(cols, [0, 1]);
  });

  it('matches brute force on random square matrices', () => {
    const rng = createRng(11);
    for (let round = 0; round < 60; round++) {
      const n = 1 + Math.floor(rng() * 6);
      const cost = Array.from({ length: n }, () =>
        Array.from({ length: n }, () => Math.floor(rng() * 200) - 50),
      );

      const cols = solveAssignment(cost);
      const got = cols.reduce((sum, col, row) => sum + cost[row][col], 0);
      const best = Math.min(
        ...permutations(n).map((perm) =>
          perm.reduce((sum, col, row) => sum + cost[row][col], 0),
        ),
      );

      assert.equal(new Set(cols).size, n, 'a valid permutation');
      assert.equal(got, best, `n=${n} round=${round}`);
    }
  });

  it('matches brute force on rectangular matrices (more columns than rows)', () => {
    const rng = createRng(12);
    for (let round = 0; round < 40; round++) {
      const rows = 2 + Math.floor(rng() * 3);
      const cols = rows + 1 + Math.floor(rng() * 2);
      const cost = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => Math.floor(rng() * 100)),
      );

      const chosen = solveAssignment(cost);
      const got = chosen.reduce((sum, col, row) => sum + cost[row][col], 0);
      const best = Math.min(
        ...permutations(cols).map((perm) =>
          Array.from({ length: rows }, (_, row) => cost[row][perm[row]]).reduce(
            (a, b) => a + b,
            0,
          ),
        ),
      );

      assert.equal(new Set(chosen).size, rows);
      assert.equal(got, best, `rows=${rows} cols=${cols} round=${round}`);
    }
  });

  it('avoids forbidden (huge-cost) cells when a valid assignment exists', () => {
    const BIG = 1e9;
    const cols = solveAssignment([
      [BIG, 3, BIG],
      [BIG, BIG, 4],
      [1, BIG, BIG],
    ]);
    assert.deepEqual(cols, [1, 2, 0]);
  });
});

describe('seeded random numbers', () => {
  it('repeat for the same seed and differ between seeds', () => {
    const a = createRng(5);
    const b = createRng(5);
    const c = createRng(6);
    const sequenceA = Array.from({ length: 20 }, () => a());
    const sequenceB = Array.from({ length: 20 }, () => b());
    const sequenceC = Array.from({ length: 20 }, () => c());
    assert.deepEqual(sequenceA, sequenceB);
    assert.notDeepEqual(sequenceA, sequenceC);
  });

  it('stay within [0, 1) and look uniform', () => {
    const rng = createRng(99);
    const values = Array.from({ length: 5000 }, () => rng());
    assert.ok(values.every((v) => v >= 0 && v < 1));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    assert.ok(Math.abs(mean - 0.5) < 0.03, `mean ${mean}`);
    const buckets = new Array(10).fill(0) as number[];
    for (const v of values) buckets[Math.floor(v * 10)]++;
    for (const count of buckets)
      assert.ok(count > 380 && count < 620, `bucket ${count}`);
  });
});

describe('createProblem', () => {
  const flexTen = Array.from({ length: 10 }, (_, i) => ({
    discordId: `p${i}`,
    username: `p${i}`,
    tank: 100 + i,
    damage: 200 + i,
    support: 300 + i,
  }));

  it('lays out slots team by team in role order', () => {
    const problem = problemOf(flexTen);
    assert.equal(problem.teamSize, 5);
    assert.equal(problem.slots.length, 10);
    assert.deepEqual(
      problem.slots.slice(0, 5).map((s) => `${s.team}:${s.role}`),
      ['0:tank', '0:damage', '0:damage', '0:support', '0:support'],
    );
    assert.deepEqual(problem.teamSlots, [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
    ]);
  });

  it('builds role pools with exactly the slots that need filling', () => {
    const problem = problemOf(flexTen);
    assert.equal(problem.rolePools.tank.length, 2);
    assert.equal(problem.rolePools.damage.length, 4);
    assert.equal(problem.rolePools.support.length, 4);

    const all = ROLES.flatMap((role) => problem.rolePools[role]).sort(
      (a, b) => a - b,
    );
    assert.deepEqual(
      all,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      'every player in exactly one pool',
    );
  });

  it('puts single-role players into their only pool', () => {
    const problem = problemOf([
      { discordId: 't1', username: 't1', tank: 5 },
      { discordId: 't2', username: 't2', tank: 5 },
      ...['d1', 'd2', 'd3', 'd4'].map((id) => ({
        discordId: id,
        username: id,
        damage: 5,
      })),
      ...['s1', 's2', 's3', 's4'].map((id) => ({
        discordId: id,
        username: id,
        support: 5,
      })),
    ]);
    const idsIn = (role: (typeof ROLES)[number]) =>
      problem.rolePools[role].map((i) => problem.players[i].discordId).sort();
    assert.deepEqual(idsIn('tank'), ['t1', 't2']);
    assert.deepEqual(idsIn('damage'), ['d1', 'd2', 'd3', 'd4']);
    assert.deepEqual(idsIn('support'), ['s1', 's2', 's3', 's4']);
  });

  it('uses a flex player where the role-weighted rating is highest', () => {
    const players = [
      { discordId: 'x', username: 'x', tank: 1000, damage: 1200 },
      { discordId: 't2', username: 't2', tank: 100 },
      { discordId: 'y', username: 'y', tank: 100, damage: 100 },
      ...['d1', 'd2', 'd3'].map((id) => ({
        discordId: id,
        username: id,
        damage: 500,
      })),
      ...['s1', 's2', 's3', 's4'].map((id) => ({
        discordId: id,
        username: id,
        support: 500,
      })),
    ];
    const plain = problemOf(players);
    const heavyTank = problemOf(players, {
      roleWeights: { tank: 3, damage: 1, support: 1 },
    });
    const roleOfX = (problem: BalancingProblem) =>
      ROLES.find((role) =>
        problem.rolePools[role].some(
          (i) => problem.players[i].discordId === 'x',
        ),
      );
    assert.equal(roleOfX(plain), 'damage', 'x prefers damage (1200 > 1000)');
    assert.equal(
      roleOfX(heavyTank),
      'tank',
      'with tank x3, x is worth more as a tank',
    );
  });

  const rejected: [string, () => unknown, RegExp][] = [
    [
      'wrong player count',
      () => problemOf(flexTen.slice(0, 8)),
      /Expected 10 players \(2 teams x 5\), got 8/,
    ],
    [
      'team count 1',
      () => problemOf(flexTen, { teamCount: 1 }),
      /teamCount must be an integer >= 2/,
    ],
    [
      'fractional team count',
      () => problemOf(flexTen, { teamCount: 2.5 }),
      /teamCount must be an integer >= 2/,
    ],
    [
      'negative composition',
      () =>
        problemOf(flexTen, {
          composition: { tank: -1, damage: 3, support: 3 },
        }),
      /non-negative integer/,
    ],
    [
      'fractional composition',
      () =>
        problemOf(flexTen, {
          composition: { tank: 1, damage: 2.5, support: 2 },
        }),
      /non-negative integer/,
    ],
    [
      'empty composition',
      () =>
        problemOf(flexTen, { composition: { tank: 0, damage: 0, support: 0 } }),
      /Team composition is empty/,
    ],
    [
      'zero role weight',
      () =>
        problemOf(flexTen, { roleWeights: { tank: 0, damage: 1, support: 1 } }),
      /must be a positive number/,
    ],
    [
      'negative role weight',
      () =>
        problemOf(flexTen, {
          roleWeights: { tank: 1, damage: -1, support: 1 },
        }),
      /must be a positive number/,
    ],
    [
      'infinite role weight',
      () =>
        problemOf(flexTen, {
          roleWeights: { tank: Infinity, damage: 1, support: 1 },
        }),
      /must be a positive number/,
    ],
    [
      'NaN role weight',
      () =>
        problemOf(flexTen, {
          roleWeights: { tank: NaN, damage: 1, support: 1 },
        }),
      /must be a positive number/,
    ],
  ];
  for (const [label, run, message] of rejected) {
    it(`rejects ${label}`, () => {
      assert.throws(run, (error: unknown) => {
        assert.ok(error instanceof InvalidBalancerInputError);
        assert.match(error.message, message);
        return true;
      });
    });
  }
});

describe('evaluate', () => {
  const duoPlayers = [
    { discordId: 'a', username: 'a', tank: 1000, damage: 500 },
    { discordId: 'b', username: 'b', tank: 800, damage: 900 },
    { discordId: 'c', username: 'c', tank: 600, damage: 700 },
    { discordId: 'd', username: 'd', tank: 1200, damage: 300 },
  ];
  const duo = { composition: { tank: 1, damage: 1, support: 0 } };
  // slots: 0 = team0 tank, 1 = team0 damage, 2 = team1 tank, 3 = team1 damage
  const assignment = [0, 1, 3, 2]; // team0: a tank + b damage; team1: d tank + c damage

  it('computes every metric by hand', () => {
    const metrics = evaluate(problemOf(duoPlayers, duo), assignment);
    assert.deepEqual(metrics.teamTotals, [1900, 1900]);
    assert.equal(metrics.totalSpread, 0);
    assert.equal(metrics.roleSpread, 400, 'tank 200 + damage 200 + support 0');
    assert.equal(metrics.starSpread, 200, 'stars 1000 vs 1200');
    assert.equal(metrics.score, 0 + 400 + 0.5 * 200);
  });

  it('applies role weights to every metric', () => {
    const metrics = evaluate(
      problemOf(duoPlayers, {
        ...duo,
        roleWeights: { tank: 2, damage: 1, support: 1 },
      }),
      assignment,
    );
    assert.deepEqual(metrics.teamTotals, [2900, 3100]);
    assert.equal(metrics.totalSpread, 200);
    assert.equal(
      metrics.roleSpread,
      400 + 200,
      'tank 2000 vs 2400, damage 900 vs 700',
    );
    assert.equal(metrics.starSpread, 400, 'stars 2000 vs 2400');
    assert.equal(metrics.score, 200 + 600 + 0.5 * 400);
  });

  it('scores a perfectly mirrored assignment as zero', () => {
    const twins = [
      { discordId: 'a', username: 'a', tank: 900, damage: 400 },
      { discordId: 'b', username: 'b', tank: 900, damage: 400 },
      { discordId: 'c', username: 'c', tank: 500, damage: 700 },
      { discordId: 'd', username: 'd', tank: 500, damage: 700 },
    ];
    // team0: a tank + c damage, team1: b tank + d damage
    assert.equal(evaluate(problemOf(twins, duo), [0, 2, 1, 3]).score, 0);
  });

  it('scores an assignment that uses a role nobody plays as Infinity', () => {
    const players = [
      { discordId: 'a', username: 'a', tank: 1000, damage: 500 },
      { discordId: 'b', username: 'b', tank: 800, damage: 900 },
      { discordId: 'c', username: 'c', tank: 600, damage: 700 },
      { discordId: 'd', username: 'd', damage: 300 },
    ];
    const problem = problemOf(players, duo);
    assert.ok(
      Number.isFinite(evaluate(problem, [0, 1, 2, 3]).score),
      'd in damage is fine',
    );
    assert.equal(
      evaluate(problem, [3, 1, 2, 0]).score,
      Infinity,
      'd in a tank slot',
    );
  });

  it('is invariant to which team is called first', () => {
    const problem = problemOf(duoPlayers, duo);
    const swapped = [
      assignment[2],
      assignment[3],
      assignment[0],
      assignment[1],
    ];
    assert.equal(
      evaluate(problem, swapped).score,
      evaluate(problem, assignment).score,
    );
  });
});

describe('canonicalKey', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({
    discordId: `p${i}`,
    username: `p${i}`,
    tank: 100 + i,
    damage: 200 + i,
    support: 300 + i,
  }));
  const problem = problemOf(players);
  // team0: tank 0, damage 1 2, support 3 4 | team1: tank 5, damage 6 7, support 8 9
  const base = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('ignores the order of players inside a role', () => {
    const swapped = [0, 2, 1, 4, 3, 5, 7, 6, 9, 8];
    assert.equal(canonicalKey(problem, swapped), canonicalKey(problem, base));
  });

  it('ignores the order of teams', () => {
    const teamsSwapped = [5, 6, 7, 8, 9, 0, 1, 2, 3, 4];
    assert.equal(
      canonicalKey(problem, teamsSwapped),
      canonicalKey(problem, base),
    );
  });

  it('tells apart different splits and different role placements', () => {
    const otherSplit = [0, 1, 2, 3, 5, 4, 6, 7, 8, 9];
    const otherRoles = [0, 3, 4, 1, 2, 5, 6, 7, 8, 9];
    const keys = new Set(
      [base, otherSplit, otherRoles].map((a) => canonicalKey(problem, a)),
    );
    assert.equal(keys.size, 3);
  });
});
