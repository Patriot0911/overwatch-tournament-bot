import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  ADD_PLAYER_BUTTON_ID,
  BACK_BUTTON_ID,
  EDIT_LIST_BUTTON_ID,
  EDIT_LIST_PAGE_BUTTON_ID,
  EDIT_LIST_PAGE_SIZE,
  EDIT_LIST_SELECT_ID,
  EDIT_PLAYER_BUTTON_ID,
  REMOVE_PLAYER_BUTTON_ID,
} from '../balancer.constants';
import type { BalancerPlayerInput } from '../dto/balancer-input.schema';
import { formatRankValue } from '../rank-parser';

export function buildListEmbed(players: BalancerPlayerInput[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Balance list')
    .setDescription(`${players.length} player(s)`);

  if (players.length > 0) {
    embed.addFields(
      players.map((player) => ({
        name: playerLabel(player),
        value: playerRanksSummary(player),
      })),
    );
  }

  return embed;
}

export function buildMainButtonsRow(
  players: BalancerPlayerInput[],
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ADD_PLAYER_BUTTON_ID}:add`)
      .setLabel('Add Player')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${EDIT_LIST_BUTTON_ID}:0`)
      .setLabel('Edit List')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(players.length === 0),
  );
}

export function buildEditListComponents(
  players: BalancerPlayerInput[],
  page: number,
): [
  ActionRowBuilder<StringSelectMenuBuilder>,
  ActionRowBuilder<ButtonBuilder>,
] {
  const totalPages = Math.max(
    1,
    Math.ceil(players.length / EDIT_LIST_PAGE_SIZE),
  );
  const start = page * EDIT_LIST_PAGE_SIZE;
  const pagePlayers = players.slice(start, start + EDIT_LIST_PAGE_SIZE);

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${EDIT_LIST_SELECT_ID}:${page}`)
        .setPlaceholder('Select a player to edit or remove')
        .addOptions(
          pagePlayers.map((player, i) => ({
            label: player.username,
            description: player.discordId,
            value: `${start + i}`,
          })),
        ),
    );

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${EDIT_LIST_PAGE_BUTTON_ID}:${page - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${EDIT_LIST_PAGE_BUTTON_ID}:${page + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`${BACK_BUTTON_ID}:main`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );

  return [selectRow, navRow];
}

export function buildPlayerActionsRow(
  index: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${EDIT_PLAYER_BUTTON_ID}:${index}`)
      .setLabel('Edit ranks')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${REMOVE_PLAYER_BUTTON_ID}:${index}`)
      .setLabel('Remove player')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${BACK_BUTTON_ID}:main`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildPlayerSummaryEmbed(
  player: BalancerPlayerInput,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(playerLabel(player))
    .setDescription(playerRanksSummary(player));
}

export function buildTextInputRow(
  customId: string,
  label: string,
  value: string | undefined,
  required: boolean,
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required);

  if (value !== undefined) {
    input.setValue(value);
  }

  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

export function buildRankInputRow(
  customId: string,
  label: string,
  value: number | undefined,
): ActionRowBuilder<TextInputBuilder> {
  return buildTextInputRow(
    customId,
    label,
    value !== undefined ? formatRankValue(value) : undefined,
    false,
  );
}

function playerLabel(player: BalancerPlayerInput): string {
  return `${player.username} (${player.discordId})`;
}

function playerRanksSummary(player: BalancerPlayerInput): string {
  const lines: string[] = [];

  if (player.tank !== undefined)
    lines.push(`Tank: ${player.tank} (${formatRankValue(player.tank)})`);
  if (player.damage !== undefined)
    lines.push(`Damage: ${player.damage} (${formatRankValue(player.damage)})`);
  if (player.support !== undefined)
    lines.push(
      `Support: ${player.support} (${formatRankValue(player.support)})`,
    );

  return lines.length > 0 ? lines.join('\n') : '-';
}
