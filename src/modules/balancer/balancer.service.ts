import { Injectable } from '@nestjs/common';
import { ALGORITHMS } from './algorithms';
import {
  ALGORITHM_NAMES,
  DEFAULT_ALGORITHM,
  DEFAULT_COMPOSITION,
  DEFAULT_ROLE_WEIGHTS,
  DEFAULT_VARIETY_LEVEL,
  VARIETY_LEVELS,
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
import { createRng } from './core/rng';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';
import type {
  BalancedTeams,
  BalancerOptions,
} from './interfaces/balanced-teams.interface';

export { InvalidBalancerInputError };

const DEFAULT_SEED = 1;

@Injectable()
export class BalancerService {
  listAlgorithms(): {
    name: AlgorithmName;
    description: string;
    supportsVariety: boolean;
  }[] {
    return ALGORITHM_NAMES.map((name) => ({
      name,
      description: ALGORITHMS[name].description,
      supportsVariety: ALGORITHMS[name].findVariants !== undefined,
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

    if (!options.variety) {
      return this.buildResult(problem, name, algorithm.solve(problem));
    }
    return this.balanceWithVariety(problem, name, options);
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

  private balanceWithVariety(
    problem: BalancingProblem,
    name: AlgorithmName,
    options: BalancerOptions,
  ): BalancedTeams {
    const algorithm = ALGORITHMS[name];
    if (!algorithm.findVariants) {
      throw new InvalidBalancerInputError(
        `Algorithm "${name}" cannot produce varied results`,
      );
    }

    const tolerance = this.toleranceFor(
      problem,
      options.variety?.toleranceFactor ?? VARIETY_LEVELS[DEFAULT_VARIETY_LEVEL],
    );
    const variants = algorithm.findVariants(problem, tolerance);
    const random =
      options.seed === undefined ? Math.random : createRng(options.seed);
    const picked = variants[Math.floor(random() * variants.length)];

    return {
      ...this.buildResult(problem, name, picked),
      variety: {
        count: variants.length,
        tolerance,
        bestScore: evaluate(problem, variants[0]).score,
      },
    };
  }

  private toleranceFor(problem: BalancingProblem, factor: number): number {
    const { players, roleWeights } = problem;
    const meanBestRating =
      players.reduce(
        (sum, player) =>
          sum +
          Math.max(
            ...ROLES.map(
              (role) => (roleRating(player, role) ?? 0) * roleWeights[role],
            ),
          ),
        0,
      ) / players.length;

    return meanBestRating * factor;
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
