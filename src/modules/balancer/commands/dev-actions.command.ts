import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type Message,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { ButtonClick } from '../../discord/decorators/button.decorator';
import { ModalSubmit } from '../../discord/decorators/modal.decorator';
import { SelectMenu } from '../../discord/decorators/select-menu.decorator';
import { BalanceListSessionStore } from '../balance-list-session.store';
import { closePublicList, refreshPublicList } from '../balance-list.publisher';
import {
  APPLY_JSON_BUTTON_ID,
  APPLY_JSON_INPUT_ID,
  APPLY_JSON_MODAL_ID,
  COPY_JSON_BUTTON_ID,
  DEV_BUTTON_ID,
  END_SESSION_BUTTON_ID,
  END_SESSION_CONFIRM_BUTTON_ID,
  MESSAGE_CONTENT_LIMIT,
  MODAL_INPUT_VALUE_LIMIT,
  RESPAWN_BUTTON_ID,
  SESSION_EXPIRED_MESSAGE,
  SET_OWNER_BUTTON_ID,
  SET_OWNER_SELECT_ID,
} from '../balancer.constants';
import {
  balancerListSchema,
  type BalancerPlayerInput,
  formatZodIssues,
  stringifyPlayers,
  tryParseJson,
} from '../dto/balancer-input.schema';
import {
  buildListEmbed,
  buildManagerButtonsRow,
  buildPublicButtonsRow,
} from '../views/balance-list.view';
import {
  buildDevPanelEmbed,
  buildDevPanelRows,
  buildEndSessionConfirmEmbed,
  buildEndSessionConfirmRow,
  buildMovedEmbed,
  buildSessionEndedEmbed,
  buildSetOwnerComponents,
  buildSetOwnerEmbed,
} from '../views/dev-actions.view';

const JSON_FENCE_OVERHEAD = '```json\n\n```'.length;

/** The "Dev" section of the ephemeral manager panel. */
@Injectable()
export class DevActionsCommand {
  private readonly logger = new Logger(DevActionsCommand.name);

  constructor(private readonly sessionStore: BalanceListSessionStore) {}

