import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Repository } from 'typeorm';
import { DiscordUser } from '../../../database/entities';
import { Command } from '../decorators/command.decorator';
import pingMeta from './ping.meta';

@Injectable()
export class PingCommand {
  constructor(
    @InjectRepository(DiscordUser)
    private readonly discordUsers: Repository<DiscordUser>,
  ) {}

  @Command(pingMeta())
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    await this.discordUsers.upsert(
      {
        discordId: interaction.user.id,
        username: interaction.user.username,
        lastSeenAt: new Date(),
      },
      ['discordId'],
    );

    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.editReply(`Pong! Latency: ${latency}ms`);
  }
}
