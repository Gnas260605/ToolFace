import { Controller, Get, Res, HttpStatus, Inject } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from './common/database.service';
import { DatabaseHealthService } from '@newsflow/database';
import { RedisService } from './common/redis.service';
import { getServerEnv } from '@newsflow/config';
import { HealthCheckResponse } from '@newsflow/contracts';

@Controller('health')
export class HealthController {
  private readonly dbHealth: DatabaseHealthService;

  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {
    this.dbHealth = new DatabaseHealthService(this.databaseService);
  }

  @Get('live')
  getLive(@Res() res: Response) {
    return res.status(HttpStatus.OK).json({ status: 'ok' });
  }

  @Get('ready')
  async getReady(@Res() res: Response) {
    let configStatus: 'up' | 'down' = 'up';
    let configError: string | undefined;

    try {
      getServerEnv();
    } catch (err: unknown) {
      configStatus = 'down';
      configError = (err as Error).message;
    }

    const dbResult = await this.dbHealth.checkHealth();
    const redisResult = await this.redisService.checkHealth();

    const isReady =
      dbResult.status === 'up' && redisResult.status === 'up' && configStatus === 'up';

    const healthData: HealthCheckResponse = {
      status: isReady ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbResult.status,
          message: dbResult.message,
        },
        redis: {
          status: redisResult.status,
          message: redisResult.message,
        },
      },
    };

    if (!isReady) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        ...healthData,
        config: { status: configStatus, error: configError },
      });
    }

    return res.status(HttpStatus.OK).json(healthData);
  }
}
