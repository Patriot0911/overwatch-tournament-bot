import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ALGORITHM_NAMES } from '../balancer.constants';

export default function balanceTeamsMeta() {
  return new SlashCommandBuilder()
    .setName('balance-teams')
    .setDescription('Balance players into teams based on their role ratings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('algorithm')
        .setDescription('Balancing algorithm (default: simulated-annealing)')
        .addChoices(...ALGORITHM_NAMES.map((name) => ({ name, value: name }))),
    )
    .toJSON();
}
