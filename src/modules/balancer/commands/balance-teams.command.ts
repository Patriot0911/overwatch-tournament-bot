import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { ZodIssue } from 'zod';
import { Command } from '../../discord/decorators/command.decorator';
import { ModalSubmit } from '../../discord/decorators/modal.decorator';
import {
  BALANCE_TEAMS_MODAL_ID,
  BALANCE_TEAMS_MODAL_INPUT_ID,
  BALANCE_TEAMS_MODAL_OPTIONS_ID,
  DEFAULT_ALGORITHM,
} from '../balancer.constants';
import {
  BalancerService,
  InvalidBalancerInputError,
} from '../balancer.service';
import { balancerInputSchema } from '../dto/balancer-input.schema';
import { balancerOptionsSchema } from '../dto/balancer-options.schema';
import type { BalancedTeams } from '../interfaces/balanced-teams.interface';
import balanceTeamsMeta from './balance-teams.meta';

@Injectable()
export class BalanceTeamsCommand {
  constructor(private readonly balancerService: BalancerService) {}

  @Command(balanceTeamsMeta())
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const algorithm =
      interaction.options.getString('algorithm') ?? DEFAULT_ALGORITHM;

    const playersInput = new TextInputBuilder()
      .setCustomId(BALANCE_TEAMS_MODAL_INPUT_ID)
      .setLabel('Players JSON')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        '[{"discordId":"1","username":"a","tank":3000,"support":2500}]',
      )
      .setRequired(true);

    const optionsInput = new TextInputBuilder()
      .setCustomId(BALANCE_TEAMS_MODAL_OPTIONS_ID)
      .setLabel('Options JSON (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        '{"teamCount":2,"composition":{"tank":1,"damage":2,"support":2},"roleWeights":{"tank":1.6}}',
      )
      .setRequired(false);

    const modal = new ModalBuilder()
      .setCustomId(`${BALANCE_TEAMS_MODAL_ID}:${algorithm}`)
      .setTitle('Balance teams')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(playersInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(optionsInput),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(BALANCE_TEAMS_MODAL_ID)
  async handleSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const algorithm = interaction.customId.split(':').pop() ?? '';
    if (!this.balancerService.isAlgorithmName(algorithm)) {
      await interaction.editReply(`Unknown algorithm "${algorithm}".`);
      return;
    }

    const rawPlayers = interaction.fields.getTextInputValue(
      BALANCE_TEAMS_MODAL_INPUT_ID,
    );
    const rawOptions = interaction.fields
      .getTextInputValue(BALANCE_TEAMS_MODAL_OPTIONS_ID)
      .trim();

    const playersJson = tryParseJson(rawPlayers);
    if (!playersJson) {
      await interaction.editReply(
        'Invalid players JSON. Please check the format and try again.',
      );
      return;
    }

    const optionsJson = rawOptions ? tryParseJson(rawOptions) : { value: {} };
    if (!optionsJson) {
      await interaction.editReply(
        'Invalid options JSON. Please check the format and try again.',
      );
      return;
    }

    const players = balancerInputSchema.safeParse(playersJson.value);
    if (!players.success) {
      await interaction.editReply(
        `Invalid players data: ${describeIssues(players.error.issues)}`,
      );
      return;
    }

    const options = balancerOptionsSchema.safeParse(optionsJson.value);
    if (!options.success) {
      await interaction.editReply(
        `Invalid options: ${describeIssues(options.error.issues)}`,
      );
      return;
    }

    try {
      const result = this.balancerService.balanceTeams(players.data, {
        ...options.data,
        algorithm,
      });
      await interaction.editReply(formatResult(result));
    } catch (error) {
      if (error instanceof InvalidBalancerInputError) {
        await interaction.editReply(error.message);
        return;
      }
      throw error;
    }
  }
}

function tryParseJson(raw: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return undefined;
  }
}

function describeIssues(issues: ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

function formatResult(result: BalancedTeams): string {
  const { metrics } = result;
  const lines = [`Algorithm: ${result.algorithm}`];

  result.teams.forEach((team, index) => {
    lines.push('', `Team ${index + 1} (total ${team.totalRating})`);
    for (const slot of team.slots) {
      lines.push(
        `  ${slot.role.padEnd(8)} ${slot.player.username} (${slot.rating})`,
      );
    }
  });

  lines.push(
    '',
    `Spread: total ${metrics.totalSpread}, roles ${metrics.roleSpread}, stars ${metrics.starSpread}`,
    `Score: ${metrics.score.toFixed(1)} (lower is better)`,
  );

  return '```\n' + lines.join('\n') + '\n```';
}
