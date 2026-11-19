// End-to-end checks for the iPhone web build (PWA) against a mocked API.
//
// Runs Chromium with iPhone 13 emulation; it is not a substitute for testing
// in real Safari on a device. Requires Playwright with Chromium installed
// (it is not a project dependency yet):
//   node "test/web/pwa.e2e.cjs" public
// The script copies nothing: point it at a scratch copy of public/, because
// the update check appends a line to app.js.
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = process.argv[2];
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404, {'content-type':'text/html'}); return res.end('<h1>404</h1>'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
}).listen(4173);
const API = 'https://sapay-api.onrender.com/api';
// Read the cache name from the worker itself so a version bump cannot leave this test stale.
const CACHE_NAME = 'sapay-iphone-shell-' + fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8').match(/CACHE_VERSION = '([^']+)'/)[1];
const results = []; const check = (name, ok, extra='') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
  let apiMode = 'ok'; const calls = [];
  const wallet = { id: '11111111-1111-4111-8111-111111111111', currency: 'SDG', balanceMinor: '5000' };
  await ctx.route(API + '/**', async (route) => {
    const u = new URL(route.request().url()); calls.push(route.request().method() + ' ' + u.pathname);
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST' } });
    if (apiMode === 'down') return route.abort('internetdisconnected');
    if (apiMode === '500') return json(500, { message: 'boom' });
    if (apiMode === '429') return json(429, { message: 'Too Many Requests' });
    if (u.pathname.endsWith('/health')) return json(200, { status: 'ok' });
    if (u.pathname.endsWith('/auth/login')) return json(200, { accessToken: 'tok', user: { id: 'u', email: 'demo@example.test' } });
    if (u.pathname.endsWith('/demo/wallets')) return apiMode === '401' ? json(401, { message: 'Unauthorized' }) : json(200, [wallet]);
    if (u.pathname.includes('/demo/wallets/')) return json(200, wallet);
    if (u.pathname.endsWith('/ledger/journals')) return json(200, []);
    return json(404, { message: 'Cannot ' + route.request().method() + ' ' + u.pathname });
  });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:4173/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(500);
  check('service worker controls page', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname), CACHE_NAME);
  check('shell cached incl. runtime-config and PNG icon', ['/runtime-config.js','/icons/sapay-180.png','/design-tokens.css','/app.js'].every(p => cached.includes(p)), cached.join(','));
  check('health warm-up request sent on open', calls.includes('GET /api/health'));
  check('Face ID button hidden on web', await page.locator('#faceIdLogin').isHidden());
  check('RTL Arabic document', await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'));
  check('apple-touch-icon is PNG', (await page.getAttribute('link[rel=apple-touch-icon]', 'href')) === '/icons/sapay-180.png');
  // network failure
  apiMode = 'down';
  await page.fill('#email', 'demo@example.test'); await page.fill('#password', 'demo-password-2026'); await page.click('#authSubmit');
  await page.waitForTimeout(400); let msg = await page.textContent('#authMessage');
  check('network failure shows Arabic message', msg.includes('تعذر الوصول إلى خادم SApay'), msg);
  apiMode = '429'; await page.click('#authSubmit'); await page.waitForTimeout(300); msg = await page.textContent('#authMessage');
  check('429 shows wait message', msg.includes('محاولات كثيرة'), msg);
  apiMode = '500'; await page.click('#authSubmit'); await page.waitForTimeout(300); msg = await page.textContent('#authMessage');
  check('500 shows server error message', msg.includes('خطأ في خادم'), msg);
  // login ok
  apiMode = 'ok'; await page.click('#authSubmit'); await page.waitForSelector('.wallet-card', { state: 'attached' });
  check('login shows dashboard with wallet', await page.locator('#appView').isVisible());
  check('external transfer button hidden', (await page.locator('[data-external]').count()) === 0);
  check('internal transfer button still present', (await page.locator('[data-send]').count()) === 1);
  check('demo notice visible', (await page.textContent('#appView')).includes('لا توجد تحويلات بنكية أو أموال حقيقية'));
  // session expiry
  apiMode = '401'; await page.click('[data-page="history"]'); await page.click('#refreshBtn'); await page.waitForTimeout(400);
  check('401 logs out to login view', await page.locator('#authView').isVisible());
  // offline launch: browser offline, reload served from SW cache
  await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(300);
  check('offline launch renders app shell from cache', await page.locator('#authForm').isVisible());
  await page.fill('#email', 'demo@example.test'); await page.fill('#password', 'demo-password-2026'); await page.click('#authSubmit'); await page.waitForTimeout(300);
  msg = await page.textContent('#authMessage'); check('offline login shows no-internet message', msg.includes('لا يوجد اتصال'), msg);
  await ctx.setOffline(false);
  // update: change app.js on server, a reload must serve the new file, not the cached one
  fs.appendFileSync(path.join(root, 'app.js'), '\nwindow.__SAPAY_BUILD = "new";\n');
  await page.reload(); await page.waitForTimeout(500);
  check('updated app.js served after deploy (network-first)', (await page.evaluate(() => window.__SAPAY_BUILD)) === 'new');
  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
