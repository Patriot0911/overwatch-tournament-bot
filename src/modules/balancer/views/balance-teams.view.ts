import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  escapeMarkdown,
  type EmbedBuilder,
} from 'discord.js';
import {
  encodeChoice,
  type BalanceChoice,
  type BalanceMode,
} from '../balance-choice';
import {
  BACK_BUTTON_ID,
  BALANCE_BUTTON_ID,
  BALANCE_SELECT_ID,
  REROLL_BUTTON_ID,
  ROLE_DISPLAY,
  VARIETY_LEVELS,
  type AlgorithmName,
} from '../balancer.constants';
import type { BalancedTeams } from '../interfaces/balanced-teams.interface';
import { formatRankValue } from '../rank-parser';
import { baseEmbed } from './balance-list.view';

const MODE_DISPLAY: Record<BalanceMode, { emoji: string; label: string }> = {
  accurate: { emoji: '🎯', label: 'Accurate' },
  varied: { emoji: '🎲', label: 'Varied' },
  wide: { emoji: '🎲', label: 'Wide' },
};

const SELECT_DESCRIPTION_LIMIT = 100;

export interface AlgorithmOption {
  name: AlgorithmName;
  description: string;
  supportsVariety: boolean;
}

function algorithmLabel(name: AlgorithmName): string {
  const text = name.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function percent(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function buildBalanceChooserEmbed(
  playerCount: number,
  teamCount: number,
  teamSize: number,
): EmbedBuilder {
  return baseEmbed()
    .setTitle('⚖️ Balance teams')
    .setDescription(
      [
        `👥 **${playerCount}** players → **${teamCount}** teams of **${teamSize}**`,
        '',
        '**Pick an algorithm and a mode**',
        `${MODE_DISPLAY.accurate.emoji} **Accurate**: the single best split found`,
        `${MODE_DISPLAY.varied.emoji} **Varied**: a random pick among all distinct splits up to ${percent(VARIETY_LEVELS.varied)} off the best`,
        `${MODE_DISPLAY.wide.emoji} **Wide**: the same, with up to ${percent(VARIETY_LEVELS.wide)} room, so more variety`,
        '',
        '*Varied and Wide are available for algorithms that can list many splits.*',
      ].join('\n'),
    );
}

export function buildBalanceChooserComponents(
  algorithms: AlgorithmOption[],
): [
  ActionRowBuilder<StringSelectMenuBuilder>,
  ActionRowBuilder<ButtonBuilder>,
] {
  const options = algorithms.flatMap(
    ({ name, description, supportsVariety }) => {
      const modes: BalanceMode[] = supportsVariety
        ? ['accurate', 'varied', 'wide']
        : ['accurate'];

      return modes.map((mode) => ({
        label: `${algorithmLabel(name)} · ${MODE_DISPLAY[mode].label}`,
        description: truncate(
          mode === 'accurate'
            ? description
            : `Random pick among distinct splits up to ${percent(VARIETY_LEVELS[mode])} off the best`,
          SELECT_DESCRIPTION_LIMIT,
        ),
        value: encodeChoice({ algorithm: name, mode }),
        emoji: MODE_DISPLAY[mode].emoji,
      }));
    },
  );

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${BALANCE_SELECT_ID}:choose`)
        .setPlaceholder('Choose algorithm and mode')
        .addOptions(options),
    );

  return [selectRow, buildBackRow()];
}

export function buildBalanceResultEmbed(
  result: BalancedTeams,
  choice: BalanceChoice,
): EmbedBuilder {
  const { metrics, variety } = result;
  const mode = MODE_DISPLAY[choice.mode];

  const lines = [
    `🧮 **${algorithmLabel(result.algorithm)}** · ${mode.emoji} ${mode.label}`,
    `Score **${Math.round(metrics.score)}** · total spread **${Math.round(metrics.totalSpread)}** · roles **${Math.round(metrics.roleSpread)}** · stars **${Math.round(metrics.starSpread)}**`,
  ];

  if (variety) {
    lines.push(
      `🎲 Picked 1 of **${variety.count}** distinct split${variety.count === 1 ? '' : 's'} within **${Math.round(variety.tolerance)}** of the best score (**${Math.round(variety.bestScore)}**)`,
    );
    if (variety.count === 1 && choice.mode === 'varied') {
      lines.push(
        '*Only one split is that close. Try **Wide** for more variety.*',
      );
    }
  }

  return baseEmbed()
    .setTitle('⚖️ Balanced teams')
    .setDescription(lines.join('\n'))
    .addFields(
      result.teams.map((team, index) => ({
        name: `🏁 Team ${index + 1} · ${Math.round(team.totalRating)}`,
        value: team.slots
          .map(
            (slot) =>
              `${ROLE_DISPLAY[slot.role].emoji} **${escapeMarkdown(slot.player.username)}** · ${formatRankValue(slot.rating)}`,
          )
          .join('\n'),
        inline: true,
      })),
    );
}

export function buildBalanceResultRow(
  choice: BalanceChoice,
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (choice.mode !== 'accurate') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${REROLL_BUTTON_ID}:${encodeChoice(choice)}`)
        .setLabel('Re-roll')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Success),
    );
  }

  return row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${BALANCE_BUTTON_ID}:open`)
      .setLabel('Change algorithm')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${BACK_BUTTON_ID}:main`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildBackRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BACK_BUTTON_ID}:main`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );
}
