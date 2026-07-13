import { PrismaClient } from '@prisma/client';

export class DatabaseHealthService {
  constructor(private readonly prisma: PrismaClient) {}

  async checkHealth(): Promise<{ status: 'up' | 'down'; message?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error: any) {
      return { status: 'down', message: error.message };
    }
  }
}
