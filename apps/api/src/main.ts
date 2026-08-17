import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentService } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const environment = app.get(EnvironmentService).values;

  app.enableCors({
    origin: environment.CORS_ORIGIN,
    credentials: true,
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');

  const openApiConfig = new DocumentBuilder()
    .setTitle('Codeforces Gamification Tracker API')
    .setDescription('Internal API for the Codeforces Gamification Tracker')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
