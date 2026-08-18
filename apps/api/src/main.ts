import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentService } from './config/environment';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { static as serveStatic } from 'express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const environment = app.get(EnvironmentService).values;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.set('trust proxy', 1);

  const uploadDirectory = resolve(environment.UPLOAD_DIR);
  await mkdir(uploadDirectory, { recursive: true });
  app.use(
    '/api/uploads',
    serveStatic(uploadDirectory, {
      immutable: true,
      maxAge: '30d',
      fallthrough: false,
    }),
  );

  app.enableCors({
    origin: environment.CORS_ORIGIN,
    credentials: true,
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  if (environment.NODE_ENV !== 'production') {
    const openApiConfig = new DocumentBuilder()
      .setTitle('Codeforces Gamification Tracker API')
      .setDescription('Internal API for the Codeforces Gamification Tracker')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, openApiConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
