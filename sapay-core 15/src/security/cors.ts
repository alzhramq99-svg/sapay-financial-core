import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const allowedOrigins = new Set([
  'https://sapay-financial-core.vercel.app',
  'https://sapay-financial-core-saad-ali5.vercel.app',
  'https://sapay-financial-core-git-main-saad-ali5.vercel.app',
  // The Render service (render.yaml, service sapay-api) also serves public/.
  // Browsers send Origin on same-origin POSTs, so without this entry login
  // and every write from the Render-served UI were rejected with a 500.
  'https://sapay-api.onrender.com',
  // The iOS app: Capacitor serves its bundled web assets from this origin
  // (mobile/capacitor.config.ts sets no server.url or iosScheme override).
  'capacitor://localhost',
]);
const vercelPreviewOrigin = /^https:\/\/sapay-financial-core-[a-z0-9-]+-saad-ali5\.vercel\.app$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || allowedOrigins.has(origin) || vercelPreviewOrigin.test(origin);
}

export const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error('Origin is not allowed by SApay CORS policy'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  credentials: false,
};
