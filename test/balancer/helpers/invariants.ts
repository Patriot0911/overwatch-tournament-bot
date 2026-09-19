import assert from 'node:assert/strict';
import {
  DEFAULT_COMPOSITION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_WEIGHTS,
  ROLES,
  type ObjectiveWeights,
  type RoleComposition,
  type RoleWeights,
} from '../../../src/modules/balancer/balancer.constants';
import type { BalancerPlayerInput } from '../../../src/modules/balancer/dto/balancer-input.schema';
import type {
  BalancedTeams,
  BalancerOptions,
} from '../../../src/modules/balancer/interfaces/balanced-teams.interface';

export interface Setup {
  players: BalancerPlayerInput[];
  composition: RoleComposition;
  teamCount: number;
  roleWeights: RoleWeights;
  weights: ObjectiveWeights;
}

/** Mirrors how the service fills in defaults, independently of its code. */
export function resolveSetup(
  players: BalancerPlayerInput[],
  options: BalancerOptions = {},
): Setup {
  return {
    players,
    composition: options.composition ?? DEFAULT_COMPOSITION,
    teamCount: options.teamCount ?? 2,
    roleWeights: { ...DEFAULT_ROLE_WEIGHTS, ...options.roleWeights },
    weights: { ...DEFAULT_WEIGHTS, ...options.weights },
  };
}

export function close(
  actual: number,
  expected: number,
  message?: string,
): void {
  const tolerance = 1e-6 * Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? 'value'}: expected ${expected}, got ${actual}`,
  );
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

/** Recomputes every metric from the teams alone. */
export function recomputeMetrics(setup: Setup, result: BalancedTeams) {
  const { roleWeights, weights } = setup;
  const teamTotals = result.teams.map((team) =>
    team.slots.reduce(
      (sum, slot) => sum + slot.rating * roleWeights[slot.role],
      0,
    ),
  );
  const stars = result.teams.map((team) =>
    Math.max(...team.slots.map((slot) => slot.rating * roleWeights[slot.role])),
  );
  const roleSpread = ROLES.reduce((sum, role) => {
    const perTeam = result.teams.map((team) =>
      team.slots
        .filter((slot) => slot.role === role)
        .reduce((total, slot) => total + slot.rating * roleWeights[role], 0),
    );
    return sum + spread(perTeam);
  }, 0);

  const totalSpread = spread(teamTotals);
  const starSpread = spread(stars);
  return {
    teamTotals,
    totalSpread,
    roleSpread,
    starSpread,
    score:
      weights.total * totalSpread +
      weights.role * roleSpread +
      weights.star * starSpread,
  };
}

/** Everything that must hold for ANY successful balancing result. */
export function assertValidResult(setup: Setup, result: BalancedTeams): void {
  const { players, composition, teamCount } = setup;
  const teamSize = ROLES.reduce((sum, role) => sum + composition[role], 0);

  assert.equal(result.teams.length, teamCount, 'team count');

  const byId = new Map(players.map((player) => [player.discordId, player]));
  const seen = new Set<string>();

  result.teams.forEach((team, index) => {
    assert.equal(team.slots.length, teamSize, `team ${index + 1} size`);

    for (const role of ROLES) {
      const inRole = team.slots.filter((slot) => slot.role === role);
      assert.equal(
        inRole.length,
        composition[role],
        `team ${index + 1} has ${inRole.length} ${role} slot(s)`,
      );
    }

    const roleOrder = team.slots.map((slot) => ROLES.indexOf(slot.role));
    assert.deepEqual(
      roleOrder,
      [...roleOrder].sort((a, b) => a - b),
      `team ${index + 1} slots follow role order`,
    );

    for (const slot of team.slots) {
      const id = slot.player.discordId;
      assert.ok(byId.has(id), `unknown player ${id}`);
      assert.ok(!seen.has(id), `player ${id} is placed twice`);
      seen.add(id);

      const rating = byId.get(id)![slot.role];
      assert.notEqual(
        rating,
        undefined,
        `${id} was put in ${slot.role}, which they do not play`,
      );
      assert.equal(slot.rating, rating, `${id} rating in ${slot.role}`);
    }
  });

  assert.equal(
    seen.size,
    players.length,
    'every player is placed exactly once',
  );

  const expected = recomputeMetrics(setup, result);
  assert.ok(Number.isFinite(result.metrics.score), 'score is finite');
  assert.ok(result.metrics.score >= 0, 'score is not negative');
  close(result.metrics.totalSpread, expected.totalSpread, 'totalSpread');
  close(result.metrics.roleSpread, expected.roleSpread, 'roleSpread');
  close(result.metrics.starSpread, expected.starSpread, 'starSpread');
  close(result.metrics.score, expected.score, 'score');
  expected.teamTotals.forEach((total, index) => {
    close(result.metrics.teamTotals[index], total, `metrics team ${index + 1}`);
    close(result.teams[index].totalRating, total, `team ${index + 1} total`);
  });
}

/** Canonical form of a split, ignoring team order and order inside a role. */
export function splitKey(result: BalancedTeams): string {
  return result.teams
    .map((team) =>
      ROLES.map((role) =>
        team.slots
          .filter((slot) => slot.role === role)
          .map((slot) => slot.player.discordId)
          .sort()
          .join(','),
      ).join('|'),
    )
    .sort()
    .join('/');
}
