import { ROLES, type Role } from '../balancer.constants';
import { InvalidBalancerInputError } from './errors';
import { solveAssignment } from './hungarian';
import type { BalancingProblem } from './problem';
import { roleRating } from './ratings';

const UNAVAILABLE_COST = 1e9;

/**
 * Splits players into role pools: decides which role each player fills, so
 * that every role slot of every team gets a player who can actually play it.
 *
 * Roles that only a few players can play are filled by exactly those players
 * (so they never take part in balancing another role); players who can play
 * several roles are placed where their role-weighted rating is highest.
 */
export function segmentRoles(
  problem: Omit<BalancingProblem, 'rolePools'>,
): Record<Role, number[]> {
  const { players, slots, teamCount, composition, roleWeights } = problem;

  for (const role of ROLES) {
    const needed = teamCount * composition[role];
    const capable = players.filter(
      (player) => roleRating(player, role) !== null,
    ).length;
    if (capable < needed) {
      throw new InvalidBalancerInputError(
        `Not enough players who can play ${role}: need ${needed}, have ${capable}`,
      );
    }
  }

  const cost = players.map((player) =>
    slots.map((slot) => {
      const rating = roleRating(player, slot.role);
      return rating === null
        ? UNAVAILABLE_COST
        : -rating * roleWeights[slot.role];
    }),
  );
  const slotOfPlayer = solveAssignment(cost);

  const pools: Record<Role, number[]> = { tank: [], damage: [], support: [] };
  players.forEach((player, index) => {
    const { role } = slots[slotOfPlayer[index]];
    if (roleRating(player, role) === null) {
      throw new InvalidBalancerInputError(
        "The players' role choices cannot fill every role slot together (some role is covered only by players who are needed elsewhere)",
      );
    }
    pools[role].push(index);
  });

  return pools;
}
