import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { SETUP_BALANCER_IMPORT_OPTION } from '../balancer.constants';

export default function setupBalanceListMeta() {
  return new SlashCommandBuilder()
    .setName('setup-balancer')
    .setDescription('Set up the balancer and prepare its list of players')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) =>
      option
        .setName(SETUP_BALANCER_IMPORT_OPTION)
        .setDescription('Paste a JSON array of players before setting up')
        .setRequired(false),
    )
    .toJSON();
}
