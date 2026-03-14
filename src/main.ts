import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { setupSwagger } from './common/swagger-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED');
  if (swaggerEnabled) {
    setupSwagger(app);
  }

  const trustedUrls = configService.get<string>('WHITELIST_TRUSTED_URLS');
  const origin = trustedUrls
    ? trustedUrls.split(',').map((url) => url.trim())
    : '*';

  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  const port = configService.get<number>('PORT') || 3002;
  await app.listen(port);

  const baseUrl = `http://localhost:${port}`;
  const swaggerUrl = `${baseUrl}/api/docs`;

  Logger.log(`=`.repeat(50), 'Bootstrap');
  Logger.log(`🚀 Base URL: ${baseUrl}`, 'Bootstrap');
  if (swaggerEnabled) {
    Logger.log(`📚 Swagger   : ${swaggerUrl}`, 'Bootstrap');
  }
  Logger.log(`=`.repeat(50), 'Bootstrap');
}
bootstrap();
