import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordUser } from '../../database/entities';
import { PingCommand } from './commands/ping.command';
import { discordClientProvider } from './discord.provider';
import { DiscordExplorer } from './discord.explorer';
import { BotStatusListener } from './listeners/bot-status.listener';

@Module({
  imports: [DiscoveryModule, TypeOrmModule.forFeature([DiscordUser])],
  providers: [
    discordClientProvider,
    DiscordExplorer,
    PingCommand,
    BotStatusListener,
  ],
})
export class DiscordModule {}
