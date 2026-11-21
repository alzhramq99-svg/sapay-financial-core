import { ChildProcess, spawn } from 'child_process';
import { createServer, IncomingHttpHeaders, request, Server } from 'http';
import { join } from 'path';

// dev-server.cjs (port 4173) proxies /api to the API on 127.0.0.1:3000. The
// browser treats the proxy as the page's own origin, so the proxy must drop
// Origin: the API's CORS allowlist rejects loopback origins by design.
describe('dev-server.cjs API proxy', () => {
  let upstream: Server;
  let devServer: ChildProcess;
  let received: IncomingHttpHeaders | undefined;

  beforeAll(async () => {
    upstream = createServer((req, res) => { received = req.headers; req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });
    await new Promise<void>((resolve) => upstream.listen(3000, '127.0.0.1', resolve));
    devServer = spawn(process.execPath, [join(__dirname, '..', 'dev-server.cjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve) => devServer.stdout?.once('data', () => resolve()));
  });
  afterAll(async () => {
    devServer.kill();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it('forwards a same-origin POST without the Origin header', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: 4173, method: 'POST', path: '/api/auth/login',
        headers: { Origin: 'http://localhost:4173', 'content-type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(200);
    expect(received).toBeDefined();
    expect(received?.origin).toBeUndefined();
    expect(received?.['content-type']).toBe('application/json');
  });
});
