// A wrong API configuration must surface its own message, not the generic
// "cannot reach the server" one (api() used to call apiOrigin() inside the
// try/catch that wraps fetch). Serves public/ under a non-loopback hostname,
// because pages on localhost ignore apiBaseUrl, with apiBaseUrl set to plain
// HTTP on another origin, which apiOrigin() rejects.
//
// Requires Playwright with Chromium (not a project dependency yet):
//   node test/web/api-config.e2e.cjs public
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const root = path.resolve(process.argv[2] || 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const insecureConfig = "window.SAPAY_CONFIG = Object.freeze({ apiBaseUrl: 'http://api.insecure.example', features: Object.freeze({ externalTransfers: false }) });";

const server = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
  if (p === '/runtime-config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(insecureConfig); }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1', async () => { // loopback only
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP sapay.test 127.0.0.1'] });
  const page = await browser.newPage();
  let requested = false;
  await page.route('http://api.insecure.example/**', (route) => { requested = true; return route.abort(); });
  await page.goto(`http://sapay.test:${port}/`);
  await page.fill('#email', 'demo@example.test'); await page.fill('#password', 'demo-password-2026');
  await page.click('#authSubmit'); await page.waitForTimeout(500);
  const message = await page.textContent('#authMessage');
  const checks = [
    ['configuration error shows its own HTTPS message', message.includes('HTTPS'), message],
    ['no request is sent to the misconfigured API', !requested, ''],
  ];
  for (const [name, ok, extra] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra ? ' — ' + extra : ''}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await browser.close(); server.close();
  process.exitCode = failed ? 1 : 0;
});