  @ButtonClick(DEV_BUTTON_ID)
  async handleDevButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await this.replyExpired(interaction);
      return;
    }

    await interaction.update(
      this.devPanel(interaction.message.id, players.length),
    );
  }

  @ButtonClick(SET_OWNER_BUTTON_ID)
  async handleSetOwnerButton(interaction: ButtonInteraction): Promise<void> {
    if (!this.sessionStore.get(interaction.message.id)) {
      await this.replyExpired(interaction);
      return;
    }

    await interaction.update({
      embeds: [
        buildSetOwnerEmbed(this.sessionStore.getOwner(interaction.message.id)),
      ],
      components: buildSetOwnerComponents(),
    });
  }

  @SelectMenu(SET_OWNER_SELECT_ID)
  async handleSetOwnerSelect(
    interaction: AnySelectMenuInteraction,
  ): Promise<void> {
    if (!interaction.isUserSelectMenu()) return;

    const user = interaction.users.first();
    if (!user) return;
    if (user.bot) {
      await interaction.reply({
        content: 'A bot cannot own the balancer.',
        ephemeral: true,
      });
      return;
    }

    if (!this.sessionStore.setOwner(interaction.message.id, user.id)) {
      await this.replyExpired(interaction);
      return;
    }

    const players = this.sessionStore.get(interaction.message.id) ?? [];
    await interaction.update(
      this.devPanel(interaction.message.id, players.length),
    );
  }

  @ButtonClick(RESPAWN_BUTTON_ID)
  async handleRespawn(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await this.replyExpired(interaction);
      return;
    }

    const oldMessageId = this.sessionStore.resolve(interaction.message.id);
    const newMessage = await this.postBalancer(interaction, players);
    if (!newMessage) {
      await interaction.reply({
        content:
          'Could not post a new message in this channel. Check that the bot is allowed to send messages here.',
        ephemeral: true,
      });
      return;
    }

    this.sessionStore.moveSession(oldMessageId, newMessage.id);

    await interaction.update(
      this.devPanel(interaction.message.id, players.length),
    );
    await interaction.followUp({
      content: `Respawned: ${newMessage.url}`,
      ephemeral: true,
    });

    try {
      await interaction.channel?.messages.edit(oldMessageId, {
        embeds: [buildMovedEmbed(newMessage.url)],
        components: [],
      });
    } catch (error) {
      // The old message may have been deleted already; nothing left to close.
      this.logger.warn(
        `Could not close the old balancer message ${oldMessageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @ButtonClick(COPY_JSON_BUTTON_ID)
  async handleCopyJson(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await this.replyExpired(interaction);
      return;
    }

    const json = stringifyPlayers(players);
    if (json.length + JSON_FENCE_OVERHEAD <= MESSAGE_CONTENT_LIMIT) {
      await interaction.reply({
        content: `\`\`\`json\n${json}\n\`\`\``,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content:
        'The list is too long for a message, so it is attached as a file.',
      files: [
        new AttachmentBuilder(Buffer.from(json, 'utf8'), {
          name: 'balancer-players.json',
        }),
      ],
      ephemeral: true,
    });
  }

  @ButtonClick(APPLY_JSON_BUTTON_ID)
  async handleApplyJsonButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await this.replyExpired(interaction);
      return;
    }

    const input = new TextInputBuilder()
      .setCustomId(APPLY_JSON_INPUT_ID)
      .setLabel('Players JSON (replaces the whole list)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const current = stringifyPlayers(players);
    if (current.length <= MODAL_INPUT_VALUE_LIMIT) input.setValue(current);

    const modal = new ModalBuilder()
      .setCustomId(`${APPLY_JSON_MODAL_ID}:apply`)
      .setTitle('Apply JSON')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(APPLY_JSON_MODAL_ID)
  async handleApplyJsonSubmit(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    if (!interaction.isFromMessage()) return;

    const parsedJson = tryParseJson(
      interaction.fields.getTextInputValue(APPLY_JSON_INPUT_ID),
    );
    if (!parsedJson) {
      await interaction.reply({
        content: 'Invalid JSON. The list was not changed.',
        ephemeral: true,
      });
      return;
    }

    const result = balancerListSchema.safeParse(parsedJson.value);
    if (!result.success) {
      await interaction.reply({
        content: `Invalid players data, the list was not changed: ${formatZodIssues(result.error)}`,
        ephemeral: true,
      });
      return;
    }

    const sessionId = interaction.message.id;
    const players = this.sessionStore.replacePlayers(sessionId, result.data);
    if (!players) {
      await interaction.reply({
        content: SESSION_EXPIRED_MESSAGE,
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: [buildManagerButtonsRow(players)],
    });
    await interaction.followUp({
      content: `Applied ${players.length} player(s).`,
      ephemeral: true,
    });
    await refreshPublicList(
      interaction,
      this.sessionStore.resolve(sessionId),
      players,
    );
  }

  @ButtonClick(END_SESSION_BUTTON_ID)
  async handleEndSessionButton(interaction: ButtonInteraction): Promise<void> {
    const players = this.sessionStore.get(interaction.message.id);
    if (!players) {
      await this.replyExpired(interaction);
      return;
    }

    await interaction.update({
      embeds: [buildEndSessionConfirmEmbed(players.length)],
      components: [buildEndSessionConfirmRow()],
    });
  }

  @ButtonClick(END_SESSION_CONFIRM_BUTTON_ID)
  async handleEndSessionConfirm(interaction: ButtonInteraction): Promise<void> {
    const sessionId = this.sessionStore.resolve(interaction.message.id);
    const players = this.sessionStore.remove(interaction.message.id);
    if (!players) {
      await this.replyExpired(interaction);
      return;
    }

    await interaction.update({
      embeds: [buildSessionEndedEmbed()],
      components: [],
    });
    await closePublicList(interaction, sessionId, players);
  }

  private devPanel(messageId: string, playerCount: number) {
    return {
      embeds: [
        buildDevPanelEmbed(playerCount, this.sessionStore.getOwner(messageId)),
      ],
      components: buildDevPanelRows(),
    };
  }

  private async postBalancer(
    interaction: ButtonInteraction,
    players: BalancerPlayerInput[],
  ): Promise<Message | undefined> {
    try {
      const channel = interaction.channel;
      if (!channel?.isSendable()) return undefined;

      return await channel.send({
        embeds: [buildListEmbed(players)],
        components: [buildPublicButtonsRow()],
      });
    } catch (error) {
      this.logger.warn(
        `Could not post the balancer again: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async replyExpired(
    interaction: MessageComponentInteraction,
  ): Promise<void> {
    await interaction.reply({
      content: SESSION_EXPIRED_MESSAGE,
      ephemeral: true,
    });
  }
}
