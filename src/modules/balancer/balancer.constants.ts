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

export const DEFAULT_TEAM_SIZE = ROLES.reduce(
  (sum, role) => sum + DEFAULT_COMPOSITION[role],
  0,
);

/**
 * "Varied" balancing picks randomly among every distinct split whose score is
 * within this fraction of the average best-role rating of the best one found.
 */
export const VARIETY_LEVELS = { varied: 0.05, wide: 0.15 } as const;
export type VarietyLevel = keyof typeof VARIETY_LEVELS;
export const DEFAULT_VARIETY_LEVEL: VarietyLevel = 'varied';

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

export const SETUP_BALANCE_LIST_MODAL_ID = 'balancer:setup-balance-list';
export const SETUP_BALANCE_LIST_MODAL_INPUT_ID = 'players';
export const SETUP_BALANCER_IMPORT_OPTION = 'import-json';

export const JOIN_BUTTON_ID = 'balancer:join-button';
export const JOIN_MODAL_ID = 'balancer:join-modal';
export const LEAVE_BUTTON_ID = 'balancer:leave-button';
export const CALL_MANAGER_BUTTON_ID = 'balancer:call-manager-button';

export const BALANCE_BUTTON_ID = 'balancer:balance-button';
export const BALANCE_SELECT_ID = 'balancer:balance-select';
export const REROLL_BUTTON_ID = 'balancer:reroll-button';

export const DEV_BUTTON_ID = 'balancer:dev-button';
export const COPY_JSON_BUTTON_ID = 'balancer:copy-json-button';
export const APPLY_JSON_BUTTON_ID = 'balancer:apply-json-button';
export const APPLY_JSON_MODAL_ID = 'balancer:apply-json-modal';
export const APPLY_JSON_INPUT_ID = 'players-json';
export const SET_OWNER_BUTTON_ID = 'balancer:set-owner-button';
export const SET_OWNER_SELECT_ID = 'balancer:set-owner-select';
export const RESPAWN_BUTTON_ID = 'balancer:respawn-button';
export const END_SESSION_BUTTON_ID = 'balancer:end-session-button';
export const END_SESSION_CONFIRM_BUTTON_ID = 'balancer:end-session-confirm';

// Discord limits: message content, and a modal text input's prefilled value.
export const MESSAGE_CONTENT_LIMIT = 2000;
export const MODAL_INPUT_VALUE_LIMIT = 4000;

export const SESSION_EXPIRED_MESSAGE =
  'Session expired. Please run /setup-balancer again.';

export const ADD_PLAYER_BUTTON_ID = 'balancer:add-player-button';
export const ADD_PLAYER_MODAL_ID = 'balancer:add-player-modal';

export const EDIT_LIST_BUTTON_ID = 'balancer:edit-list-button';
export const EDIT_LIST_PAGE_BUTTON_ID = 'balancer:edit-list-page';
export const EDIT_LIST_SELECT_ID = 'balancer:edit-list-select';

export const EDIT_PLAYER_BUTTON_ID = 'balancer:edit-player-button';
export const EDIT_PLAYER_MODAL_ID = 'balancer:edit-player-modal';
export const REMOVE_PLAYER_BUTTON_ID = 'balancer:remove-player-button';
export const BACK_BUTTON_ID = 'balancer:back-button';

export const PLAYER_FORM_FIELD_DISCORD_ID = 'discordId';
export const PLAYER_FORM_FIELD_USERNAME = 'username';
export const PLAYER_FORM_FIELD_TANK = 'tank';
export const PLAYER_FORM_FIELD_DAMAGE = 'damage';
export const PLAYER_FORM_FIELD_SUPPORT = 'support';

export const EDIT_LIST_PAGE_SIZE = 25;

export const BALANCE_LIST_COLOR = 0xf99e1a;
// Thin transparent strip: an embed image forces the embed to its full width.
export const BALANCE_LIST_BANNER_URL =
  'https://i.postimg.cc/QCdt25qM/image-66.png';
export const EMBED_DESCRIPTION_LIMIT = 4096;

export const ROLE_DISPLAY: Record<Role, { emoji: string; label: string }> = {
  tank: { emoji: '🔵', label: 'Tank' },
  damage: { emoji: '🔴', label: 'Damage' },
  support: { emoji: '🟢', label: 'Support' },
};
