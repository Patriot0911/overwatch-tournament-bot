import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { ButtonClick } from '../../discord/decorators/button.decorator';
import { Command } from '../../discord/decorators/command.decorator';
import { ModalSubmit } from '../../discord/decorators/modal.decorator';
import { BalanceListSessionStore } from '../balance-list-session.store';
import {
  ADD_PLAYER_BUTTON_ID,
  ADD_PLAYER_MODAL_ID,
  PLAYER_FORM_FIELD_DAMAGE,
  PLAYER_FORM_FIELD_DISCORD_ID,
  PLAYER_FORM_FIELD_SUPPORT,
  PLAYER_FORM_FIELD_TANK,
  PLAYER_FORM_FIELD_USERNAME,
  SETUP_BALANCE_LIST_MODAL_ID,
  SETUP_BALANCE_LIST_MODAL_INPUT_ID,
} from '../balancer.constants';
import {
  balancerInputSchema,
  balancerPlayerInputSchema,
  emptyToUndefined,
  formatZodIssues,
} from '../dto/balancer-input.schema';
import {
  buildListEmbed,
  buildMainButtonsRow,
  buildRankInputRow,
  buildTextInputRow,
} from '../views/balance-list.view';
import setupBalanceListMeta from './setup-balance-list.meta';

@Injectable()
export class SetupBalanceListCommand {
  constructor(private readonly sessionStore: BalanceListSessionStore) {}

  @Command(setupBalanceListMeta())
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const playersInput = new TextInputBuilder()
      .setCustomId(SETUP_BALANCE_LIST_MODAL_INPUT_ID)
      .setLabel('Players JSON')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        '[{"discordId":"...","username":"...","tank":"Gold 3","support":"Emerald 5"}]',
      )
      .setRequired(true);

    const modal = new ModalBuilder()
      .setCustomId(`${SETUP_BALANCE_LIST_MODAL_ID}:submit`)
      .setTitle('Setup balance list')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(playersInput),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(SETUP_BALANCE_LIST_MODAL_ID)
  async handleSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const raw = interaction.fields.getTextInputValue(
      SETUP_BALANCE_LIST_MODAL_INPUT_ID,
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
      await interaction.editReply(
        `Invalid players data: ${formatZodIssues(result.error)}`,
      );
      return;
    }

    const message = await interaction.editReply({
      embeds: [buildListEmbed(result.data)],
      components: [buildMainButtonsRow(result.data)],
    });

    this.sessionStore.set(message.id, result.data);
  }

  @ButtonClick(ADD_PLAYER_BUTTON_ID)
  async handleAddPlayerButton(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`${ADD_PLAYER_MODAL_ID}:add`)
      .setTitle('Add player')
      .addComponents(
        buildTextInputRow(
          PLAYER_FORM_FIELD_DISCORD_ID,
          'Discord ID',
          undefined,
          true,
        ),
        buildTextInputRow(
          PLAYER_FORM_FIELD_USERNAME,
          'Username',
          undefined,
          true,
        ),
        buildRankInputRow(PLAYER_FORM_FIELD_TANK, 'Tank', undefined),
        buildRankInputRow(PLAYER_FORM_FIELD_DAMAGE, 'Damage', undefined),
        buildRankInputRow(PLAYER_FORM_FIELD_SUPPORT, 'Support', undefined),
      );

    await interaction.showModal(modal);
  }

  @ModalSubmit(ADD_PLAYER_MODAL_ID)
  async handleAddPlayerModalSubmit(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    if (!interaction.isFromMessage()) return;

    const sessionId = interaction.message.id;
    const candidate = {
      discordId: interaction.fields
        .getTextInputValue(PLAYER_FORM_FIELD_DISCORD_ID)
        .trim(),
      username: interaction.fields
        .getTextInputValue(PLAYER_FORM_FIELD_USERNAME)
        .trim(),
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

    const players = this.sessionStore.addPlayer(sessionId, result.data);
    if (!players) {
      await interaction.reply({
        content: 'Session expired. Please run /setup-balance-list again.',
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [buildListEmbed(players)],
      components: [buildMainButtonsRow(players)],
    });
  }
}
