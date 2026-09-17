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

export const balancerPlayerInputSchema = z
  .object({
    discordId: z.string().min(1),
    username: z.string().min(1),
    tank: rankValueSchema.optional(),
    damage: rankValueSchema.optional(),
    support: rankValueSchema.optional(),
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

export const balancerInputSchema = z.array(balancerPlayerInputSchema).min(2);

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
