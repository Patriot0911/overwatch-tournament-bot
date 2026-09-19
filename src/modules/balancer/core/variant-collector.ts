import { ROLES } from '../balancer.constants';
import type { BalancingProblem, SlotAssignment } from './problem';

const MAX_VARIANTS = 10_000;

/**
 * Identifies an assignment regardless of team order, of the order of players
 * within a team's role and of the order of the bench, so equivalent splits
 * share one key. Who sits out is part of the split.
 */
export function canonicalKey(
  problem: BalancingProblem,
  assignment: SlotAssignment,
): string {
  const teams = problem.teamSlots
    .map((slotIndices) =>
      ROLES.map((role) =>
        slotIndices
          .filter((slot) => problem.slots[slot].role === role)
          .map((slot) => assignment[slot])
          .sort((a, b) => a - b)
          .join(','),
      ).join('|'),
    )
    .sort()
    .join('/');

  const bench = assignment
    .slice(problem.slots.length)
    .sort((a, b) => a - b)
    .join(',');
  return bench ? `${teams}#${bench}` : teams;
}

/**
 * Collects the distinct valid assignments whose score is within `tolerance` of
 * the best score seen so far. Keeps at most the best MAX_VARIANTS of them.
 */
export class VariantCollector {
  private bestScore = Infinity;
  private found = new Map<
    string,
    { assignment: SlotAssignment; score: number }
  >();

  constructor(
    private readonly problem: BalancingProblem,
    private readonly tolerance: number,
  ) {}

  /** Returns true when the assignment is a variant that was not known yet. */
  add(assignment: SlotAssignment, score: number): boolean {
    if (score === Infinity) return false;
    if (score < this.bestScore) this.bestScore = score;
    if (score > this.bestScore + this.tolerance) return false;

    const key = canonicalKey(this.problem, assignment);
    if (this.found.has(key)) return false;

    this.found.set(key, { assignment: assignment.slice(), score });
    if (this.found.size > MAX_VARIANTS * 2) this.prune();
    return true;
  }

  /** Distinct assignments, best score first. */
  results(): SlotAssignment[] {
    return this.sorted()
      .slice(0, MAX_VARIANTS)
      .map((variant) => variant.assignment);
  }

  private sorted() {
    return [...this.found.values()]
      .filter((variant) => variant.score <= this.bestScore + this.tolerance)
      .sort((a, b) => a.score - b.score);
  }

  private prune(): void {
    this.found = new Map(
      this.sorted()
        .slice(0, MAX_VARIANTS)
        .map((variant) => [
          canonicalKey(this.problem, variant.assignment),
          variant,
        ]),
    );
  }
}
