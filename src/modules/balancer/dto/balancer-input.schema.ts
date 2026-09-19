import { z, type ZodError } from 'zod';
import { parseRankValue } from '../rank-parser';

const rankValueSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const parsed = parseRankValue(value);
    if (parsed === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Invalid rank: expected a positive natural number or a valid Overwatch rank (e.g. "Gold 3", "Emerald 1", "Champion")',
      });
      return z.NEVER;
    }
    return parsed;
  });

/** Omitted or null means the player does not play that role at all. */
const roleRatingSchema = rankValueSchema
  .nullish()
  .transform((rating) => rating ?? undefined);

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
      player.tank !== undefined ||
      player.damage !== undefined ||
      player.support !== undefined,
    {
      message: 'At least one of tank, damage or support must be provided',
    },
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

export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function emptyToUndefined(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
