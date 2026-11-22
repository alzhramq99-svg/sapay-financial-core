import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(join(__dirname, '../public/app.js'), 'utf8');
const start = source.indexOf('const nativeRuntime =');
const end = source.indexOf('// Safari reports', start);
if (start < 0 || end < 0) throw new Error('Cannot find browser API origin implementation');
const apiOriginSource = source.slice(start, end);

function resolveOrigin(protocol: string, host: string, native: boolean, apiBaseUrl: string) {
  const window = {
    location: { protocol, hostname: host, origin: `${protocol}//${host}` },
    Capacitor: { isNativePlatform: () => native },
    SAPAY_CONFIG: { apiBaseUrl },
  };
  return runInNewContext(`${apiOriginSource}\napiOrigin()`, { window, URL }) as string;
}

describe('iOS API origin', () => {
  it('routes Capacitor https://localhost WebView requests to configured HTTPS API', () => {
    expect(resolveOrigin('https:', 'localhost', true, 'https://sapay-api.onrender.com'))
      .toBe('https://sapay-api.onrender.com');
  });
  it('refuses native builds without an API base URL instead of targeting the local WebView', () => {
    expect(() => resolveOrigin('https:', 'localhost', true, '')).toThrow(/لم يتم إعداد عنوان خادم/);
  });
  it('refuses insecure API endpoints in native builds', () => {
    expect(() => resolveOrigin('https:', 'localhost', true, 'http://api.example.test'))
      .toThrow(/HTTPS/);
  });
  it('keeps the loopback dev proxy for non-native local browsers', () => {
    expect(resolveOrigin('http:', 'localhost', false, 'https://sapay-api.onrender.com'))
      .toBe('http://localhost');
  });
  it('keeps same-origin API requests for hosted non-native web builds', () => {
    expect(resolveOrigin('https:', 'wallet.example.test', false, ''))
      .toBe('https://wallet.example.test');
  });
});
