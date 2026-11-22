// Renders a square PNG from one of the official SApay monogram SVGs
// (Playwright + Chromium):
//   node test/web/render-icon.cjs public/icons/sapay-192.svg public/icons/sapay-180.png 180
//   node test/web/render-icon.cjs public/icons/sapay-512.svg mobile/resources/AppIcon-1024.png 1024
// iOS applies its own rounded mask to home-screen and app icons, so the
// outer background square is drawn without its corner radius; otherwise the
// transparent corners render black. The artwork itself is not changed.
const { chromium } = require('playwright');
const fs = require('fs');
const [src, out, sizeArg = '180'] = process.argv.slice(2);
const size = Number(sizeArg);
if (!src || !out || !Number.isInteger(size) || size <= 0) {
  console.error('usage: node test/web/render-icon.cjs <icon.svg> <out.png> [size]');
  process.exit(1);
}
const svg = fs.readFileSync(src, 'utf8').replace(/(<rect width="\d+" height="\d+") rx="\d+"/, '$1 rx="0"');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#080909">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
  await browser.close();
})();
