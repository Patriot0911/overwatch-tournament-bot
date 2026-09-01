import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  // Discord
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string(),

  // PostgreSQL
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
});

export type AppConfig = z.infer<typeof configSchema>;
