// Renders public/icons/sapay-180.png from sapay-192.svg (Playwright + Chromium):
//   node test/web/render-icon.cjs public/icons/sapay-192.svg public/icons/sapay-180.png
const { chromium } = require('playwright');
const fs = require('fs');
const [src, out] = process.argv.slice(2);
// iOS applies its own rounded mask, so draw the background square (rx=0);
// otherwise the transparent corners render black on the home screen.
const svg = fs.readFileSync(src, 'utf8').replace(/rx="42"/, 'rx="0"');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
  await page.screenshot({ path: out, omitBackground: false, clip: { x: 0, y: 0, width: 180, height: 180 } });
  await browser.close();
})();
