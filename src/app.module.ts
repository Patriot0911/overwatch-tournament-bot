import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { BalancerModule } from './modules/balancer/balancer.module';
import { DiscordModule } from './modules/discord/discord.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, DiscordModule, BalancerModule],
})
export class AppModule {}
