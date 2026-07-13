import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService } from './worker.service';
import { JsonLogger } from './common/logger.service';
import { DatabaseService } from './common/database.service';

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        ping: vi.fn().mockResolvedValue('PONG'),
        quit: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('WorkerService tests', () => {
  let workerService: WorkerService;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/newsflow';
    process.env.WEB_URL = 'http://localhost:3000';
    process.env.API_URL = 'http://localhost:3001';
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_BUCKET = 'test';
    process.env.S3_ACCESS_KEY = 'test';
    process.env.S3_SECRET_KEY = 'test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        JsonLogger,
        {
          provide: DatabaseService,
          useValue: {
            source: {
              findMany: vi.fn().mockResolvedValue([]),
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
          },
        },
        {
          provide: 'BullQueue_source-poll',
          useValue: {
            add: vi.fn(),
          },
        },
      ],
    }).compile();

    workerService = module.get<WorkerService>(WorkerService);
  });

  it('should be defined', () => {
    expect(workerService).toBeDefined();
  });

  it('should initialize and connect to Redis successfully', async () => {
    await expect(workerService.onModuleInit()).resolves.toBeUndefined();
    await workerService.onModuleDestroy();
  });
});
