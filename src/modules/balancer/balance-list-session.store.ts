import { Injectable } from '@nestjs/common';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';

@Injectable()
export class BalanceListSessionStore {
  private readonly sessions = new Map<string, BalancerPlayerInput[]>();

  get(sessionId: string): BalancerPlayerInput[] | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, players: BalancerPlayerInput[]): void {
    this.sessions.set(sessionId, players);
  }

  addPlayer(
    sessionId: string,
    player: BalancerPlayerInput,
  ): BalancerPlayerInput[] | undefined {
    const players = this.sessions.get(sessionId);
    if (!players) return undefined;

    players.push(player);
    return players;
  }

  updatePlayer(
    sessionId: string,
    index: number,
    player: BalancerPlayerInput,
  ): BalancerPlayerInput[] | undefined {
    const players = this.sessions.get(sessionId);
    if (!players?.[index]) return undefined;

    players[index] = player;
    return players;
  }

  removePlayer(
    sessionId: string,
    index: number,
  ): BalancerPlayerInput[] | undefined {
    const players = this.sessions.get(sessionId);
    if (!players?.[index]) return undefined;

    players.splice(index, 1);
    return players;
  }
}
