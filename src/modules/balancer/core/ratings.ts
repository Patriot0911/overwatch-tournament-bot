import type { Role } from '../balancer.constants';
import type { BalancerPlayerInput } from '../dto/balancer-input.schema';

/** The player's rating in a role, or null when they do not play that role. */
export function roleRating(
  player: BalancerPlayerInput,
  role: Role,
): number | null {
  return player[role] ?? null;
}
