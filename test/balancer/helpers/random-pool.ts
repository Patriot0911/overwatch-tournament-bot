import { formatRankValue } from '../../../src/modules/balancer/rank-parser';
import { ROLES } from '../../../src/modules/balancer/balancer.constants';
import { createRng } from '../../../src/modules/balancer/core/rng';

export type RawPlayer = Record<string, unknown>;
export type Rng = () => number;

export { createRng };

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A rating as a user could type it into the JSON: rank name, number or numeric string. */
function rawRating(rng: Rng, value: number): unknown {
  const roll = rng();
  if (roll < 0.4) return formatRankValue(value);
  if (roll < 0.8) return value;
  return String(value);
}

/**
 * A pool of JSON-like players. Each plays 1-3 roles (30% / 40% / 30%), the
 * roles they do not play are either omitted or explicitly null.
 */
export function randomRawPool(rng: Rng, size: number): RawPlayer[] {
  return Array.from({ length: size }, (_, index) => {
    const base = 100 + Math.floor(rng() * 8900);
    const roll = rng();
    const roleCount = roll < 0.3 ? 1 : roll < 0.7 ? 2 : 3;
    const played = shuffle(rng, ROLES).slice(0, roleCount);

    const player: RawPlayer = {
      discordId: `p${index + 1}`,
      username: `Player ${index + 1}`,
    };
    for (const role of ROLES) {
      if (played.includes(role)) {
        const factor = role === played[0] ? 1 : 0.6 + rng() * 0.4;
        player[role] = rawRating(rng, Math.max(1, Math.round(base * factor)));
      } else if (rng() < 0.4) {
        player[role] = null;
      }
    }
    return player;
  });
}
