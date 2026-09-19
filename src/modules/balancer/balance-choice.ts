import {
  ALGORITHM_NAMES,
  VARIETY_LEVELS,
  type AlgorithmName,
  type VarietyLevel,
} from './balancer.constants';

export type BalanceMode = 'accurate' | VarietyLevel;

export interface BalanceChoice {
  algorithm: AlgorithmName;
  mode: BalanceMode;
}

const SEPARATOR = '.';

/** Fits into a select value or a button custom id (no colons). */
export function encodeChoice({ algorithm, mode }: BalanceChoice): string {
  return mode === 'accurate' ? algorithm : `${algorithm}${SEPARATOR}${mode}`;
}

export function parseChoice(value: string): BalanceChoice | undefined {
  const [algorithm, mode = 'accurate'] = value.split(SEPARATOR);

  const isAlgorithm = (ALGORITHM_NAMES as readonly string[]).includes(
    algorithm,
  );
  const isMode = mode === 'accurate' || mode in VARIETY_LEVELS;
  if (!isAlgorithm || !isMode) return undefined;

  return { algorithm: algorithm as AlgorithmName, mode: mode as BalanceMode };
}
