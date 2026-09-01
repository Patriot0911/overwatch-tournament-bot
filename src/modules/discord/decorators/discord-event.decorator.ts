import { SetMetadata } from '@nestjs/common';

export const DISCORD_EVENT_METADATA = 'discord:event';

export const OnDiscordEvent = (eventName: string) =>
  SetMetadata(DISCORD_EVENT_METADATA, eventName);
