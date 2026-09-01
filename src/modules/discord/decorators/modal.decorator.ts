import { SetMetadata } from '@nestjs/common';

export const MODAL_METADATA = 'discord:modal';

export const ModalSubmit = (customIdPrefix: string) => SetMetadata(MODAL_METADATA, customIdPrefix);
