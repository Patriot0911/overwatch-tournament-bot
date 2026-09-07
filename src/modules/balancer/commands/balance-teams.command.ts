import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { Command } from '../../discord/decorators/command.decorator';
import { ModalSubmit } from '../../discord/decorators/modal.decorator';
import {
  BALANCE_TEAMS_MODAL_ID,
  BALANCE_TEAMS_MODAL_INPUT_ID,
} from '../balancer.constants';
import { BalancerService } from '../balancer.service';
import { balancerInputSchema } from '../dto/balancer-input.schema';
import balanceTeamsMeta from './balance-teams.meta';

@Injectable()
export class BalanceTeamsCommand {
  constructor(private readonly balancerService: BalancerService) {}

  @Command(balanceTeamsMeta())
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const playersInput = new TextInputBuilder()
      .setCustomId(BALANCE_TEAMS_MODAL_INPUT_ID)
      .setLabel('Players JSON')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        '[{"discordId":"...","username":"...","tank":0,"damage":0,"support":0}]',
      )
      .setRequired(true);

    const modal = new ModalBuilder()
      .setCustomId(`${BALANCE_TEAMS_MODAL_ID}:submit`)
      .setTitle('Balance teams')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(playersInput),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(BALANCE_TEAMS_MODAL_ID)
  async handleSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const raw = interaction.fields.getTextInputValue(
      BALANCE_TEAMS_MODAL_INPUT_ID,
    );

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      await interaction.editReply(
        'Invalid JSON. Please check the format and try again.',
      );
      return;
    }

    const result = balancerInputSchema.safeParse(parsedJson);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      await interaction.editReply(`Invalid players data: ${message}`);
      return;
    }

    try {
      this.balancerService.balanceTeams(result.data);
    } catch (error) {
      if (error instanceof NotImplementedException) {
        await interaction.editReply(
          `Parsed ${result.data.length} player(s) successfully. Balancing algorithm is not implemented yet.`,
        );
        return;
      }
      throw error;
    }
  }
}
