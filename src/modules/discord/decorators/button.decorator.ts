import { SetMetadata } from '@nestjs/common';

export const BUTTON_METADATA = 'discord:button';

export const ButtonClick = (customIdPrefix: string) => SetMetadata(BUTTON_METADATA, customIdPrefix);
