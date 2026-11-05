import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
const AUTH_LIMIT = 5;
const API_LIMIT = 120;
let requestsSinceSweep = 0;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.originalUrl.split('?')[0] || '/';
    const isAuth = path === '/api/auth' || path.startsWith('/api/auth/');
    const limit = isAuth ? AUTH_LIMIT : API_LIMIT;
    // Express trust-proxy is deliberately left disabled unless deployment explicitly configures it.
    // This prevents clients from spoofing X-Forwarded-For to evade per-IP limits.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${isAuth ? path : 'api'}`;
    const now = Date.now();

    if (++requestsSinceSweep >= 256 || buckets.size >= MAX_BUCKETS) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
      requestsSinceSweep = 0;
    }

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && buckets.size >= MAX_BUCKETS) {
        res.setHeader('Retry-After', '60');
        res.status(429).json({ statusCode: 429, message: 'Rate limit capacity reached; retry shortly' });
        return;
      }
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ statusCode: 429, message: 'Rate limit exceeded; retry after the current window' });
      return;
    }
    next();
  }
}
