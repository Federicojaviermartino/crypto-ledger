import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as helmet from 'helmet';
import * as rateLimit from 'express-rate-limit';
import { AppModule } from './modules/app.module';

/**
 * Bootstrap the NestJS application
 * Configures global pipes, CORS, and starts the server
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    // Security middleware
    app.use(helmet());

    // Rate limiting
    app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: 'Too many requests from this IP',
      })
    );

    // Validation
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Global prefix
    app.setGlobalPrefix('api');

    // CORS
    app.enableCors({
      origin: process.env.CORS_ORIGIN?.split(',') || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });

    const port = Number(process.env.PORT) || 3000;
    await app.listen(port, '0.0.0.0');

    logger.log(`🚀 Application is running on: http://0.0.0.0:${port}/api`);
    logger.log(`📊 Environment: ${process.env.NODE_ENV}`);
    logger.log(`🔒 CORS enabled for: ${process.env.CORS_ORIGIN || '*'}`);
    
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('❌ Failed to start application:', err.stack);
    process.exit(1);
  }
}

bootstrap();
