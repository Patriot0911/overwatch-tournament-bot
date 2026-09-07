import { Module } from '@nestjs/common';
import { BalanceTeamsCommand } from './commands/balance-teams.command';
import { BalancerService } from './balancer.service';

@Module({
  providers: [BalancerService, BalanceTeamsCommand],
  exports: [BalancerService],
})
export class BalancerModule {}
