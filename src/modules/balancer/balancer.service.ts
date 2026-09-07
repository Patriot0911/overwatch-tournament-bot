import { Injectable, NotImplementedException } from '@nestjs/common';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';
import type { BalancedTeams } from './interfaces/balanced-teams.interface';

@Injectable()
export class BalancerService {
  balanceTeams(players: BalancerPlayerInput[]): BalancedTeams {
    throw new NotImplementedException(
      `Team balancing algorithm is not implemented yet (received ${players.length} player(s))`,
    );
  }
}
