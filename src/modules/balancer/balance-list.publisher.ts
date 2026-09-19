import type { Interaction } from 'discord.js';
import type { BalancerPlayerInput } from './dto/balancer-input.schema';
import {
  buildListEmbed,
  buildPublicButtonsRow,
} from './views/balance-list.view';

/**
 * Re-renders the public balancer message. Used when the list is changed from
 * an ephemeral manager message, which cannot update the public one directly.
 */
export async function refreshPublicList(
  interaction: Pick<Interaction, 'channel'>,
  publicMessageId: string,
  players: BalancerPlayerInput[],
): Promise<void> {
  await interaction.channel?.messages.edit(publicMessageId, {
    embeds: [buildListEmbed(players)],
    components: [buildPublicButtonsRow()],
  });
}

/** Closes the public message: the final list stays, its buttons go away. */
export async function closePublicList(
  interaction: Pick<Interaction, 'channel'>,
  publicMessageId: string,
  players: BalancerPlayerInput[],
): Promise<void> {
  await interaction.channel?.messages.edit(publicMessageId, {
    embeds: [buildListEmbed(players, { ended: true })],
    components: [],
  });
}
