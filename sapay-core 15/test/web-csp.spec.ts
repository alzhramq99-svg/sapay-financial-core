import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// main.ts serves public/ behind helmet's default CSP (script-src 'self';
// script-src-attr 'none'), so inline scripts and inline event handlers in
// these pages are silently blocked when the API host serves the UI.
describe('public pages are compatible with the API CSP', () => {
  const dir = join(__dirname, '..', 'public');
  const pages = readdirSync(dir).filter((f) => f.endsWith('.html'));

  it.each(pages)('%s has no inline <script> blocks', (page) => {
    const html = readFileSync(join(dir, page), 'utf8');
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, attrs = '', body = '']) => !/\bsrc\s*=/.test(attrs) || body.trim() !== '');
    expect(inline).toEqual([]);
  });

  it.each(pages)('%s has no inline event handler attributes', (page) => {
    expect(readFileSync(join(dir, page), 'utf8')).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
  });
});
