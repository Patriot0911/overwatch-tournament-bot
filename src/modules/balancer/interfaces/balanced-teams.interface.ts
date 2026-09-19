import type {
  AlgorithmName,
  ObjectiveWeights,
  Role,
  RoleComposition,
  RoleWeights,
} from '../balancer.constants';
import type { BalancerPlayerInput } from '../dto/balancer-input.schema';

export interface BalancerOptions {
  algorithm?: AlgorithmName;
  teamCount?: number;
  composition?: RoleComposition;
  roleWeights?: Partial<RoleWeights>;
  weights?: Partial<ObjectiveWeights>;
  /** Makes randomised algorithms reproducible. */
  seed?: number;
}

export interface BalancedSlot {
  role: Role;
  player: BalancerPlayerInput;
  /** The player's raw rating in the role they were placed in. */
  rating: number;
}

export interface BalancedTeam {
  slots: BalancedSlot[];
  /** Sum of role-weighted ratings. */
  totalRating: number;
}

export interface BalanceMetrics {
  /** Role-weighted team totals. */
  teamTotals: number[];
  totalSpread: number;
  roleSpread: number;
  starSpread: number;
  /** Weighted sum of the spreads above; lower is better. */
  score: number;
}

export interface BalancedTeams {
  algorithm: AlgorithmName;
  teams: BalancedTeam[];
  metrics: BalanceMetrics;
}
