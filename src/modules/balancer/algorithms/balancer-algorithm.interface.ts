import type { AlgorithmName } from '../balancer.constants';
import type { BalancingProblem, SlotAssignment } from '../core/problem';

export interface BalancerAlgorithm {
  readonly name: AlgorithmName;
  readonly description: string;
  /** False when the problem is too large / unsuitable for this algorithm. */
  supports(problem: BalancingProblem): boolean;
  solve(problem: BalancingProblem): SlotAssignment;
  /**
   * Distinct assignments whose score is within `tolerance` of the best one the
   * algorithm found, best first. Only algorithms that can enumerate or sample
   * many good splits implement it.
   */
  findVariants?(problem: BalancingProblem, tolerance: number): SlotAssignment[];
}
