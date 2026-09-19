import { Injectable } from '@nestjs/common';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';

/**
 * Lists are keyed by the id of the public balancer message. Ephemeral manager
 * messages are linked to it, so every method accepts either kind of message id.
 */
@Injectable()
export class BalanceListSessionStore {
  private readonly sessions = new Map<string, BalancerPlayerInput[]>();
  private readonly owners = new Map<string, string>();
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

  /** `ownerId` is the Discord id of the user who set the balancer up. */
  set(
    sessionId: string,
    players: BalancerPlayerInput[],
    ownerId: string,
  ): void {
    this.sessions.set(sessionId, players);
    this.owners.set(sessionId, ownerId);
  }

  isOwner(messageId: string, userId: string): boolean {
    return this.owners.get(this.resolve(messageId)) === userId;
  }

  getOwner(messageId: string): string | undefined {
    return this.owners.get(this.resolve(messageId));
  }

  /** False when the session no longer exists. */
  setOwner(messageId: string, ownerId: string): boolean {
    const sessionId = this.resolve(messageId);
    if (!this.sessions.has(sessionId)) return false;

    this.owners.set(sessionId, ownerId);
    return true;
  }

  /**
   * Re-keys a session to another public message (when the balancer is posted
   * again), keeping its list, owner and every linked manager message.
   * False when the session no longer exists.
   */
  moveSession(messageId: string, newSessionId: string): boolean {
    const sessionId = this.resolve(messageId);
    const players = this.sessions.get(sessionId);
    const ownerId = this.owners.get(sessionId);
    if (!players || ownerId === undefined) return false;

    this.sessions.delete(sessionId);
    this.owners.delete(sessionId);
    this.set(newSessionId, players, ownerId);

    for (const [managerId, linkedId] of this.managerToSession) {
      if (linkedId === sessionId) {
        this.managerToSession.set(managerId, newSessionId);
      }
    }
    return true;
  }

  /** Replaces the whole list; undefined when the session no longer exists. */
  replacePlayers(
    messageId: string,
    players: BalancerPlayerInput[],
  ): BalancerPlayerInput[] | undefined {
    const sessionId = this.resolve(messageId);
    if (!this.sessions.has(sessionId)) return undefined;

    this.sessions.set(sessionId, players);
    return players;
  }

  /** Ends the session: forgets its list and every manager message linked to it. */
  remove(messageId: string): BalancerPlayerInput[] | undefined {
    const sessionId = this.resolve(messageId);
    const players = this.sessions.get(sessionId);
    if (!players) return undefined;

    this.sessions.delete(sessionId);
    this.owners.delete(sessionId);
    for (const [managerId, linkedId] of this.managerToSession) {
      if (linkedId === sessionId) this.managerToSession.delete(managerId);
    }
    return players;
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
