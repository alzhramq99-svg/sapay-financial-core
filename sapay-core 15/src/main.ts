import 'dotenv/config';
import 'reflect-metadata';
import { json } from 'express';
const helmet = require('helmet') as () => (req: any, res: any, next: (error?: Error) => void) => void;
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(json({ limit: '32kb' }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  await app.listen(port, process.env.APP_HOST?.trim() || '127.0.0.1');
}
void bootstrap();
