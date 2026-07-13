import { describe, it, expect } from 'vitest';
import { parseEnv, serverSchema, clientSchema } from './index';

describe('Environment validation tests', () => {
  const validServerEnv = {
    NODE_ENV: 'development',
    APP_NAME: 'NewsFlow AI',
    APP_VERSION: '0.1.0',
    WEB_PORT: '3000',
    API_PORT: '3001',
    WORKER_PORT: '3002',
    WEB_URL: 'http://localhost:3000',
    API_URL: 'http://localhost:3001',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/newsflow',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'newsflow-bucket',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_FORCE_PATH_STYLE: 'true',
    LOG_LEVEL: 'info',
  };

  it('should parse valid server environments', () => {
    const result = parseEnv(serverSchema, validServerEnv);
    expect(result.NODE_ENV).toBe('development');
    expect(result.WEB_PORT).toBe(3000);
    expect(result.S3_FORCE_PATH_STYLE).toBe('true');
  });

  it('should throw error for missing server environment variables', () => {
    const invalidEnv = { ...validServerEnv };
    delete (invalidEnv as any).DATABASE_URL;

    expect(() => parseEnv(serverSchema, invalidEnv)).toThrow(
      /Environment variable validation failed/,
    );
  });

  it('should throw error for invalid URLs', () => {
    const invalidEnv = { ...validServerEnv, API_URL: 'not-a-url' };

    expect(() => parseEnv(serverSchema, invalidEnv)).toThrow(
      /Environment variable validation failed/,
    );
  });

  it('should parse valid client environments', () => {
    const validClientEnv = {
      NODE_ENV: 'production',
      APP_NAME: 'NewsFlow AI UI',
      APP_VERSION: '0.1.0',
      WEB_URL: 'https://newsflow.ai',
      API_URL: 'https://api.newsflow.ai',
    };
    const result = parseEnv(clientSchema, validClientEnv);
    expect(result.NODE_ENV).toBe('production');
    expect(result.APP_NAME).toBe('NewsFlow AI UI');
  });
});
