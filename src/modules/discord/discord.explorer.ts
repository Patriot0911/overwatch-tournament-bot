import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import {
  REST,
  Routes,
  type AnySelectMenuInteraction,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type Client,
  type Interaction,
  type ModalSubmitInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { AppConfig } from '../../config/config.schema';
import { AUTOCOMPLETE_METADATA } from './decorators/autocomplete.decorator';
import { BUTTON_METADATA } from './decorators/button.decorator';
import { COMMAND_METADATA, type CommandMetadata } from './decorators/command.decorator';
import { DISCORD_EVENT_METADATA } from './decorators/discord-event.decorator';
import { MODAL_METADATA } from './decorators/modal.decorator';
import { SELECT_MENU_METADATA } from './decorators/select-menu.decorator';
import { DISCORD_CLIENT } from './discord.constants';

@Injectable()
export class DiscordExplorer implements OnModuleInit {
  private readonly logger = new Logger(DiscordExplorer.name);
  private readonly commandHandlers = new Map<string, (interaction: Interaction) => Promise<void>>();
  private readonly buttonHandlers = new Map<string, (interaction: ButtonInteraction) => Promise<void>>();
  private readonly modalHandlers = new Map<string, (interaction: ModalSubmitInteraction) => Promise<void>>();
  private readonly selectMenuHandlers = new Map<string, (interaction: AnySelectMenuInteraction) => Promise<void>>();
  private readonly autocompleteHandlers = new Map<string, (interaction: AutocompleteInteraction) => Promise<void>>();

  constructor(
    @Inject(DISCORD_CLIENT) private readonly client: Client,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerInteractionHandlers();
    this.registerEventListeners();
  }

  private async registerInteractionHandlers(): Promise<void> {
    const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

    for (const wrapper of this.discoveryService.getProviders()) {
      if (!wrapper.instance) continue;

      const instance = wrapper.instance;
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      this.metadataScanner.getAllMethodNames(prototype).forEach((methodName) => {
        const method = instance[methodName];

        const commandMetadata: CommandMetadata | undefined = this.reflector.get(COMMAND_METADATA, method);
        if (commandMetadata) {
          commands.push(commandMetadata.body);
          this.commandHandlers.set(commandMetadata.body.name, method.bind(instance));
        }

        const buttonPrefix: string | undefined = this.reflector.get(BUTTON_METADATA, method);
        if (buttonPrefix) {
          this.buttonHandlers.set(buttonPrefix, method.bind(instance));
        }

        const modalPrefix: string | undefined = this.reflector.get(MODAL_METADATA, method);
        if (modalPrefix) {
          this.modalHandlers.set(modalPrefix, method.bind(instance));
        }

        const selectMenuPrefix: string | undefined = this.reflector.get(SELECT_MENU_METADATA, method);
        if (selectMenuPrefix) {
          this.selectMenuHandlers.set(selectMenuPrefix, method.bind(instance));
        }

        const autocompleteCommandName: string | undefined = this.reflector.get(AUTOCOMPLETE_METADATA, method);
        if (autocompleteCommandName) {
          this.autocompleteHandlers.set(autocompleteCommandName, method.bind(instance));
        }
      });
    }

    const rest = new REST().setToken(this.configService.get('DISCORD_TOKEN', { infer: true }));
    const clientId = this.configService.get('DISCORD_CLIENT_ID', { infer: true });

    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    this.logger.log(`Registered ${commands.length} slash command(s).`);

    this.client.on('interactionCreate', (interaction: Interaction) => this.dispatchInteraction(interaction));
  }

  private registerEventListeners(): void {
    for (const wrapper of this.discoveryService.getProviders()) {
      if (!wrapper.instance) continue;

      const instance = wrapper.instance;
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      this.metadataScanner.getAllMethodNames(prototype).forEach((methodName) => {
        const eventName: string | undefined = this.reflector.get(DISCORD_EVENT_METADATA, instance[methodName]);
        if (!eventName) return;

        this.client.on(eventName, instance[methodName].bind(instance));
      });
    }
  }

  private dispatchInteraction(interaction: Interaction): void {
    if (interaction.isChatInputCommand()) {
      this.runHandler(this.commandHandlers.get(interaction.commandName), interaction, interaction.commandName);
      return;
    }

    if (interaction.isButton()) {
      const prefix = getCustomIdPrefix(interaction.customId);
      this.runHandler(this.buttonHandlers.get(prefix), interaction, prefix);
      return;
    }

    if (interaction.isModalSubmit()) {
      const prefix = getCustomIdPrefix(interaction.customId);
      this.runHandler(this.modalHandlers.get(prefix), interaction, prefix);
      return;
    }

    if (interaction.isAnySelectMenu()) {
      const prefix = getCustomIdPrefix(interaction.customId);
      this.runHandler(this.selectMenuHandlers.get(prefix), interaction, prefix);
      return;
    }

    if (interaction.isAutocomplete()) {
      this.runHandler(this.autocompleteHandlers.get(interaction.commandName), interaction, interaction.commandName);
    }
  }

  private runHandler<T>(handler: ((interaction: T) => Promise<void>) | undefined, interaction: T, id: string): void {
    if (!handler) return;

    handler(interaction).catch((error: unknown) => {
      this.logger.error(`Interaction handler "${id}" failed`, error instanceof Error ? error.stack : String(error));
    });
  }
}

function getCustomIdPrefix(customId: string): string {
  return customId.substring(0, customId.lastIndexOf(':'));
}
