import { Injectable, Logger } from '@nestjs/common';
import type { Guild } from 'discord.js';
import { OnDiscordEvent } from '../decorators/discord-event.decorator';

@Injectable()
export class BotStatusListener {
  private readonly logger = new Logger(BotStatusListener.name);

  @OnDiscordEvent('guildCreate')
  onGuildJoin(guild: Guild): void {
    this.logger.log(`Joined guild: ${guild.name} (${guild.id})`);
  }

  @OnDiscordEvent('guildDelete')
  onGuildLeave(guild: Guild): void {
    this.logger.log(`Removed from guild: ${guild.name} (${guild.id})`);
  }
}
