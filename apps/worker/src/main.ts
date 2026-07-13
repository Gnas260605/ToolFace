import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger.service';

async function bootstrap() {
  const logger = new JsonLogger();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
  });

  app.enableShutdownHooks();

  logger.log('Worker standalone application context initialized', 'Bootstrap');
}

bootstrap();
