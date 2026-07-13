import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, beforeAll, afterAll, it, expect, vi } from 'vitest';
import { AppModule } from './app.module';
import { DatabaseService } from './common/database.service';
import { RedisService } from './common/redis.service';

describe('App Controller tests (Integration)', () => {
  let app: INestApplication;
  const mockDatabaseService = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([1]),
  };
  const mockRedisService = {
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    checkHealth: vi.fn().mockResolvedValue({ status: 'up' }),
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PORT = '3001';
    process.env.WEB_URL = 'http://localhost:3000';
    process.env.API_URL = 'http://localhost:3001';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/newsflow_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_ACCESS_KEY = 'test';
    process.env.S3_SECRET_KEY = 'test';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health/live', 'health/ready'],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 ok', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 health details when systems are healthy', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.database.status).toBe('up');
    expect(res.body.services.redis.status).toBe('up');
  });

  it('GET /health/ready returns 503 when database is down', async () => {
    mockDatabaseService.$queryRaw.mockRejectedValueOnce(new Error('DB Connection Failed'));
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.services.database.status).toBe('down');
  });

  it('GET /api/v1/system/info returns 200 system metadata', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/system/info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: 'NewsFlow AI API',
      version: '0.1.0',
      environment: 'test',
    });
  });
});
