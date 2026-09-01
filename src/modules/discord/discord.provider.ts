import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { AppConfig } from '../../config/config.schema';
import { DISCORD_CLIENT } from './discord.constants';

export const discordClientProvider: Provider = {
  provide: DISCORD_CLIENT,
  useFactory: async (
    configService: ConfigService<AppConfig, true>,
  ): Promise<Client> => {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    await client.login(configService.get('DISCORD_TOKEN', { infer: true }));

    await new Promise<void>((resolve) => {
      client.once(Events.ClientReady, (readyClient) => {
        Logger.log(`Logged in as ${readyClient.user.tag}`, 'DiscordClient');
        resolve();
      });
    });

    return client;
  },
  inject: [ConfigService],
};
