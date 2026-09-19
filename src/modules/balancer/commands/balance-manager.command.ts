import { Injectable } from '@nestjs/common';
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  MessageComponentInteraction,
} from 'discord.js';
import { ButtonClick } from '../../discord/decorators/button.decorator';
import { SelectMenu } from '../../discord/decorators/select-menu.decorator';
import { parseChoice, type BalanceChoice } from '../balance-choice';
import { BalanceListSessionStore } from '../balance-list-session.store';
import {
  BALANCE_BUTTON_ID,
  BALANCE_SELECT_ID,
  REROLL_BUTTON_ID,
  SESSION_EXPIRED_MESSAGE,
  VARIETY_LEVELS,
} from '../balancer.constants';
import {
  BalancerService,
  InvalidBalancerInputError,
} from '../balancer.service';
import type { BalancedTeams } from '../interfaces/balanced-teams.interface';
import {
  buildBalanceChooserComponents,
  buildBalanceChooserEmbed,
  buildBalanceResultEmbed,
  buildBalanceResultRow,
} from '../views/balance-teams.view';

/** The "Balance" section of the ephemeral manager panel. */
@Injectable()
export class BalanceManagerCommand {
  constructor(
    private readonly sessionStore: BalanceListSessionStore,
    private readonly balancerService: BalancerService,
  ) {}

  @ButtonClick(BALANCE_BUTTON_ID)
  async handleBalanceButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [
        buildBalanceChooserEmbed(
          players.length,
          this.balancerService.planTeams(players.length),
        ),
      ],
      components: buildBalanceChooserComponents(
        this.balancerService.listAlgorithms(),
      ),
    });
  }

  @SelectMenu(BALANCE_SELECT_ID)
  async handleBalanceSelect(
    interaction: AnySelectMenuInteraction,
  ): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;

    const choice = parseChoice(interaction.values[0]);
    if (!choice) {
      await interaction.reply({
        content: 'Unknown algorithm choice.',
        ephemeral: true,
      });
      return;
    }

    await this.runBalance(interaction, choice);
  }

  @ButtonClick(REROLL_BUTTON_ID)
  async handleReroll(interaction: ButtonInteraction): Promise<void> {
    const choice = parseChoice(interaction.customId.split(':').pop() ?? '');
    if (!choice) {
      await interaction.reply({
        content: 'Unknown algorithm choice.',
        ephemeral: true,
      });
      return;
    }

    await this.runBalance(interaction, choice);
  }

  private async runBalance(
    interaction: MessageComponentInteraction,
    choice: BalanceChoice,
  ): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    // Exhaustive search can take a couple of seconds: acknowledge first.
    await interaction.deferUpdate();

    let result: BalancedTeams;
    try {
      result = this.balancerService.balanceTeams(players, {
        algorithm: choice.algorithm,
        variety:
          choice.mode === 'accurate'
            ? undefined
            : { toleranceFactor: VARIETY_LEVELS[choice.mode] },
      });
    } catch (error) {
      if (error instanceof InvalidBalancerInputError) {
        await interaction.followUp({ content: error.message, ephemeral: true });
        return;
      }
      throw error;
    }

    await interaction.editReply({
      embeds: [buildBalanceResultEmbed(result, choice)],
      components: [buildBalanceResultRow(choice)],
    });
  }
}
