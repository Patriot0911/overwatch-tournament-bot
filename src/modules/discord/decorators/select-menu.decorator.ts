import { SetMetadata } from '@nestjs/common';

export const SELECT_MENU_METADATA = 'discord:select-menu';

export const SelectMenu = (customIdPrefix: string) => SetMetadata(SELECT_MENU_METADATA, customIdPrefix);
