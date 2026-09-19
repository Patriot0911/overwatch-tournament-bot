import { z } from 'zod';

/** Omitted or null means the player does not play that role at all. */
const roleRatingSchema = z.number().min(0).nullish();

export const balancerPlayerInputSchema = z
  .object({
    discordId: z.string().min(1),
    username: z.string().min(1),
    tank: roleRatingSchema,
    damage: roleRatingSchema,
    support: roleRatingSchema,
  })
  .refine(
    (player) =>
      [player.tank, player.damage, player.support].some(
        (rating) => rating != null,
      ),
    { message: 'player must have a rating for at least one role' },
  );

export const balancerInputSchema = z
  .array(balancerPlayerInputSchema)
  .min(2)
  .refine(
    (players) =>
      new Set(players.map((player) => player.discordId)).size ===
      players.length,
    { message: 'discordId values must be unique' },
  );

export type BalancerPlayerInput = z.infer<typeof balancerPlayerInputSchema>;
export type BalancerInput = z.infer<typeof balancerInputSchema>;
