import { z } from 'zod';

const slotCount = z.number().int().min(0);
const roleWeight = z.number().positive();

// Every level is strict so a misspelled key is reported, not silently dropped.
export const balancerOptionsSchema = z
  .object({
    teamCount: z.number().int().min(2).optional(),
    composition: z
      .object({ tank: slotCount, damage: slotCount, support: slotCount })
      .strict()
      .optional(),
    roleWeights: z
      .object({ tank: roleWeight, damage: roleWeight, support: roleWeight })
      .strict()
      .partial()
      .optional(),
  })
  .strict();

export type BalancerOptionsInput = z.infer<typeof balancerOptionsSchema>;
