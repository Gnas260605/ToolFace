import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../../.env') });


export const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('NewsFlow AI'),
  APP_VERSION: z.string().default('0.1.0'),
  WEB_PORT: z.coerce.number().default(3000),
  API_PORT: z.coerce.number().default(3001),
  WORKER_PORT: z.coerce.number().default(3002),
  WEB_URL: z.string().url(),
  API_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  BILLING_ENABLED: z.enum(['true', 'false']).default('true'),
  BILLING_PROVIDER: z.string().default('mock'),
  BILLING_SECRET_KEY: z.string().default(''),
  BILLING_WEBHOOK_SECRET: z.string().default(''),
  BILLING_SUCCESS_URL: z.string().default('http://localhost:3000/app/default-workspace/settings/billing'),
  BILLING_CANCEL_URL: z.string().default('http://localhost:3000/app/default-workspace/settings/billing'),
  BILLING_PORTAL_RETURN_URL: z.string().default('http://localhost:3000/app/default-workspace/settings/billing'),
  DEFAULT_TRIAL_DAYS: z.coerce.number().int().min(0).default(14),
  BILLING_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).default(7),
  BILLING_RECONCILIATION_ENABLED: z.enum(['true', 'false']).default('true'),
  BILLING_RECONCILIATION_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  SETTINGS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  SETTINGS_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  SETTINGS_ALLOW_RUNTIME_CHANGES: z.enum(['true', 'false']).default('true'),
  FEATURE_FLAGS_ENABLED: z.enum(['true', 'false']).default('true'),
  FEATURE_FLAG_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  USAGE_RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  USAGE_RECONCILIATION_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  ADMIN_CONSOLE_ENABLED: z.enum(['true', 'false']).default('true'),
  SYSTEM_ANNOUNCEMENTS_ENABLED: z.enum(['true', 'false']).default('true'),
  WHITE_LABEL_ENABLED: z.enum(['true', 'false']).default('true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const clientSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('NewsFlow AI'),
  APP_VERSION: z.string().default('0.1.0'),
  WEB_URL: z.string().url(),
  API_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

export function parseEnv(schema: typeof serverSchema | typeof clientSchema, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message} (${err.code})`)
      .join('\n');
    throw new Error(`Environment variable validation failed:\n${errorDetails}`);
  }
  return result.data;
}

export function getServerEnv(): ServerEnv {
  return parseEnv(serverSchema, process.env) as ServerEnv;
}

export function getClientEnv(): ClientEnv {
  if (typeof window !== 'undefined') {
    return parseEnv(clientSchema, {
      NODE_ENV: process.env.NEXT_PUBLIC_NODE_ENV || process.env.NODE_ENV || 'production',
      APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'NewsFlow AI',
      APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
      WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
      API_URL: process.env.NEXT_PUBLIC_API_URL,
    }) as ClientEnv;
  }
  return parseEnv(clientSchema, process.env) as ClientEnv;
}
