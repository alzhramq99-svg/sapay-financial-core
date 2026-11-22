import { readFileSync } from 'fs';
import { join } from 'path';

// The web app saves and reads Face ID credentials under `biometricServer`
// (public/app.js); the native bridge's default server must be the same key,
// or a no-argument clearCredentials() deletes the wrong Keychain entry.
describe('biometric Keychain server key', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('matches between the web app and the native bridge default', () => {
    const webKey = /const biometricServer = '([^']+)'/.exec(read('public/app.js'))?.[1];
    const bridgeKey = /const SERVER = '([^']+)'/.exec(read('mobile/src/biometric-core.ts'))?.[1];
    expect(webKey).toBeDefined();
    expect(bridgeKey).toBe(webKey);
  });
});
