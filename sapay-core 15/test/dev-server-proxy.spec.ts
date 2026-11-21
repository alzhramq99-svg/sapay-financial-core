import { ChildProcess, spawn } from 'child_process';
import { createServer, IncomingHttpHeaders, request, Server } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';

// dev-server.cjs proxies /api to the local API. The browser treats the proxy
// as the page's own origin, so the proxy must drop Origin: the API's CORS
// allowlist rejects loopback origins by design. Ephemeral ports keep this
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

  it('forwards a same-origin POST without the Origin header', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: devPort, method: 'POST', path: '/api/auth/login',
        headers: { Origin: `http://localhost:${devPort}`, 'content-type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(200);
    expect(received).toBeDefined();
    expect(received?.origin).toBeUndefined();
    expect(received?.['content-type']).toBe('application/json');
  });
});
