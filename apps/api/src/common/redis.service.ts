import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { getServerEnv } from '@newsflow/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis(getServerEnv().REDIS_URL, {
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async checkHealth(): Promise<{ status: 'up' | 'down'; message?: string }> {
    try {
      await this.client.ping();
      return { status: 'up' };
    } catch (error: unknown) {
      const err = error as Error;
      return { status: 'down', message: err.message };
    }
  }
}
