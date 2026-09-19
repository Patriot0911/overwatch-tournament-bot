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
  /**
   * Exactly this many teams. When omitted, as many full teams as the players
   * allow (at least two); the rest of the players sit out.
   */
  teamCount?: number;
  composition?: RoleComposition;
  roleWeights?: Partial<RoleWeights>;
  weights?: Partial<ObjectiveWeights>;
  /**
   * Pick a random split among all distinct ones within a tolerance of the best
   * one found, instead of always returning the single best. The tolerance is a
   * fraction of the players' average best-role rating. Only algorithms that
   * can produce variants support it.
   */
  variety?: { toleranceFactor?: number };
  /** Makes randomised algorithms and the variant pick reproducible. */
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

export interface VarietyInfo {
  /** How many distinct splits the result was picked from. */
  count: number;
  tolerance: number;
  /** Score of the best split among them. */
  bestScore: number;
}

export interface BalancedTeams {
  algorithm: AlgorithmName;
  teams: BalancedTeam[];
  /** Players left out because they did not fit into a full team. */
  bench: BalancerPlayerInput[];
  metrics: BalanceMetrics;
  /** Present when the split was picked from several variants. */
  variety?: VarietyInfo;
}
