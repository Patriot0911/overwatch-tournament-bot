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

const hasUniqueDiscordIds = (players: { discordId: string }[]): boolean =>
  new Set(players.map((player) => player.discordId)).size === players.length;

const uniqueIdsIssue = { message: 'discordId values must be unique' };

/** A list of any size, including empty. */
export const balancerListSchema = z
  .array(balancerPlayerInputSchema)
  .refine(hasUniqueDiscordIds, uniqueIdsIssue);

/** A list that is large enough to be balanced. */
export const balancerInputSchema = z
  .array(balancerPlayerInputSchema)
  .min(2)
  .refine(hasUniqueDiscordIds, uniqueIdsIssue);

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

export function tryParseJson(raw: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return undefined;
  }
}

/** One player per line; ratings are exported as numbers so it round-trips. */
export function stringifyPlayers(players: BalancerPlayerInput[]): string {
  if (players.length === 0) return '[]';

  const lines = players.map((player) => '  ' + JSON.stringify(player));
  return ['[', lines.join(',\n'), ']'].join('\n');
}
