import type { AlgorithmName } from '../balancer.constants';
import type { BalancerAlgorithm } from './balancer-algorithm.interface';
import { ExhaustiveAlgorithm } from './exhaustive.algorithm';
import { GreedyAlgorithm } from './greedy.algorithm';
import { SimulatedAnnealingAlgorithm } from './simulated-annealing.algorithm';
import { SnakeDraftAlgorithm } from './snake-draft.algorithm';

export const ALGORITHMS: Record<AlgorithmName, BalancerAlgorithm> = {
  'snake-draft': new SnakeDraftAlgorithm(),
  greedy: new GreedyAlgorithm(),
  exhaustive: new ExhaustiveAlgorithm(),
  'simulated-annealing': new SimulatedAnnealingAlgorithm(),
};
