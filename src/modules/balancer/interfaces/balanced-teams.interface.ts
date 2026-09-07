import type { BalancerPlayerInput } from '../dto/balancer-input.schema';

export interface BalancedTeam {
  players: BalancerPlayerInput[];
}

export interface BalancedTeams {
  teamA: BalancedTeam;
  teamB: BalancedTeam;
}
