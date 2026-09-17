import { Injectable } from '@nestjs/common';
import {
  ModalBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { ButtonClick } from '../../discord/decorators/button.decorator';
import { ModalSubmit } from '../../discord/decorators/modal.decorator';
import { SelectMenu } from '../../discord/decorators/select-menu.decorator';
import { BalanceListSessionStore } from '../balance-list-session.store';
import {
  BACK_BUTTON_ID,
  EDIT_LIST_BUTTON_ID,
  EDIT_LIST_PAGE_BUTTON_ID,
  EDIT_LIST_SELECT_ID,
  EDIT_PLAYER_BUTTON_ID,
  EDIT_PLAYER_MODAL_ID,
  PLAYER_FORM_FIELD_DAMAGE,
  PLAYER_FORM_FIELD_SUPPORT,
  PLAYER_FORM_FIELD_TANK,
  REMOVE_PLAYER_BUTTON_ID,
} from '../balancer.constants';
import {
  balancerPlayerInputSchema,
  emptyToUndefined,
  formatZodIssues,
} from '../dto/balancer-input.schema';
import {
  buildEditListComponents,
  buildListEmbed,
  buildMainButtonsRow,
  buildPlayerActionsRow,
  buildPlayerSummaryEmbed,
  buildRankInputRow,
} from '../views/balance-list.view';

@Injectable()
export class EditBalanceListCommand {
  constructor(private readonly sessionStore: BalanceListSessionStore) {}

  @ButtonClick(EDIT_LIST_BUTTON_ID)
  async handleEditListButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players?.length) {
      await interaction.reply({
        content: 'The list is empty.',
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: buildEditListComponents(players, 0),
    });
  }

  @ButtonClick(EDIT_LIST_PAGE_BUTTON_ID)
  async handleEditListPageButton(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const page = Number(interaction.customId.split(':').pop());
    const players = this.sessionStore.get(interaction.message.id) ?? [];

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: buildEditListComponents(players, page),
    });
  }

  @SelectMenu(EDIT_LIST_SELECT_ID)
  async handleEditListSelect(
    interaction: AnySelectMenuInteraction,
  ): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;

    const index = Number(interaction.values[0]);
    const player = this.sessionStore.get(interaction.message.id)?.[index];
    if (!player) {
      await interaction.reply({
        content: 'Player not found, the list may have changed.',
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [buildPlayerSummaryEmbed(player)],
      components: [buildPlayerActionsRow(index)],
    });
  }

  @ButtonClick(EDIT_PLAYER_BUTTON_ID)
  async handleEditPlayerButton(interaction: ButtonInteraction): Promise<void> {
    const index = Number(interaction.customId.split(':').pop());
    const player = this.sessionStore.get(interaction.message.id)?.[index];
    if (!player) {
      await interaction.reply({
        content: 'Player not found, the list may have changed.',
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${EDIT_PLAYER_MODAL_ID}:${index}`)
      .setTitle(`Edit ranks: ${player.username}`)
      .addComponents(
        buildRankInputRow(PLAYER_FORM_FIELD_TANK, 'Tank', player.tank),
        buildRankInputRow(PLAYER_FORM_FIELD_DAMAGE, 'Damage', player.damage),
        buildRankInputRow(PLAYER_FORM_FIELD_SUPPORT, 'Support', player.support),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(EDIT_PLAYER_MODAL_ID)
  async handleEditPlayerModalSubmit(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    if (!interaction.isFromMessage()) return;

    const sessionId = interaction.message.id;
    const index = Number(interaction.customId.split(':').pop());
    const current = this.sessionStore.get(sessionId)?.[index];
    if (!current) {
      await interaction.reply({
        content: 'Player not found, the list may have changed.',
        ephemeral: true,
      });
      return;
    }

    const candidate = {
      ...current,
      tank: emptyToUndefined(
        interaction.fields.getTextInputValue(PLAYER_FORM_FIELD_TANK),
      ),
      damage: emptyToUndefined(
        interaction.fields.getTextInputValue(PLAYER_FORM_FIELD_DAMAGE),
      ),
      support: emptyToUndefined(
        interaction.fields.getTextInputValue(PLAYER_FORM_FIELD_SUPPORT),
      ),
    };

    const result = balancerPlayerInputSchema.safeParse(candidate);
    if (!result.success) {
      await interaction.reply({
        content: formatZodIssues(result.error),
        ephemeral: true,
      });
      return;
    }

    const players = this.sessionStore.updatePlayer(
      sessionId,
      index,
      result.data,
    );
    if (!players) {
      await interaction.reply({
        content: 'Player not found, the list may have changed.',
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: [buildMainButtonsRow(players)],
    });
  }

  @ButtonClick(REMOVE_PLAYER_BUTTON_ID)
  async handleRemovePlayerButton(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const index = Number(interaction.customId.split(':').pop());
    const players = this.sessionStore.removePlayer(
      interaction.message.id,
      index,
    );
    if (!players) {
      await interaction.reply({
        content: 'Player not found, the list may have changed.',
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: [buildMainButtonsRow(players)],
    });
  }

  @ButtonClick(BACK_BUTTON_ID)
  async handleBackButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id) ?? [];

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: [buildMainButtonsRow(players)],
    });
  }
}
