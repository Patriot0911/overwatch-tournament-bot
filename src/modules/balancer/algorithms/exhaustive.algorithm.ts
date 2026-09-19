import { ROLES } from '../balancer.constants';
import { evaluate } from '../core/evaluate';
import type { BalancingProblem, SlotAssignment } from '../core/problem';
import { roleRating } from '../core/ratings';
import type { BalancerAlgorithm } from './balancer-algorithm.interface';

const MAX_EVALUATIONS = 2_000_000;

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** Ways to split players into unordered teams of equal size. */
function countPartitions(teamCount: number, teamSize: number): number {
  return (
    factorial(teamCount * teamSize) /
    (Math.pow(factorial(teamSize), teamCount) * factorial(teamCount))
  );
}

/** Distinct ways to place one team's players into its role slots. */
function countRoleArrangements(problem: BalancingProblem): number {
  const { composition, teamSize } = problem;
  return (
    factorial(teamSize) /
    ROLES.reduce((product, role) => product * factorial(composition[role]), 1)
  );
}

/**
 * Ground truth for small pools: tries every split of players into teams and,
 * for each split, every placement of players into role slots, keeping the
 * assignment with the best score.
 */
export class ExhaustiveAlgorithm implements BalancerAlgorithm {
  readonly name = 'exhaustive';
  readonly description =
    'Checks every split and role placement; provably optimal, only for small pools (e.g. 2 teams of 5).';

  supports(problem: BalancingProblem): boolean {
    const evaluations =
      countPartitions(problem.teamCount, problem.teamSize) *
      Math.pow(countRoleArrangements(problem), problem.teamCount);
    return evaluations <= MAX_EVALUATIONS;
  }

  solve(problem: BalancingProblem): SlotAssignment {
    const { players, teamCount, teamSize, composition, slots, teamSlots } =
      problem;
    const teams: number[][] = Array.from({ length: teamCount }, () => []);
    const assignment = new Array<number>(slots.length);

    const roleSlots = teamSlots.map((indices) =>
      Object.fromEntries(
        ROLES.map((role) => [
          role,
          indices.filter((index) => slots[index].role === role),
        ]),
      ),
    );

    let best: SlotAssignment = [];
    let bestScore = Infinity;

    const arrangeTeam = (team: number): void => {
      if (team === teamCount) {
        const { score } = evaluate(problem, assignment);
        if (score < bestScore) {
          bestScore = score;
          best = assignment.slice();
        }
        return;
      }

      const members = teams[team];
      const remaining = { ...composition };

      const placeMember = (member: number): void => {
        if (member === members.length) {
          arrangeTeam(team + 1);
          return;
        }
        for (const role of ROLES) {
          if (remaining[role] === 0) continue;
          if (roleRating(players[members[member]], role) === null) continue;
          const slot =
            roleSlots[team][role][composition[role] - remaining[role]];
          remaining[role]--;
          assignment[slot] = members[member];
          placeMember(member + 1);
          remaining[role]++;
        }
      };

      placeMember(0);
    };

    const splitPlayers = (player: number): void => {
      if (player === players.length) {
        arrangeTeam(0);
        return;
      }

      for (let team = 0; team < teamCount; team++) {
        if (teams[team].length >= teamSize) continue;
        teams[team].push(player);
        splitPlayers(player + 1);
        teams[team].pop();
        // Empty teams are interchangeable, so only try the first empty one.
        if (teams[team].length === 0) break;
      }
    };

    splitPlayers(0);
    return best;
  }
}
