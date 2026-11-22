import 'dotenv/config';
import 'reflect-metadata';
import { json, static as serveStatic } from 'express';
import { join } from 'path';
const helmet = require('helmet') as () => (req: any, res: any, next: (error?: Error) => void) => void;
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  const vercelProjectOrigins = new Set([
    'https://sapay-financial-core.vercel.app',
    'https://sapay-financial-core-saad-ali5.vercel.app',
    'https://sapay-financial-core-git-main-saad-ali5.vercel.app',
  ]);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      const isProjectPreview = Boolean(origin && /^https:\/\/sapay-financial-core-[a-z0-9-]+-saad-ali5\.vercel\.app$/.test(origin));
      if (!origin || vercelProjectOrigins.has(origin) || isProjectPreview) callback(null, true);
      else callback(new Error('Origin is not allowed by SApay CORS policy'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: false,
  });
  app.use(helmet());
  app.use(json({ limit: '32kb' }));
  app.use(serveStatic(join(process.cwd(), 'public'), { index: 'index.html', dotfiles: 'deny' }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  await app.listen(port, process.env.APP_HOST?.trim() || '127.0.0.1');
}
void bootstrap();
