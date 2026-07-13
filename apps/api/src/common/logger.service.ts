/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { Injectable, LoggerService } from '@nestjs/common';
import { getServerEnv } from '@newsflow/config';

@Injectable()
export class JsonLogger implements LoggerService {
  private readonly serviceName = 'api';
  private readonly environment: string;

  constructor() {
    try {
      this.environment = getServerEnv().NODE_ENV;
    } catch {
      this.environment = 'development';
    }
  }

  private formatMessage(
    level: string,
    message: any,
    context?: string,
    extra?: Record<string, any>,
  ) {
    let msgStr = '';
    let logData: Record<string, any> = {};

    if (typeof message === 'object') {
      const { message: innerMsg, ...rest } = message;
      msgStr = innerMsg || '';
      logData = rest;
    } else {
      msgStr = String(message);
    }

    if (logData.headers) {
      logData.headers = { ...logData.headers };
      if (logData.headers.authorization) {
        logData.headers.authorization = '[REDACTED]';
      }
      if (logData.headers['x-api-key']) {
        logData.headers['x-api-key'] = '[REDACTED]';
      }
      if (logData.headers['cookie']) {
        logData.headers['cookie'] = '[REDACTED]';
      }
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      context,
      message: msgStr,
      ...logData,
      ...extra,
    };

    return JSON.stringify(payload);
  }

  log(message: any, context?: string) {
    console.log(this.formatMessage('info', message, context));
  }

  error(message: any, trace?: string, context?: string) {
    console.error(
      this.formatMessage('error', message, context, trace ? { stack: trace } : undefined),
    );
  }

  warn(message: any, context?: string) {
    console.warn(this.formatMessage('warn', message, context));
  }

  debug(message: any, context?: string) {
    console.debug(this.formatMessage('debug', message, context));
  }

  verbose(message: any, context?: string) {
    console.log(this.formatMessage('trace', message, context));
  }
}
