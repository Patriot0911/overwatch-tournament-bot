import type { Role } from '../balancer.constants';
import type { BalancingProblem } from './problem';

/** Hands out each team's role slots one by one. */
export class SlotAllocator {
  private readonly free = new Map<string, number[]>();

  constructor(problem: BalancingProblem) {
    problem.slots.forEach((slot, index) => {
      const key = this.key(slot.team, slot.role);
      const list = this.free.get(key);
      if (list) list.push(index);
      else this.free.set(key, [index]);
    });
  }

  hasFree(team: number, role: Role): boolean {
    return (this.free.get(this.key(team, role))?.length ?? 0) > 0;
  }

  take(team: number, role: Role): number {
    return this.free.get(this.key(team, role))!.shift()!;
  }

  private key(team: number, role: Role): string {
    return `${team}:${role}`;
  }
}
