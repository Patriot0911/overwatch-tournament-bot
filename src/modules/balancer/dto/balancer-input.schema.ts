import { z } from 'zod';

export const balancerPlayerInputSchema = z.object({
  discordId: z.string().min(1),
  username: z.string().min(1),
  tank: z.number().min(0),
  damage: z.number().min(0),
  support: z.number().min(0),
});

export const balancerInputSchema = z.array(balancerPlayerInputSchema).min(2);

export type BalancerPlayerInput = z.infer<typeof balancerPlayerInputSchema>;
export type BalancerInput = z.infer<typeof balancerInputSchema>;
