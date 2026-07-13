import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { JsonLogger } from './logger.service';

interface TrackedRequest extends Request {
  requestId?: string;
  correlationId?: string;
}

@Injectable()
export class RequestTrackerMiddleware implements NestMiddleware {
  constructor(@Inject(JsonLogger) private readonly logger: JsonLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const trackedReq = req as TrackedRequest;
    const reqId = (trackedReq.headers['x-request-id'] as string) || randomUUID();
    const corrId = (trackedReq.headers['x-correlation-id'] as string) || reqId;

    trackedReq.requestId = reqId;
    trackedReq.correlationId = corrId;

    res.setHeader('x-request-id', reqId);
    res.setHeader('x-correlation-id', corrId);

    const startTime = Date.now();

    this.logger.log(
      {
        message: `Incoming request ${trackedReq.method} ${trackedReq.originalUrl}`,
        requestId: reqId,
        correlationId: corrId,
        method: trackedReq.method,
        url: trackedReq.originalUrl,
        headers: trackedReq.headers,
      },
      'RequestTracker',
    );

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.logger.log(
        {
          message: `Request completed ${trackedReq.method} ${trackedReq.originalUrl} - Status ${res.statusCode} - ${duration}ms`,
          requestId: reqId,
          correlationId: corrId,
          method: trackedReq.method,
          url: trackedReq.originalUrl,
          statusCode: res.statusCode,
          durationMs: duration,
        },
        'RequestTracker',
      );
    });

    next();
  }
}
