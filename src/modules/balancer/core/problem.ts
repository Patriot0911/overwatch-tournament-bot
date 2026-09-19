import {
  ROLES,
  type ObjectiveWeights,
  type Role,
  type RoleComposition,
  type RoleWeights,
} from '../balancer.constants';
import type { BalancerPlayerInput } from '../dto/balancer-input.schema';
import { InvalidBalancerInputError } from './errors';
import { segmentRoles } from './segmentation';

export interface Slot {
  team: number;
  role: Role;
}

/**
 * One entry per player: the first `slots.length` entries are the players placed
 * in the slots (index = slot index), the rest are the players on the bench.
 * Every value is an index into `BalancingProblem.players`.
 */
export type SlotAssignment = number[];

export interface BalancingProblem {
  players: BalancerPlayerInput[];
  teamCount: number;
  teamSize: number;
  composition: RoleComposition;
  roleWeights: RoleWeights;
  slots: Slot[];
  /** Slot indices belonging to each team. */
  teamSlots: number[][];
  /**
   * Which players fill which role across all teams, chosen so the role-weighted
   * total is highest. A pool holds exactly `teamCount * composition[role]`
   * players; players in no pool are on the bench.
   */
  rolePools: Record<Role, number[]>;
  /** Players in no role pool (the bench of the simple, non-optimising algorithms). */
  bench: number[];
  weights: ObjectiveWeights;
  seed: number;
}

export interface ProblemConfig {
  composition: RoleComposition;
  /** Exactly this many teams; derived from the player count when omitted. */
  teamCount?: number;
  roleWeights: RoleWeights;
  weights: ObjectiveWeights;
  seed: number;
}

export interface TeamPlan {
  teamCount: number;
  teamSize: number;
  /** Players left over once every team is full. */
  benchCount: number;
  /** False when there are too few players for the requested teams. */
  enough: boolean;
}

export const MIN_TEAM_COUNT = 2;

/**
 * As many full teams as the players allow (at least two), unless a team count
 * is requested explicitly.
 */
export function planTeams(
  playerCount: number,
  composition: RoleComposition,
  teamCount?: number,
): TeamPlan {
  const teamSize = ROLES.reduce((sum, role) => sum + composition[role], 0);
  const count =
    teamCount ??
    Math.max(
      MIN_TEAM_COUNT,
      teamSize > 0 ? Math.floor(playerCount / teamSize) : MIN_TEAM_COUNT,
    );
  const needed = count * teamSize;

  return {
    teamCount: count,
    teamSize,
    benchCount: Math.max(0, playerCount - needed),
    enough: playerCount >= needed,
  };
}

/** Puts the players nobody placed after the slots, as the bench. */
export function withBench(
  problem: BalancingProblem,
  slotPlayers: number[],
  bench: number[] = problem.bench,
): SlotAssignment {
  return [...slotPlayers, ...bench];
}

export function createProblem(
  players: BalancerPlayerInput[],
  config: ProblemConfig,
): BalancingProblem {
  const { composition, roleWeights } = config;

  for (const role of ROLES) {
    if (!Number.isInteger(composition[role]) || composition[role] < 0) {
      throw new InvalidBalancerInputError(
        `Composition for ${role} must be a non-negative integer`,
      );
    }
    if (!Number.isFinite(roleWeights[role]) || roleWeights[role] <= 0) {
      throw new InvalidBalancerInputError(
        `Role weight for ${role} must be a positive number`,
      );
    }
  }

  const teamSize = ROLES.reduce((sum, role) => sum + composition[role], 0);
  if (teamSize < 1) {
    throw new InvalidBalancerInputError('Team composition is empty');
  }

  const { teamCount, enough } = planTeams(
    players.length,
    composition,
    config.teamCount,
  );
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAM_COUNT) {
    throw new InvalidBalancerInputError('teamCount must be an integer >= 2');
  }
  if (!enough) {
    throw new InvalidBalancerInputError(
      `Not enough players for ${teamCount} teams of ${teamSize}: need at least ${teamCount * teamSize}, got ${players.length}`,
    );
  }

  const slots: Slot[] = [];
  const teamSlots: number[][] = [];
  for (let team = 0; team < teamCount; team++) {
    teamSlots.push([]);
    for (const role of ROLES) {
      for (let i = 0; i < composition[role]; i++) {
        teamSlots[team].push(slots.length);
        slots.push({ team, role });
      }
    }
  }

  const base = {
    players,
    teamCount,
    teamSize,
    composition,
    roleWeights,
    slots,
    teamSlots,
    weights: config.weights,
    seed: config.seed,
  };

  return { ...base, ...segmentRoles(base) };
}
