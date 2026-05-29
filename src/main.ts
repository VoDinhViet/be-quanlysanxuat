import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config(); // Fallback for .env

import {
  ClassSerializerInterceptor,
  HttpStatus,
  Logger,
  RequestMethod,
  UnprocessableEntityException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationError } from 'class-validator';
import { join } from 'path';
import compression from 'compression';
import type { Express, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { Environment } from './constants/app.constant';
import { AllConfigType } from './config/config.type';
import { setupSwagger } from './utils/swagger.util';

let cachedServer: Express | null = null;

export async function bootstrap(): Promise<Express> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const configService = app.get(ConfigService<AllConfigType>);

  app.enableCors({
    origin: configService.getOrThrow('app.corsOrigin', { infer: true }),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true,
  });

  const reflector = app.get(Reflector);

  app.setGlobalPrefix('api', {
    exclude: [
      { method: RequestMethod.GET, path: '/' },
      { method: RequestMethod.GET, path: 'health' },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI });

  app.useGlobalFilters(new GlobalExceptionFilter(configService));
  app.useGlobalGuards(app.get(AuthGuard), app.get(RolesGuard));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (errors: ValidationError[]) => new UnprocessableEntityException(errors),
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

  if (configService.getOrThrow('app.nodeEnv', { infer: true }) !== Environment.PRODUCTION) {
    setupSwagger(app);
  }

  await app.init();
  return app.getHttpAdapter().getInstance();
}

async function getServer(): Promise<Express> {
  if (!cachedServer) {
    cachedServer = await bootstrap();
  }

  return cachedServer;
}

export default async function handler(req: Request, res: Response) {
  const server = await getServer();
  return server(req, res);
}

if (require.main === module) {
  getServer().then((instance) => {
    const port = process.env.PORT || 3000;
    instance.listen(port);
    Logger.log(`Application is running on: http://localhost:${port}/api`, 'Bootstrap');
  });
}
