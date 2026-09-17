import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export default function setupBalanceListMeta() {
  return new SlashCommandBuilder()
    .setName('setup-balance-list')
    .setDescription(
      'Input players and their role ranks to prepare a balance list',
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON();
}
