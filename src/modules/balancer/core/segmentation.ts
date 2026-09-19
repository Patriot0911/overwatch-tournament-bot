import { ROLES, type Role } from '../balancer.constants';
import { InvalidBalancerInputError } from './errors';
import { solveAssignment } from './hungarian';
import type { BalancingProblem } from './problem';
import { roleRating } from './ratings';

const UNAVAILABLE_COST = 1e9;

/**
 * Splits players into role pools: decides which player fills each role slot,
 * so that every role slot of every team gets a player who can actually play it.
 *
 * Roles that only a few players can play are filled by exactly those players
 * (so they never take part in balancing another role); players who can play
 * several roles are placed where their role-weighted rating is highest. When
 * there are more players than slots, the ones whose role-weighted rating adds
 * the least are left out and returned as the bench.
 */
export function segmentRoles(
  problem: Omit<BalancingProblem, 'rolePools' | 'bench'>,
): Pick<BalancingProblem, 'rolePools' | 'bench'> {
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

  // Rows are slots, columns are players: with a surplus of players the
  // assignment picks the best player for every slot and leaves the rest out.
  const cost = slots.map((slot) =>
    players.map((player) => {
      const rating = roleRating(player, slot.role);
      return rating === null
        ? UNAVAILABLE_COST
        : -rating * roleWeights[slot.role];
    }),
  );
  const playerOfSlot = solveAssignment(cost);

  const rolePools: Record<Role, number[]> = {
    tank: [],
    damage: [],
    support: [],
  };
  const chosen = new Set<number>();

  slots.forEach((slot, index) => {
    const player = playerOfSlot[index];
    if (roleRating(players[player], slot.role) === null) {
      throw new InvalidBalancerInputError(
        "The players' role choices cannot fill every role slot together (some role is covered only by players who are needed elsewhere)",
      );
    }
    rolePools[slot.role].push(player);
    chosen.add(player);
  });

  const bench = players.map((_, index) => index).filter((i) => !chosen.has(i));
  return { rolePools, bench };
}
