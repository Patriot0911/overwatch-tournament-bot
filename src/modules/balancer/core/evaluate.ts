import { ROLES } from '../balancer.constants';
import type { BalanceMetrics } from '../interfaces/balanced-teams.interface';
import type { BalancingProblem, SlotAssignment } from './problem';
import { roleRating } from './ratings';

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

/**
 * Scores an assignment (lower is better). An assignment that puts a player in
 * a role they do not play is invalid and scores Infinity, so search algorithms
 * reject it without special handling.
 */
export function evaluate(
  problem: BalancingProblem,
  assignment: SlotAssignment,
): BalanceMetrics {
  const { players, slots, teamCount, weights, roleWeights } = problem;

  const teamTotals = new Array<number>(teamCount).fill(0);
  const teamStars = new Array<number>(teamCount).fill(0);
  const roleTotals = Array.from({ length: teamCount }, () => ({
    tank: 0,
    damage: 0,
    support: 0,
  }));

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    const rating = roleRating(players[assignment[index]], slot.role);
    if (rating === null) {
      return {
        teamTotals,
        totalSpread: Infinity,
        roleSpread: Infinity,
        starSpread: Infinity,
        score: Infinity,
      };
    }

    const value = rating * roleWeights[slot.role];
    teamTotals[slot.team] += value;
    roleTotals[slot.team][slot.role] += value;
    teamStars[slot.team] = Math.max(teamStars[slot.team], value);
  }

  const totalSpread = spread(teamTotals);
  const roleSpread = ROLES.reduce(
    (sum, role) => sum + spread(roleTotals.map((totals) => totals[role])),
    0,
  );
  const starSpread = spread(teamStars);

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
