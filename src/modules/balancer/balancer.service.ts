import { Injectable } from '@nestjs/common';
import { ALGORITHMS } from './algorithms';
import {
  ALGORITHM_NAMES,
  DEFAULT_ALGORITHM,
  DEFAULT_COMPOSITION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_WEIGHTS,
  ROLES,
  type AlgorithmName,
} from './balancer.constants';
import { InvalidBalancerInputError } from './core/errors';
import { evaluate } from './core/evaluate';
import {
  createProblem,
  type BalancingProblem,
  type SlotAssignment,
} from './core/problem';
import { roleRating } from './core/ratings';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';
import type {
  BalancedTeams,
  BalancerOptions,
} from './interfaces/balanced-teams.interface';

export { InvalidBalancerInputError };

const DEFAULT_SEED = 1;

@Injectable()
export class BalancerService {
  listAlgorithms(): { name: AlgorithmName; description: string }[] {
    return ALGORITHM_NAMES.map((name) => ({
      name,
      description: ALGORITHMS[name].description,
    }));
  }

  isAlgorithmName(value: string): value is AlgorithmName {
    return (ALGORITHM_NAMES as readonly string[]).includes(value);
  }

  /**
   * @throws InvalidBalancerInputError when the pool cannot be balanced, e.g.
   * wrong player count or not enough players able to play a role.
   */
  balanceTeams(
    players: BalancerPlayerInput[],
    options: BalancerOptions = {},
  ): BalancedTeams {
    const problem = this.createProblem(players, options);
    const name = options.algorithm ?? DEFAULT_ALGORITHM;
    const algorithm = ALGORITHMS[name];

    if (!algorithm.supports(problem)) {
      throw new InvalidBalancerInputError(
        `Algorithm "${name}" cannot handle a pool of this size`,
      );
    }

    return this.buildResult(problem, name, algorithm.solve(problem));
  }

  /** Runs every algorithm that supports the pool, best score first. */
  compareAlgorithms(
    players: BalancerPlayerInput[],
    options: BalancerOptions = {},
  ): BalancedTeams[] {
    const problem = this.createProblem(players, options);

    return ALGORITHM_NAMES.filter((name) => ALGORITHMS[name].supports(problem))
      .map((name) =>
        this.buildResult(problem, name, ALGORITHMS[name].solve(problem)),
      )
      .sort((a, b) => a.metrics.score - b.metrics.score);
  }

  private createProblem(
    players: BalancerPlayerInput[],
    options: BalancerOptions,
  ): BalancingProblem {
    return createProblem(players, {
      composition: options.composition ?? DEFAULT_COMPOSITION,
      teamCount: options.teamCount ?? 2,
      roleWeights: { ...DEFAULT_ROLE_WEIGHTS, ...options.roleWeights },
      weights: { ...DEFAULT_WEIGHTS, ...options.weights },
      seed: options.seed ?? DEFAULT_SEED,
    });
  }

  private buildResult(
    problem: BalancingProblem,
    algorithm: AlgorithmName,
    assignment: SlotAssignment,
  ): BalancedTeams {
    const metrics = evaluate(problem, assignment);

    const teams = problem.teamSlots.map((slotIndices, team) => ({
      slots: slotIndices
        .slice()
        .sort(
          (a, b) =>
            ROLES.indexOf(problem.slots[a].role) -
            ROLES.indexOf(problem.slots[b].role),
        )
        .map((slot) => {
          const player = problem.players[assignment[slot]];
          const role = problem.slots[slot].role;
          return { role, player, rating: roleRating(player, role) ?? 0 };
        }),
      totalRating: metrics.teamTotals[team],
    }));

    return { algorithm, teams, metrics };
  }
}
