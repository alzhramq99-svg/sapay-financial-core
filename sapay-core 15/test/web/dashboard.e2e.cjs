// Regression test for the blank iPhone dashboard (all nine sections, wallets,
// history, card controls) in portrait and landscape, against a mocked API.
//
// Chromium with iPhone 13 emulation; not a substitute for real Safari.
// Requires Playwright with Chromium installed (not a project dependency yet):
//   node test/web/dashboard.e2e.cjs public
// Exits non-zero if any check fails.
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const root = path.resolve(process.argv[2] || 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const SECTIONS = ['home', 'wallets', 'cards', 'transfers', 'services', 'history', 'support', 'account', 'settings'];
const WALLET = { id: '11111111-1111-4111-8111-111111111111', currency: 'SDG', balanceMinor: '5000' };
const JOURNAL = [{ type: 'DEMO_CREDIT', status: 'POSTED', createdAt: '2026-11-19T10:00:00Z', postings: [{ side: 'CREDIT', amountMinor: '5000', currency: 'SDG' }] }];

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0, () => resolve(server));
  });
}

async function mockApi(ctx) {
  // Served from localhost, the app calls its own origin's /api (see apiOrigin in app.js).
  await ctx.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (url.endsWith('/auth/login')) return json({ accessToken: 'token', user: { email: 'demo@example.test' } });
    if (url.endsWith('/demo/wallets')) return json([WALLET]);
    if (url.includes('/demo/wallets/')) return json(WALLET);
    if (url.endsWith('/ledger/journals')) return json(JOURNAL);
    return json({});
  });
}

async function run(orientation, port, results) {
  const check = (name, ok, extra = '') => results.push({ name: `[${orientation}] ${name}`, ok, extra });
  const browser = await chromium.launch();
  const device = orientation === 'landscape' ? devices['iPhone 13 landscape'] : devices['iPhone 13'];
  const ctx = await browser.newContext({ ...device, serviceWorkers: 'block' });
  await mockApi(ctx);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.fill('#email', 'demo@example.test'); await page.fill('#password', 'demo-password-2026');
  await page.click('#authSubmit');
  await page.waitForFunction(() => document.querySelectorAll('.wallet-card').length > 0, null, { timeout: 10000 }).catch(() => {});

  check('no uncaught errors during dashboard setup', errors.length === 0, errors.join(' | '));
  const nav = await page.evaluate(() => [...document.querySelectorAll('.app-nav .nav-item')].map((b) => {
    const r = b.getBoundingClientRect(); return { page: b.dataset.page, visible: r.width > 0 && r.left >= 0 && r.right <= innerWidth };
  }));
  check('nine navigation items', nav.length === 9, nav.map((n) => n.page).join(','));
  check('all navigation items inside the viewport', nav.length === 9 && nav.every((n) => n.visible), nav.filter((n) => !n.visible).map((n) => n.page).join(','));
  // A sticky nav taller than a quarter of the viewport hides too much content
  // while scrolling, which matters most in landscape.
  const navShare = await page.evaluate(() => document.querySelector('.app-nav').getBoundingClientRect().height / innerHeight);
  check('sticky navigation uses at most 25% of the viewport height', navShare <= 0.25, navShare.toFixed(2));
  check('no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('total balance visible on home', await page.locator('#totalBalance').isVisible() && (await page.textContent('#totalBalance')).includes('5,000'));

  for (const key of SECTIONS) {
    const clicked = await page.click(`.app-nav [data-page="${key}"]`, { timeout: 3000 }).then(() => true, () => false);
    if (!clicked) { check(`section "${key}" reachable from navigation`, false, 'nav item not clickable'); continue; }
    await page.waitForTimeout(150);
    const state = await page.evaluate((k) => {
      const active = [...document.querySelectorAll('#appView .page-view')].filter((p) => getComputedStyle(p).display !== 'none' && !p.hidden);
      const view = document.querySelector(`#appView .page-view[data-view="${k}"]`);
      return { activeKeys: active.map((p) => p.dataset.view), height: view ? view.getBoundingClientRect().height : 0, text: view ? view.innerText.trim().length : 0 };
    }, key);
    check(`section "${key}" is the only visible page and has content`, state.activeKeys.length === 1 && state.activeKeys[0] === key && state.height > 40 && state.text > 20, JSON.stringify(state));
    if (key === 'wallets') check('wallet card visible with balance', await page.locator('.wallet-card').first().isVisible() && ((await page.locator('.wallet-card').first().textContent()) || '').includes('5,000'));
    if (key === 'history') check('history entry visible', await page.locator('.history-item').first().isVisible());
    if (key === 'cards') {
      const ok = (p) => p.then(() => true, () => false);
      check('card details reveal works', await ok(page.click('#revealDemoCard', { timeout: 3000 })) && await page.locator('#demoCardDetails').isVisible());
      check('card freeze toggle works', await ok(page.click('#toggleDemoCard', { timeout: 3000 })) && (await page.textContent('#demoCardStatus')).includes('مجمّدة'));
    }
  }
  check('no uncaught errors after visiting every section', errors.length === 0, errors.join(' | '));
  await browser.close();
}

(async () => {
  const server = await startServer(); const port = server.address().port; const results = [];
  for (const orientation of ['portrait', 'landscape']) await run(orientation, port, results);
  server.close();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.extra ? ' — ' + r.extra : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
