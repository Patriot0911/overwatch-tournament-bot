import { Module } from '@nestjs/common';
import { BalanceListSessionStore } from './balance-list-session.store';
import { BalancerService } from './balancer.service';
import { EditBalanceListCommand } from './commands/edit-balance-list.command';
import { SetupBalanceListCommand } from './commands/setup-balance-list.command';

@Module({
  providers: [
    BalancerService,
    BalanceListSessionStore,
    SetupBalanceListCommand,
    EditBalanceListCommand,
  ],
  exports: [BalancerService],
})
export class BalancerModule {}
