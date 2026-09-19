import { ROLES } from '../balancer.constants';
import { evaluate } from '../core/evaluate';
import type { BalancingProblem, SlotAssignment } from '../core/problem';
import { roleRating } from '../core/ratings';
import { VariantCollector } from '../core/variant-collector';
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

/** Ways to choose which players sit out. */
function countBenchChoices(problem: BalancingProblem): number {
  const total = problem.players.length;
  const benchSize = total - problem.slots.length;
  let choices = 1;
  for (let i = 1; i <= benchSize; i++) {
    choices = (choices * (total - benchSize + i)) / i;
  }
  return choices;
}

/**
 * Ground truth for small pools: tries every choice of who sits out, every
 * split of the rest into teams and every placement of players into role slots,
 * keeping the assignment with the best score. Every valid assignment is
 * visited exactly once.
 */
export class ExhaustiveAlgorithm implements BalancerAlgorithm {
  readonly name = 'exhaustive';
  readonly description =
    'Checks every bench choice, split and role placement; provably optimal, only for small pools (e.g. 2 teams of 5).';

  supports(problem: BalancingProblem): boolean {
    const evaluations =
      countBenchChoices(problem) *
      countPartitions(problem.teamCount, problem.teamSize) *
      Math.pow(countRoleArrangements(problem), problem.teamCount);
    return evaluations <= MAX_EVALUATIONS;
  }

  solve(problem: BalancingProblem): SlotAssignment {
    let best: SlotAssignment = [];
    let bestScore = Infinity;

    this.enumerate(problem, (assignment, score) => {
      if (score < bestScore) {
        bestScore = score;
        best = assignment.slice();
      }
    });

    return best;
  }

  findVariants(problem: BalancingProblem, tolerance: number): SlotAssignment[] {
    const collector = new VariantCollector(problem, tolerance);
    this.enumerate(problem, (assignment, score) =>
      collector.add(assignment, score),
    );
    return collector.results();
  }

  /** `visit` receives a reused array: copy it to keep it. */
  private enumerate(
    problem: BalancingProblem,
    visit: (assignment: SlotAssignment, score: number) => void,
  ): void {
    const { players, teamCount, teamSize, composition, slots, teamSlots } =
      problem;
    const benchSize = players.length - slots.length;
    const teams: number[][] = Array.from({ length: teamCount }, () => []);
    const assignment = new Array<number>(players.length);

    const roleSlots = teamSlots.map((indices) =>
      Object.fromEntries(
        ROLES.map((role) => [
          role,
          indices.filter((index) => slots[index].role === role),
        ]),
      ),
    );

    // The players who actually play in the current bench choice.
    let playing: number[] = [];

    const arrangeTeam = (team: number): void => {
      if (team === teamCount) {
        const { score } = evaluate(problem, assignment);
        if (score !== Infinity) visit(assignment, score);
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

    const splitPlayers = (next: number): void => {
      if (next === playing.length) {
        arrangeTeam(0);
        return;
      }

      const player = playing[next];
      for (let team = 0; team < teamCount; team++) {
        if (teams[team].length >= teamSize) continue;
        teams[team].push(player);
        splitPlayers(next + 1);
        teams[team].pop();
        // Empty teams are interchangeable, so only try the first empty one.
        if (teams[team].length === 0) break;
      }
    };

    const chooseBench = (from: number, chosen: number[]): void => {
      if (chosen.length === benchSize) {
        const benched = new Set(chosen);
        playing = players.map((_, i) => i).filter((i) => !benched.has(i));
        chosen.forEach((player, i) => {
          assignment[slots.length + i] = player;
        });
        splitPlayers(0);
        return;
      }
      for (let player = from; player < players.length; player++) {
        chosen.push(player);
        chooseBench(player + 1, chosen);
        chosen.pop();
      }
    };

    chooseBench(0, []);
  }
}
