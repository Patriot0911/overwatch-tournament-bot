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

/** Index is a slot index, value is the index of the player placed in it. */
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
   * Which players fill which role across all teams. Every player is in exactly
   * one pool, and a pool holds exactly `teamCount * composition[role]` players.
   */
  rolePools: Record<Role, number[]>;
  weights: ObjectiveWeights;
  seed: number;
}

export interface ProblemConfig {
  composition: RoleComposition;
  teamCount: number;
  roleWeights: RoleWeights;
  weights: ObjectiveWeights;
  seed: number;
}

export function createProblem(
  players: BalancerPlayerInput[],
  config: ProblemConfig,
): BalancingProblem {
  const { composition, teamCount, roleWeights } = config;

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

  if (!Number.isInteger(teamCount) || teamCount < 2) {
    throw new InvalidBalancerInputError('teamCount must be an integer >= 2');
  }
  if (teamSize < 1) {
    throw new InvalidBalancerInputError('Team composition is empty');
  }
  if (players.length !== teamCount * teamSize) {
    throw new InvalidBalancerInputError(
      `Expected ${teamCount * teamSize} players (${teamCount} teams x ${teamSize}), got ${players.length}`,
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

  return { ...base, rolePools: segmentRoles(base) };
}
