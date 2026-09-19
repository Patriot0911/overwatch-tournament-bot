import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  escapeMarkdown,
} from 'discord.js';
import {
  ADD_PLAYER_BUTTON_ID,
  BACK_BUTTON_ID,
  BALANCE_BUTTON_ID,
  BALANCE_LIST_BANNER_URL,
  BALANCE_LIST_COLOR,
  CALL_MANAGER_BUTTON_ID,
  DEV_BUTTON_ID,
  EDIT_LIST_BUTTON_ID,
  EDIT_LIST_PAGE_BUTTON_ID,
  EDIT_LIST_PAGE_SIZE,
  EDIT_LIST_SELECT_ID,
  EDIT_PLAYER_BUTTON_ID,
  EMBED_DESCRIPTION_LIMIT,
  JOIN_BUTTON_ID,
  LEAVE_BUTTON_ID,
  REMOVE_PLAYER_BUTTON_ID,
  ROLE_DISPLAY,
  ROLES,
} from '../balancer.constants';
import type { BalancerPlayerInput } from '../dto/balancer-input.schema';
import { formatRankValue } from '../rank-parser';

export function buildListEmbed(
  players: BalancerPlayerInput[],
  { ended = false }: { ended?: boolean } = {},
): EmbedBuilder {
  return baseEmbed()
    .setTitle(ended ? '⚖️ Balance list · session ended' : '⚖️ Balance list')
    .setDescription(buildListDescription(players, ended));
}

export function buildPublicButtonsRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${JOIN_BUTTON_ID}:join`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${LEAVE_BUTTON_ID}:leave`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${CALL_MANAGER_BUTTON_ID}:call`)
      .setLabel('Call Manager')
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildManagerButtonsRow(
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
    new ButtonBuilder()
      .setCustomId(`${BALANCE_BUTTON_ID}:open`)
      .setLabel('Balance')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(players.length < 2),
    new ButtonBuilder()
      .setCustomId(`${DEV_BUTTON_ID}:open`)
      .setLabel('Dev')
      .setEmoji('🛠️')
      .setStyle(ButtonStyle.Secondary),
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
  return baseEmbed()
    .setTitle(escapeMarkdown(player.username))
    .setDescription(
      `\`${player.discordId}\`\n\n${playerRoleLines(player).join('\n')}`,
    );
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

export function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BALANCE_LIST_COLOR)
    .setImage(BALANCE_LIST_BANNER_URL);
}

function playerRoleLines(player: BalancerPlayerInput): string[] {
  return ROLES.flatMap((role) => {
    const rating = player[role];
    if (rating === undefined) return [];

    const { emoji, label } = ROLE_DISPLAY[role];
    return [`${emoji} ${label} · **${formatRankValue(rating)}** \`${rating}\``];
  });
}

function playerBlock(player: BalancerPlayerInput, index: number): string {
  const header = `**${index + 1}. ${escapeMarkdown(player.username)}**`;
  return [header, ...playerRoleLines(player)].join('');
}

function buildListSummary(players: BalancerPlayerInput[]): string {
  const count = players.length;
  const roleCounts = ROLES.map((role) => {
    const { emoji, label } = ROLE_DISPLAY[role];
    const capable = players.filter((player) => player[role] !== undefined);
    return `${emoji} ${label} **${capable.length}**`;
  }).join(' · ');

  return `👥 **${count}** player${count === 1 ? '' : 's'}\n${roleCounts}`;
}

// Players that do not fit into the embed are still in the list, only hidden.
function buildListDescription(
  players: BalancerPlayerInput[],
  ended: boolean,
): string {
  const summary = buildListSummary(players);
  if (players.length === 0) {
    return ended
      ? `${summary}\n\n*The session ended with no players.*`
      : `${summary}\n\n*No players yet. Press **Join** to sign up.*`;
  }

  const moreNoteReserve = 60;
  let description = summary;
  let shown = 0;

  for (const [index, player] of players.entries()) {
    const next = `${description}\n\n${playerBlock(player, index)}`;
    if (next.length > EMBED_DESCRIPTION_LIMIT - moreNoteReserve) break;
    description = next;
    shown++;
  }

  if (shown < players.length) {
    description += `\n\n*…and ${players.length - shown} more player(s)*`;
  }

  return description;
}
