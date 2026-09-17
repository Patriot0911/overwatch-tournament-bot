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

    const providers = this.discoveryService.getProviders();
    this.logger.debug(`Scanning ${providers.length} discovered provider(s) for Discord handlers.`);

    for (const wrapper of providers) {
      if (!wrapper.instance) continue;

      const instance = wrapper.instance;
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      const providerName = wrapper.name?.toString() ?? instance.constructor?.name ?? 'UnknownProvider';

      this.metadataScanner.getAllMethodNames(prototype).forEach((methodName) => {
        const method = instance[methodName];

        const commandMetadata: CommandMetadata | undefined = this.reflector.get(COMMAND_METADATA, method);
        if (commandMetadata) {
          commands.push(commandMetadata.body);
          this.commandHandlers.set(commandMetadata.body.name, method.bind(instance));
          this.logger.debug(
            `Found command "${commandMetadata.body.name}" in ${providerName}.${methodName}.`,
          );
        }

        const buttonPrefix: string | undefined = this.reflector.get(BUTTON_METADATA, method);
        if (buttonPrefix) {
          this.buttonHandlers.set(buttonPrefix, method.bind(instance));
          this.logger.debug(`Found button handler "${buttonPrefix}" in ${providerName}.${methodName}.`);
        }

        const modalPrefix: string | undefined = this.reflector.get(MODAL_METADATA, method);
        if (modalPrefix) {
          this.modalHandlers.set(modalPrefix, method.bind(instance));
          this.logger.debug(`Found modal handler "${modalPrefix}" in ${providerName}.${methodName}.`);
        }

        const selectMenuPrefix: string | undefined = this.reflector.get(SELECT_MENU_METADATA, method);
        if (selectMenuPrefix) {
          this.selectMenuHandlers.set(selectMenuPrefix, method.bind(instance));
          this.logger.debug(`Found select menu handler "${selectMenuPrefix}" in ${providerName}.${methodName}.`);
        }

        const autocompleteCommandName: string | undefined = this.reflector.get(AUTOCOMPLETE_METADATA, method);
        if (autocompleteCommandName) {
          this.autocompleteHandlers.set(autocompleteCommandName, method.bind(instance));
          this.logger.debug(
            `Found autocomplete handler "${autocompleteCommandName}" in ${providerName}.${methodName}.`,
          );
        }
      });
    }

    if (commands.length === 0) {
      this.logger.warn('No slash commands were discovered. Check that command providers are registered in their module and decorated with @Command.');
    } else {
      this.logger.log(`Discovered ${commands.length} slash command(s): ${commands.map((c) => c.name).join(', ')}`);
    }

    const token = this.configService.get('DISCORD_TOKEN', { infer: true });
    const clientId = this.configService.get('DISCORD_CLIENT_ID', { infer: true });

    if (!token || !clientId) {
      this.logger.error(
        `Cannot register commands: missing ${!token ? 'DISCORD_TOKEN' : ''} ${!clientId ? 'DISCORD_CLIENT_ID' : ''}`.trim(),
      );
      return;
    }

    this.logger.debug(`Registering commands for application (client) ID "${clientId}" via PUT ${Routes.applicationCommands(clientId)}.`);

    const rest = new REST().setToken(token);

    try {
      const result = (await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      })) as unknown[];
      this.logger.log(
        `Registered ${commands.length} slash command(s) with Discord (API returned ${result.length} command(s)). ` +
          'Note: global command updates can take up to 1 hour to propagate to all clients.',
      );
    } catch (error) {
      this.logger.error(
        `Failed to register slash commands with Discord: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

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
