import { Module } from '@nestjs/common';
import { BalanceListSessionStore } from './balance-list-session.store';
import { BalancerService } from './balancer.service';
import { BalanceTeamsCommand } from './commands/balance-teams.command';
import { EditBalanceListCommand } from './commands/edit-balance-list.command';
import { SetupBalanceListCommand } from './commands/setup-balance-list.command';

@Module({
  providers: [
    BalancerService,
    BalanceListSessionStore,
    SetupBalanceListCommand,
    EditBalanceListCommand,
    BalanceTeamsCommand,
  ],
  exports: [BalancerService],
})
export class BalancerModule {}
