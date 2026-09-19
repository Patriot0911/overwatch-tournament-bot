export const BALANCE_TEAMS_MODAL_ID = 'balancer:balance-teams';
export const BALANCE_TEAMS_MODAL_INPUT_ID = 'players';
export const BALANCE_TEAMS_MODAL_OPTIONS_ID = 'options';

export const ROLES = ['tank', 'damage', 'support'] as const;
export type Role = (typeof ROLES)[number];

/** How many players of each role a single team has. */
export type RoleComposition = Record<Role, number>;

export const DEFAULT_COMPOSITION: RoleComposition = {
  tank: 1,
  damage: 2,
  support: 2,
};

/**
 * Multiplier applied to a role's rating wherever team strength is measured, so
 * a role with a higher weight matters more for balance.
 */
export type RoleWeights = Record<Role, number>;

export const DEFAULT_ROLE_WEIGHTS: RoleWeights = {
  tank: 1,
  damage: 1,
  support: 1,
};

export const ALGORITHM_NAMES = [
  'snake-draft',
  'greedy',
  'exhaustive',
  'simulated-annealing',
] as const;
export type AlgorithmName = (typeof ALGORITHM_NAMES)[number];
export const DEFAULT_ALGORITHM: AlgorithmName = 'simulated-annealing';

export interface ObjectiveWeights {
  /** Spread between the strongest and weakest team total. */
  total: number;
  /** Sum over roles of the spread between teams' totals in that role. */
  role: number;
  /** Spread between teams' single best slot rating (avoids stacked stars). */
  star: number;
}

export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  total: 1,
  role: 1,
  star: 0.5,
};
