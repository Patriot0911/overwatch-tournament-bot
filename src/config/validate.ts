import { configSchema } from './config.schema';

export function validate(config: Record<string, unknown>) {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(
      `Config validation failed:\n${JSON.stringify(formatted, null, 2)}`,
    );
  }
  return result.data;
}
