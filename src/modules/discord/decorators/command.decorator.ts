import { SetMetadata } from '@nestjs/common';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

export const COMMAND_METADATA = 'discord:command';

export interface CommandMetadata {
  body: RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export const Command = (
  body: RESTPostAPIChatInputApplicationCommandsJSONBody,
) => SetMetadata<string, CommandMetadata>(COMMAND_METADATA, { body });
