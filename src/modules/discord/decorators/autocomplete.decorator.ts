import { SetMetadata } from '@nestjs/common';

export const AUTOCOMPLETE_METADATA = 'discord:autocomplete';

export const Autocomplete = (commandName: string) => SetMetadata(AUTOCOMPLETE_METADATA, commandName);
