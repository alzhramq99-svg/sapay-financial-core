import { AddressInfo } from 'net';
import { request, Server } from 'http';
import { Controller, HttpCode, INestApplication, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { corsOptions, isAllowedOrigin } from '../src/security/cors';

let loginCalls = 0;
@Controller('api/auth')
class LoginProbeController {
  @Post('login') @HttpCode(200) login() { loginCalls += 1; return { ok: true }; }
}

@Module({ controllers: [LoginProbeController] })
class EmptyModule {}

// A real POST, as browsers send it (Origin included even when same-origin).
function post(server: Server, origin: string): Promise<number> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: 'POST', path: '/api/auth/login', headers: { Origin: origin, 'content-type': 'application/json' } },
      (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    req.on('error', reject);
    req.end('{}');
  });
}

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

  it('accepts the Render service origin, which also serves the web UI', async () => {
    const origin = 'https://sapay-api.onrender.com';
    expect((await preflight(server, origin)).allowOrigin).toBe(origin);
  });

  it('lets a POST from the Render-served UI reach the controller', async () => {
    loginCalls = 0;
    expect(await post(server, 'https://sapay-api.onrender.com')).toBe(200);
    expect(loginCalls).toBe(1);
  });

  it.each(['https://evil.example', 'http://localhost:4173'])('stops a POST from %s before the controller', async (origin) => {
    loginCalls = 0;
    expect(await post(server, origin)).not.toBe(200);
    expect(loginCalls).toBe(0);
  });

  it('accepts a Vercel preview origin of this project', async () => {
    const origin = 'https://sapay-financial-core-hzd2266ux-saad-ali5.vercel.app';
    expect((await preflight(server, origin)).allowOrigin).toBe(origin);
  });

  it.each(['https://evil.example', 'capacitor://evil', 'http://localhost', 'https://sapay-financial-core-x-other.vercel.app', 'https://sapay-api.onrender.com.evil.example'])(
    'rejects %s without an allow-origin header', async (origin) => {
      const result = await preflight(server, origin);
      expect(result.allowOrigin).toBeUndefined();
      expect(isAllowedOrigin(origin)).toBe(false);
    });
});
