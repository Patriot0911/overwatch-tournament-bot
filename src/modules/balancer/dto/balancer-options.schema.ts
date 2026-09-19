import { z } from 'zod';

const slotCount = z.number().int().min(0);
const roleWeight = z.number().positive();

export const balancerOptionsSchema = z
  .object({
    teamCount: z.number().int().min(2).optional(),
    composition: z
      .object({ tank: slotCount, damage: slotCount, support: slotCount })
      .optional(),
    roleWeights: z
      .object({ tank: roleWeight, damage: roleWeight, support: roleWeight })
      .partial()
      .optional(),
  })
  .strict();

export type BalancerOptionsInput = z.infer<typeof balancerOptionsSchema>;
