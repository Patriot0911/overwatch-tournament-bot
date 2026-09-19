import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  type EmbedBuilder,
} from 'discord.js';
import {
  APPLY_JSON_BUTTON_ID,
  BACK_BUTTON_ID,
  COPY_JSON_BUTTON_ID,
  DEV_BUTTON_ID,
  END_SESSION_BUTTON_ID,
  END_SESSION_CONFIRM_BUTTON_ID,
  RESPAWN_BUTTON_ID,
  SET_OWNER_BUTTON_ID,
  SET_OWNER_SELECT_ID,
} from '../balancer.constants';
import { baseEmbed } from './balance-list.view';

function ownerLine(ownerId: string | undefined): string {
  return `👑 Owner: ${ownerId ? `<@${ownerId}>` : '*unknown*'}`;
}

export function buildDevPanelEmbed(
  playerCount: number,
  ownerId: string | undefined,
): EmbedBuilder {
  return baseEmbed()
    .setTitle('🛠️ Dev actions')
    .setDescription(
      [
        `👥 **${playerCount}** player(s) in the list`,
        ownerLine(ownerId),
        '',
        '📋 **Copy JSON**: post the current list as JSON',
        '📥 **Apply JSON**: replace the whole list with a JSON array',
        '🔁 **Respawn**: post the balancer again at the bottom of the channel and close the old message',
        '👑 **Set owner**: choose who can manage this balancer besides admins',
        '⛔ **End session**: close the public message and discard the list (asks to confirm)',
      ].join('\n'),
    );
}

export function buildDevPanelRows(): [
  ActionRowBuilder<ButtonBuilder>,
  ActionRowBuilder<ButtonBuilder>,
] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${COPY_JSON_BUTTON_ID}:copy`)
        .setLabel('Copy JSON')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${APPLY_JSON_BUTTON_ID}:apply`)
        .setLabel('Apply JSON')
        .setEmoji('📥')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${RESPAWN_BUTTON_ID}:respawn`)
        .setLabel('Respawn')
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${SET_OWNER_BUTTON_ID}:open`)
        .setLabel('Set owner')
        .setEmoji('👑')
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${END_SESSION_BUTTON_ID}:ask`)
        .setLabel('End session')
        .setEmoji('⛔')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${BACK_BUTTON_ID}:main`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildSetOwnerEmbed(ownerId: string | undefined): EmbedBuilder {
  return baseEmbed()
    .setTitle('👑 Set owner')
    .setDescription(
      [
        ownerLine(ownerId),
        '',
        'Pick the user who should be able to open the manager of this balancer (admins always can).',
        '*If you are the owner and not an admin, you lose access once you pick someone else.*',
      ].join('\n'),
    );
}

export function buildSetOwnerComponents(): [
  ActionRowBuilder<UserSelectMenuBuilder>,
  ActionRowBuilder<ButtonBuilder>,
] {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`${SET_OWNER_SELECT_ID}:pick`)
        .setPlaceholder('Select the new owner')
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${DEV_BUTTON_ID}:open`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildEndSessionConfirmEmbed(playerCount: number): EmbedBuilder {
  return baseEmbed()
    .setTitle('⚠️ End the session?')
    .setDescription(
      [
        'This will:',
        '• remove **Join**, **Leave** and **Call Manager** from the public message (it stays as the final list)',
        `• discard the list of **${playerCount}** player(s)`,
        '',
        '**This cannot be undone.** Use **Copy JSON** first if you may need the list again.',
      ].join('\n'),
    );
}

export function buildEndSessionConfirmRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DEV_BUTTON_ID}:open`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${END_SESSION_CONFIRM_BUTTON_ID}:confirm`)
      .setLabel('Yes, end session')
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildSessionEndedEmbed(): EmbedBuilder {
  return baseEmbed()
    .setTitle('✅ Session ended')
    .setDescription(
      'The public message is now closed and the list was discarded.',
    );
}

/** Replaces the old public message after the balancer was posted again. */
export function buildMovedEmbed(newMessageUrl: string): EmbedBuilder {
  return baseEmbed()
    .setTitle('⚖️ Balance list · moved')
    .setDescription(
      `This balancer was posted again further down the channel.\n[Jump to the current message](${newMessageUrl})`,
    );
}
