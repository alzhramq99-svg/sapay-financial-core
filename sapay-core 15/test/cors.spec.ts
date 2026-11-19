import { AddressInfo } from 'net';
import { request, Server } from 'http';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { corsOptions, isAllowedOrigin } from '../src/security/cors';

@Module({})
class EmptyModule {}

// Preflight through Nest's real enableCors, configured exactly as in main.ts.
function preflight(server: Server, origin: string): Promise<{ status: number; allowOrigin?: string }> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: 'OPTIONS', path: '/api/auth/login', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type',
    } }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, allowOrigin: res.headers['access-control-allow-origin'] as string | undefined });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('CORS policy', () => {
  let app: INestApplication;
  let server: Server;
  beforeAll(async () => {
    app = await NestFactory.create(EmptyModule, { logger: false });
    app.enableCors(corsOptions);
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => { await app.close(); });

  it('accepts a preflight from the Capacitor iOS origin', async () => {
    const result = await preflight(server, 'capacitor://localhost');
    expect(result.status).toBe(204);
    expect(result.allowOrigin).toBe('capacitor://localhost');
  });

  it('accepts a Vercel preview origin of this project', async () => {
    const origin = 'https://sapay-financial-core-hzd2266ux-saad-ali5.vercel.app';
    expect((await preflight(server, origin)).allowOrigin).toBe(origin);
  });

  it.each(['https://evil.example', 'capacitor://evil', 'http://localhost', 'https://sapay-financial-core-x-other.vercel.app'])(
    'rejects %s without an allow-origin header', async (origin) => {
      const result = await preflight(server, origin);
      expect(result.allowOrigin).toBeUndefined();
      expect(isAllowedOrigin(origin)).toBe(false);
    });
});
