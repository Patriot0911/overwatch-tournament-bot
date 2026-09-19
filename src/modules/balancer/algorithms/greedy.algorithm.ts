import { ROLES } from '../balancer.constants';
import type { BalancingProblem, SlotAssignment } from '../core/problem';
import { roleRating } from '../core/ratings';
import { SlotAllocator } from '../core/slot-allocator';
import type { BalancerAlgorithm } from './balancer-algorithm.interface';

/**
 * Greedy (LPT) over role pools: every player is an item worth their
 * role-weighted rating in the role they were segmented into. Items are handled
 * from the most valuable down (so heavier roles are settled first), each going
 * to the team with the lowest running total that still has a free slot in that
 * role.
 */
export class GreedyAlgorithm implements BalancerAlgorithm {
  readonly name = 'greedy';
  readonly description =
    'Greedy: most valuable role-weighted player first, to the weakest team with a free slot in that role.';

  supports(): boolean {
    return true;
  }

  solve(problem: BalancingProblem): SlotAssignment {
    const { players, teamCount, roleWeights, rolePools } = problem;

    const items = ROLES.flatMap((role) =>
      rolePools[role].map((player) => ({
        player,
        role,
        value: (roleRating(players[player], role) ?? 0) * roleWeights[role],
      })),
    ).sort((a, b) => b.value - a.value);

    const allocator = new SlotAllocator(problem);
    const assignment = new Array<number>(problem.slots.length);
    const totals = new Array<number>(teamCount).fill(0);

    for (const { player, role, value } of items) {
      let target = -1;
      for (let team = 0; team < teamCount; team++) {
        if (!allocator.hasFree(team, role)) continue;
        if (target === -1 || totals[team] < totals[target]) target = team;
      }
      assignment[allocator.take(target, role)] = player;
      totals[target] += value;
    }

    return assignment;
  }
}
