import { SlashCommandBuilder } from 'discord.js';

export default function pingMeta() {
  return new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is alive and see its latency')
    .toJSON();
}
