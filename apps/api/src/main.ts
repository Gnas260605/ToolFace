import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logger.service';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { getServerEnv } from '@newsflow/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, {
    logger,
  });

  const env = getServerEnv();

  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.use(helmet());
  app.use(cookieParser());

  const origins = env.CORS_ALLOWED_ORIGINS
    ? env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['health/live', 'health/ready'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (env.NODE_ENV === 'development') {
    const config = new DocumentBuilder()
      .setTitle('NewsFlow AI API')
      .setDescription('The NewsFlow AI backend API description')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  const port = env.API_PORT;
  await app.listen(port);
  logger.log(`API Application is running on: http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
