import { ChildProcess, spawn } from 'child_process';
import { createServer, IncomingHttpHeaders, request, Server } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';

// dev-server.cjs proxies /api to the local API. The browser treats the proxy
// as the page's own origin, so the proxy must drop Origin: the API's CORS
// allowlist rejects loopback origins by design. It must also refuse any other
// origin, which would otherwise reach the API with its Origin removed. Ephemeral ports keep this
// test from colliding with a dev server or API already running on 4173/3000.
const freePort = () => new Promise<number>((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as AddressInfo;
    probe.close(() => resolve(port));
  });
});

describe('dev-server.cjs API proxy', () => {
  let upstream: Server;
  let devServer: ChildProcess;
  let devPort: number;
  let received: IncomingHttpHeaders | undefined;

  beforeAll(async () => {
    upstream = createServer((req, res) => { received = req.headers; req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const apiPort = (upstream.address() as AddressInfo).port;
    devPort = await freePort();
    devServer = spawn(process.execPath, [join(__dirname, '..', 'dev-server.cjs')], {
      env: { ...process.env, SAPAY_API_TARGET: `http://127.0.0.1:${apiPort}`, SAPAY_DEV_PORT: String(devPort) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise<void>((resolve) => devServer.stdout?.once('data', () => resolve()));
  });
  afterAll(async () => {
    devServer.kill();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  const post = (origin: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: devPort, method: 'POST', path: '/api/auth/login',
      headers: { Origin: origin, 'content-type': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end('{}');
  });

  beforeEach(() => { received = undefined; });

  it('forwards a same-origin POST without the Origin header', async () => {
    const { status } = await post(`http://127.0.0.1:${devPort}`);
    expect(status).toBe(200);
    expect(received).toBeDefined();
    expect(received?.origin).toBeUndefined();
    expect(received?.['content-type']).toBe('application/json');
  });

  it.each(['https://evil.example', 'http://127.0.0.1:1', 'null'])(
    'refuses a POST from another origin (%s) without contacting the API', async (origin) => {
      const { status, body } = await post(origin);
      expect(status).toBe(403);
      expect(JSON.parse(body)).toEqual({ message: 'Origin not allowed' });
      expect(received).toBeUndefined();
    });
});
