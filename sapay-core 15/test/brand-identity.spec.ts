import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';

// The official SApay mark is the gold "S" monogram approved in PR #9
// (design/sapay-black-gold-identity, d033540). Every icon the app ships, and
// the logo in the page headers, must use it instead of the old navy/green "SA".
const root = join(__dirname, '..');
const pub = (file: string) => join(root, 'public', file);
const read = (file: string) => readFileSync(pub(file), 'utf8');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

// sha256 of the approved monogram SVGs exactly as committed in d033540.
const OFFICIAL_SVG_SHA256: Record<string, string> = {
  'sapay-192.svg': 'f9ced5ca9726427bc33c90ed7a7beaf866a44b26a12ad4efd668f308b203b962',
  'sapay-512.svg': '357aac03aefeeee5d66ddcbed9c69e726fd509a9d39d8dca7ad09826289416d4',
};

// Decodes an 8-bit, non-interlaced RGB or RGBA PNG (colour type 2 or 6).
// App Store Connect rejects an app icon that has an alpha channel, so the
// tests below require colour type 2 (RGB).
function decodePng(path: string): { width: number; height: number; colorType: number; pixel: (x: number, y: number) => number[] } {
  const png = readFileSync(path);
  expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), bitDepth = png.readUInt8(24), colorType = png.readUInt8(25);
  expect([bitDepth, png.readUInt8(28)]).toEqual([8, 0]);
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  const data = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(y * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const x = raw.readUInt8(y * (stride + 1) + 1 + i);
      const a = i >= bpp ? data.readUInt8(y * stride + i - bpp) : 0;
      const b = y > 0 ? data.readUInt8((y - 1) * stride + i) : 0;
      const c = i >= bpp && y > 0 ? data.readUInt8((y - 1) * stride + i - bpp) : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      data.writeUInt8((x + predictor) & 0xff, y * stride + i);
    }
  }
  const pixel = (px: number, py: number) => [...data.subarray(py * stride + px * bpp, py * stride + px * bpp + bpp)];
  return { width, height, colorType, pixel };
}

// A raster icon must be rendered from the monogram: mostly near-black, with
// gold strokes, and none of the old navy (#102a43) or green (#35b879).
function expectMonogramRaster(path: string, size: number): void {
  const png = decodePng(path);
  expect({ width: png.width, height: png.height, colorType: png.colorType }).toEqual({ width: size, height: size, colorType: 2 });
  let gold = 0, dark = 0, old = 0;
  const near = ([r = 0, g = 0, b = 0]: number[], [R = 0, G = 0, B = 0]: number[]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) < 40;
  for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
    const [r = 0, g = 0, b = 0] = png.pixel(x, y);
    if (r > 120 && r > b + 50 && g > b + 20) gold++;
    if (r < 24 && g < 24 && b < 24) dark++;
    if (near([r, g, b], [0x10, 0x2a, 0x43]) || near([r, g, b], [0x35, 0xb8, 0x79])) old++;
  }
  const samples = (size / 4) ** 2;
  expect(old).toBe(0);
  expect(dark / samples).toBeGreaterThan(0.6);
  expect(gold / samples).toBeGreaterThan(0.03);
  // iOS masks the corners itself, so the corners must be opaque background.
  expect(near(png.pixel(0, 0), [0x08, 0x09, 0x09])).toBe(true);
}

describe('official SApay logo', () => {
  it.each(Object.keys(OFFICIAL_SVG_SHA256))('%s is the approved gold monogram, unmodified', (file) => {
    expect(sha256(pub(`icons/${file}`))).toBe(OFFICIAL_SVG_SHA256[file]);
    const svg = read(`icons/${file}`);
    expect(svg).toContain('#d6ad62');
    expect(svg).not.toMatch(/#102a43|#35b879/i);
  });

  it('apple-touch icon is a 180x180 opaque PNG rendered from the monogram', () => {
    expectMonogramRaster(pub('icons/sapay-180.png'), 180);
    expect(read('index.html')).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/sapay-180.png">');
  });

  it('iOS AppIcon source is a 1024x1024 PNG without an alpha channel', () => {
    const icon = join(root, 'mobile', 'resources', 'AppIcon-1024.png');
    expect(existsSync(icon)).toBe(true);
    expectMonogramRaster(icon, 1024);
  });

  it('PWA manifest lists the monogram icons', () => {
    const manifest = JSON.parse(read('manifest.webmanifest')) as { icons: { src: string }[] };
    expect(manifest.icons.map((icon) => icon.src)).toEqual(['/icons/sapay-180.png', '/icons/sapay-192.svg', '/icons/sapay-512.svg']);
  });

  // The mark stays a .brand-mark box (index.html draws the Sudan flag stripe
  // with .brand-mark::after, which an <img> cannot show) holding the monogram.
  it.each(['index.html', 'privacy.html', 'support.html'])('%s header shows the monogram image, not the old "SA" text mark', (file) => {
    const html = read(file);
    expect(html).toMatch(/<span class="brand-mark" aria-hidden="true"><img src="\/icons\/sapay-192\.svg" alt="" width="\d+" height="\d+"><\/span>/);
    expect(html).not.toMatch(/<span class="brand-mark">[^<]*<\/span>/);
  });
});
