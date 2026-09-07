import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export default function balanceTeamsMeta() {
  return new SlashCommandBuilder()
    .setName('balance-teams')
    .setDescription(
      'Balance players into two teams based on their role ratings',
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON();
}
