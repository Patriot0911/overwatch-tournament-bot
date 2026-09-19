import { ROLES } from '../balancer.constants';
import {
  withBench,
  type BalancingProblem,
  type SlotAssignment,
} from '../core/problem';
import { roleRating } from '../core/ratings';
import { SlotAllocator } from '../core/slot-allocator';
import type { BalancerAlgorithm } from './balancer-algorithm.interface';

/**
 * Baseline: inside every role pool players are sorted by rating and dealt to
 * the teams in a snake order (1..N, N..1, ...). The starting direction flips
 * from role to role so no team always gets the first pick.
 */
export class SnakeDraftAlgorithm implements BalancerAlgorithm {
  readonly name = 'snake-draft';
  readonly description =
    'Fast baseline: sort each role pool by rating, deal to teams in snake order.';

  supports(): boolean {
    return true;
  }

  solve(problem: BalancingProblem): SlotAssignment {
    const { players, teamCount, rolePools } = problem;
    const allocator = new SlotAllocator(problem);
    const assignment = new Array<number>(problem.slots.length);

    ROLES.forEach((role, roleIndex) => {
      const pool = rolePools[role]
        .slice()
        .sort(
          (a, b) =>
            (roleRating(players[b], role) ?? 0) -
            (roleRating(players[a], role) ?? 0),
        );

      pool.forEach((player, i) => {
        const round = Math.floor(i / teamCount);
        const position = i % teamCount;
        const forward = (round + roleIndex) % 2 === 0;
        const team = forward ? position : teamCount - 1 - position;
        assignment[allocator.take(team, role)] = player;
      });
    });

    return withBench(problem, assignment);
  }
}
