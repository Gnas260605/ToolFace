import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { JsonLogger } from './logger.service';

interface TrackedRequest extends Request {
  requestId?: string;
  correlationId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<TrackedRequest>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const reqId = request.requestId || 'unknown';
    const corrId = request.correlationId || 'unknown';

    let message = 'Có lỗi xảy ra trên hệ thống';
    let code = 'INTERNAL_ERROR';
    let details: unknown = {};

    if (exception instanceof HttpException) {
      const resContent = exception.getResponse();
      if (resContent && typeof resContent === 'object') {
        const body = resContent as Record<string, unknown>;
        message = typeof body.message === 'string' ? body.message : exception.message;
        code = typeof body.code === 'string' ? body.code : this.mapStatusToCode(status);
        details = body.details || body;
      } else {
        message = typeof resContent === 'string' ? resContent : exception.message;
        code = this.mapStatusToCode(status);
      }
    } else {
      const err = exception as Error;
      this.logger.error(
        {
          message: err?.message || 'Unhandled error',
          requestId: reqId,
          correlationId: corrId,
          path: request.url,
        },
        err?.stack,
        'HttpExceptionFilter',
      );
    }

    const errorResponse = {
      error: {
        code,
        message:
          typeof message === 'string'
            ? message
            : Array.isArray(message)
              ? message[0]
              : String(message),
        requestId: reqId,
        details,
      },
    };

    response.status(status).json(errorResponse);
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
