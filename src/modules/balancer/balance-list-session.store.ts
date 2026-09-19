import { Injectable } from '@nestjs/common';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';

/**
 * Lists are keyed by the id of the public balancer message. Ephemeral manager
 * messages are linked to it, so every method accepts either kind of message id.
 */
@Injectable()
export class BalanceListSessionStore {
  private readonly sessions = new Map<string, BalancerPlayerInput[]>();
  private readonly managerToSession = new Map<string, string>();

  resolve(messageId: string): string {
    return this.managerToSession.get(messageId) ?? messageId;
  }

  linkManager(managerMessageId: string, sessionId: string): void {
    this.managerToSession.set(managerMessageId, sessionId);
  }

  get(messageId: string): BalancerPlayerInput[] | undefined {
    return this.sessions.get(this.resolve(messageId));
  }

  set(sessionId: string, players: BalancerPlayerInput[]): void {
    this.sessions.set(sessionId, players);
  }

  addPlayer(
    messageId: string,
    player: BalancerPlayerInput,
  ): BalancerPlayerInput[] | undefined {
    const players = this.get(messageId);
    if (!players) return undefined;

    players.push(player);
    return players;
  }

  updatePlayer(
    messageId: string,
    index: number,
    player: BalancerPlayerInput,
  ): BalancerPlayerInput[] | undefined {
    const players = this.get(messageId);
    if (!players?.[index]) return undefined;

    players[index] = player;
    return players;
  }

  removePlayer(
    messageId: string,
    index: number,
  ): BalancerPlayerInput[] | undefined {
    const players = this.get(messageId);
    if (!players?.[index]) return undefined;

    players.splice(index, 1);
    return players;
  }
}
