import { Injectable } from '@nestjs/common';
import {
  ModalBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { ButtonClick } from '../../discord/decorators/button.decorator';
import { ModalSubmit } from '../../discord/decorators/modal.decorator';
import { BalanceListSessionStore } from '../balance-list-session.store';
import {
  CALL_MANAGER_BUTTON_ID,
  JOIN_BUTTON_ID,
  JOIN_MODAL_ID,
  LEAVE_BUTTON_ID,
  PLAYER_FORM_FIELD_DAMAGE,
  PLAYER_FORM_FIELD_SUPPORT,
  PLAYER_FORM_FIELD_TANK,
  SESSION_EXPIRED_MESSAGE,
} from '../balancer.constants';
import {
  balancerPlayerInputSchema,
  emptyToUndefined,
  formatZodIssues,
} from '../dto/balancer-input.schema';
import {
  buildListEmbed,
  buildManagerButtonsRow,
  buildPublicButtonsRow,
  buildRankInputRow,
} from '../views/balance-list.view';

/** Controls of the public balancer message: Join, Leave and Call Manager. */
@Injectable()
export class PublicBalancerCommand {
  constructor(private readonly sessionStore: BalanceListSessionStore) {}

  @ButtonClick(JOIN_BUTTON_ID)
  async handleJoinButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    const existing = players.find(
      (player) => player.discordId === interaction.user.id,
    );

    const modal = new ModalBuilder()
      .setCustomId(`${JOIN_MODAL_ID}:join`)
      .setTitle(existing ? 'Update your ranks' : 'Join the balancer')
      .addComponents(
        buildRankInputRow(PLAYER_FORM_FIELD_TANK, 'Tank', existing?.tank),
        buildRankInputRow(PLAYER_FORM_FIELD_DAMAGE, 'Damage', existing?.damage),
        buildRankInputRow(
          PLAYER_FORM_FIELD_SUPPORT,
          'Support',
          existing?.support,
        ),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(JOIN_MODAL_ID)
  async handleJoinModalSubmit(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    if (!interaction.isFromMessage()) return;

    const sessionId = interaction.message.id;
    const current = this.sessionStore.get(sessionId);
    if (!current) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    const result = balancerPlayerInputSchema.safeParse({
      discordId: interaction.user.id,
      username: interaction.user.username,
      tank: emptyToUndefined(
        interaction.fields.getTextInputValue(PLAYER_FORM_FIELD_TANK),
      ),
      damage: emptyToUndefined(
        interaction.fields.getTextInputValue(PLAYER_FORM_FIELD_DAMAGE),
      ),
      support: emptyToUndefined(
        interaction.fields.getTextInputValue(PLAYER_FORM_FIELD_SUPPORT),
      ),
    });
    if (!result.success) {
      await interaction.reply({
        content: formatZodIssues(result.error),
        ephemeral: true,
      });
      return;
    }

    const index = current.findIndex(
      (player) => player.discordId === result.data.discordId,
    );
    const players =
      index === -1
        ? this.sessionStore.addPlayer(sessionId, result.data)
        : this.sessionStore.updatePlayer(sessionId, index, result.data);

    await interaction.update({
      embeds: [buildListEmbed(players ?? current)],
      components: [buildPublicButtonsRow()],
    });
  }

  @ButtonClick(LEAVE_BUTTON_ID)
  async handleLeaveButton(interaction: ButtonInteraction): Promise<void> {
    const sessionId = interaction.message.id;
    const current = this.sessionStore.get(sessionId);
    if (!current) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    const index = current.findIndex(
      (player) => player.discordId === interaction.user.id,
    );
    if (index === -1) {
      await interaction.reply({
        content: 'You are not in the list.',
        ephemeral: true,
      });
      return;
    }

    const players = this.sessionStore.removePlayer(sessionId, index);

    await interaction.update({
      embeds: [buildListEmbed(players ?? current)],
      components: [buildPublicButtonsRow()],
    });
  }

  @ButtonClick(CALL_MANAGER_BUTTON_ID)
  async handleCallManagerButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    const isAdmin = interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator,
    );
    const isOwner = this.sessionStore.isOwner(
      interaction.message.id,
      interaction.user.id,
    );
    if (!isAdmin && !isOwner) {
      await interaction.reply({
        content:
          'Only administrators or the person who set up this balancer can manage it.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [buildListEmbed(players)],
      components: [buildManagerButtonsRow(players)],
      ephemeral: true,
    });

    const managerMessage = await interaction.fetchReply();
    this.sessionStore.linkManager(managerMessage.id, interaction.message.id);
  }
}
