import { evaluate } from '../core/evaluate';
import type { BalancingProblem, SlotAssignment } from '../core/problem';
import { createRng } from '../core/rng';
import { VariantCollector } from '../core/variant-collector';
import type { BalancerAlgorithm } from './balancer-algorithm.interface';
import { GreedyAlgorithm } from './greedy.algorithm';

export interface SimulatedAnnealingOptions {
  iterations: number;
  /** Independent runs; the best result wins. */
  restarts: number;
  /** Start temperature as a fraction of the seed solution's score. */
  startTemperatureFactor: number;
  /** End temperature as a fraction of the start temperature. */
  coolingRange: number;
}

const DEFAULT_OPTIONS: SimulatedAnnealingOptions = {
  iterations: 20_000,
  restarts: 5,
  startTemperatureFactor: 0.3,
  coolingRange: 1e-3,
};

const CYCLE_MOVE_PROBABILITY = 0.5;
/** Bounds the work of walking across equally good splits. */
const MAX_EXPANSION_EVALUATIONS = 300_000;

/**
 * Moves the players of the given slots one step along the list (with two slots
 * that is a swap). Three-slot cycles reach splits that pairwise swaps cannot
 * when role restrictions make the intermediate swap invalid.
 */
function rotate(assignment: SlotAssignment, slots: number[]): SlotAssignment {
  const candidate = assignment.slice();
  slots.forEach((slot, i) => {
    candidate[slot] = assignment[slots[(i + 1) % slots.length]];
  });
  return candidate;
}

function pickDistinctSlots(
  rng: () => number,
  count: number,
  slotCount: number,
): number[] {
  const picked: number[] = [];
  while (picked.length < count) {
    const slot = Math.floor(rng() * slotCount);
    if (!picked.includes(slot)) picked.push(slot);
  }
  return picked;
}

/**
 * Local search over the full assignment: starts from the greedy solution and
 * repeatedly swaps two slots' players or cycles three of them, accepting worse
 * moves with a probability that shrinks as the temperature falls, then
 * polishes the best result with a hill-climb over the same moves. Works for any pool size and optimises the
 * whole objective (including role placement).
 *
 * Every valid split it evaluates along the way can be reported as a variant.
 */
export class SimulatedAnnealingAlgorithm implements BalancerAlgorithm {
  readonly name = 'simulated-annealing';
  readonly description =
    'Simulated annealing over swaps and 3-cycles, seeded from greedy; scales to any pool size.';

  private readonly seedAlgorithm = new GreedyAlgorithm();
  private readonly options: SimulatedAnnealingOptions;

  constructor(options: Partial<SimulatedAnnealingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  supports(): boolean {
    return true;
  }

  solve(problem: BalancingProblem): SlotAssignment {
    return this.search(problem);
  }

  findVariants(problem: BalancingProblem, tolerance: number): SlotAssignment[] {
    const collector = new VariantCollector(problem, tolerance);
    this.search(problem, collector);
    this.expandVariants(problem, collector);
    return collector.results();
  }

  /**
   * The search only reports what it happened to visit. Equally good splits form
   * plateaus it does not walk across, so this explores the neighbours of every
   * variant found (breadth first, best first) until no new one turns up or the
   * evaluation budget runs out.
   */
  private expandVariants(
    problem: BalancingProblem,
    collector: VariantCollector,
  ): void {
    const slotCount = problem.players.length;
    const queue = collector.results();
    let evaluations = 0;

    for (
      let head = 0;
      head < queue.length && evaluations < MAX_EXPANSION_EVALUATIONS;
      head++
    ) {
      const state = queue[head];

      const visit = (slots: number[]): void => {
        const candidate = rotate(state, slots);
        evaluations++;
        if (collector.add(candidate, evaluate(problem, candidate).score)) {
          queue.push(candidate);
        }
      };

      for (let a = 0; a < slotCount - 1; a++) {
        for (let b = a + 1; b < slotCount; b++) {
          visit([a, b]);
          for (let c = b + 1; c < slotCount; c++) {
            visit([a, b, c]);
            visit([a, c, b]);
          }
        }
      }
    }
  }

  private search(
    problem: BalancingProblem,
    collector?: VariantCollector,
  ): SlotAssignment {
    const rng = createRng(problem.seed);
    const start = this.seedAlgorithm.solve(problem);

    let best = start;
    let bestScore = evaluate(problem, start).score;
    collector?.add(start, bestScore);

    for (let run = 0; run < this.options.restarts && bestScore > 0; run++) {
      const candidate = this.anneal(problem, start, rng, collector);
      const score = evaluate(problem, candidate).score;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return this.hillClimb(problem, best, collector);
  }

  private anneal(
    problem: BalancingProblem,
    start: SlotAssignment,
    rng: () => number,
    collector?: VariantCollector,
  ): SlotAssignment {
    const { iterations, startTemperatureFactor, coolingRange } = this.options;
    const slotCount = problem.players.length;

    let current = start;
    let currentScore = evaluate(problem, current).score;
    let best = current;
    let bestScore = currentScore;

    let temperature = Math.max(1, currentScore * startTemperatureFactor);
    const cooling = Math.pow(coolingRange, 1 / iterations);

    for (let i = 0; i < iterations && bestScore > 0; i++) {
      const moveSize = slotCount >= 3 && rng() < CYCLE_MOVE_PROBABILITY ? 3 : 2;
      const candidate = rotate(
        current,
        pickDistinctSlots(rng, moveSize, slotCount),
      );
      const candidateScore = evaluate(problem, candidate).score;
      collector?.add(candidate, candidateScore);
      const delta = candidateScore - currentScore;

      if (delta <= 0 || rng() < Math.exp(-delta / temperature)) {
        current = candidate;
        currentScore = candidateScore;
        if (currentScore < bestScore) {
          best = current;
          bestScore = currentScore;
        }
      }
      temperature *= cooling;
    }

    return best;
  }

  /** Applies improving swaps and three-slot cycles until none is left. */
  private hillClimb(
    problem: BalancingProblem,
    start: SlotAssignment,
    collector?: VariantCollector,
  ): SlotAssignment {
    const slotCount = problem.players.length;
    let current = start;
    let currentScore = evaluate(problem, current).score;

    const tryMove = (slots: number[]): boolean => {
      const candidate = rotate(current, slots);
      const score = evaluate(problem, candidate).score;
      collector?.add(candidate, score);
      if (score >= currentScore) return false;

      current = candidate;
      currentScore = score;
      return true;
    };

    let improved = true;
    while (improved) {
      improved = false;
      for (let a = 0; a < slotCount - 1; a++) {
        for (let b = a + 1; b < slotCount; b++) {
          if (tryMove([a, b])) improved = true;

          for (let c = b + 1; c < slotCount; c++) {
            if (tryMove([a, b, c])) improved = true;
            if (tryMove([a, c, b])) improved = true;
          }
        }
      }
    }

    return current;
  }
}
