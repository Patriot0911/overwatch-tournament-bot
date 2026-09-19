import type { AlgorithmName } from '../balancer.constants';
import type { BalancingProblem, SlotAssignment } from '../core/problem';

export interface BalancerAlgorithm {
  readonly name: AlgorithmName;
  readonly description: string;
  /** False when the problem is too large / unsuitable for this algorithm. */
  supports(problem: BalancingProblem): boolean;
  solve(problem: BalancingProblem): SlotAssignment;
}
