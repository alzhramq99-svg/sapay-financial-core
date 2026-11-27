// Regression tests for issue #58: the Face ID bridge security model documented
// in mobile/src/biometric-core.ts (that file refers to this spec by name).
import { BiometricPlugin, createBiometricBridge, ERROR, MESSAGES, SERVER } from '../mobile/src/biometric-core';

const BIOMETRY_CURRENT_SET = 42;

function plugin(overrides: Partial<BiometricPlugin> = {}) {
  const calls: string[] = [];
  const base: BiometricPlugin = {
    isAvailable: jest.fn(async () => { calls.push('isAvailable'); return { isAvailable: true }; }),
    setCredentials: jest.fn(async () => { calls.push('setCredentials'); }),
    getSecureCredentials: jest.fn(async () => { calls.push('getSecureCredentials'); return { username: 'a@example.test', password: 'pw-123456789012' }; }),
    isCredentialsSaved: jest.fn(async () => ({ isSaved: true })),
    deleteCredentials: jest.fn(async () => { calls.push('deleteCredentials'); }),
  };
  return { impl: { ...base, ...overrides } as BiometricPlugin & Record<string, jest.Mock>, calls };
}

describe('Face ID bridge (issue #58)', () => {
  it('stores credentials only with the biometry-current-set access control, after deleting any older item', async () => {
    const { impl, calls } = plugin();
    const bridge = createBiometricBridge(impl, true, BIOMETRY_CURRENT_SET);
    await bridge.saveCredentials('a@example.test', 'pw-123456789012');
    expect(calls).toEqual(['isAvailable', 'deleteCredentials', 'setCredentials']);
    expect(impl.setCredentials).toHaveBeenCalledWith({
      username: 'a@example.test', password: 'pw-123456789012', server: SERVER, accessControl: BIOMETRY_CURRENT_SET,
    });
  });

  it('reads credentials only through the Face ID-protected Keychain read', async () => {
    const unprotectedRead = jest.fn();
    const { impl } = plugin();
    (impl as any).getCredentials = unprotectedRead;
    const bridge = createBiometricBridge(impl, true, BIOMETRY_CURRENT_SET);
    await expect(bridge.getCredentials()).resolves.toEqual({ username: 'a@example.test', password: 'pw-123456789012' });
    expect(impl.getSecureCredentials).toHaveBeenCalledTimes(1);
    expect(unprotectedRead).not.toHaveBeenCalled();
  });

  it('deletes a legacy or invalidated item and asks for password re-enrolment instead of falling back', async () => {
    const { impl } = plugin({
      getSecureCredentials: jest.fn(async () => { throw Object.assign(new Error('x'), { code: ERROR.NO_PROTECTED_CREDENTIALS_FOUND }); }),
    });
    const bridge = createBiometricBridge(impl, true, BIOMETRY_CURRENT_SET);
    await expect(bridge.getCredentials()).rejects.toThrow(MESSAGES.reEnroll);
    expect(impl.deleteCredentials).toHaveBeenCalledWith({ server: SERVER });
  });

  it.each([
    [ERROR.USER_CANCEL, MESSAGES.cancelled],
    [ERROR.AUTHENTICATION_FAILED, MESSAGES.failed],
    [ERROR.USER_LOCKOUT, MESSAGES.lockout],
    ['999', MESSAGES.generic],
  ])('maps plugin error %s to a safe message without returning credentials', async (code: string, text: string) => {
    const { impl } = plugin({
      getSecureCredentials: jest.fn(async () => { throw Object.assign(new Error('x'), { code }); }),
    });
    await expect(createBiometricBridge(impl, true, BIOMETRY_CURRENT_SET).getCredentials()).rejects.toThrow(text);
  });

  it('rejects an empty credential payload from the plugin', async () => {
    const { impl } = plugin({ getSecureCredentials: jest.fn(async () => ({ username: '', password: '' })) });
    await expect(createBiometricBridge(impl, true, BIOMETRY_CURRENT_SET).getCredentials()).rejects.toThrow(MESSAGES.generic);
  });

  it('is inert outside the native app (web/PWA never touches the plugin)', async () => {
    const { impl } = plugin();
    const bridge = createBiometricBridge(impl, false, BIOMETRY_CURRENT_SET);
    expect(await bridge.isAvailable()).toBe(false);
    expect(await bridge.hasCredentials()).toBe(false);
    await expect(bridge.saveCredentials('a@example.test', 'pw')).rejects.toThrow(MESSAGES.iosOnly);
    await expect(bridge.getCredentials()).rejects.toThrow(MESSAGES.iosOnly);
    expect(impl.isAvailable).not.toHaveBeenCalled();
    expect(impl.getSecureCredentials).not.toHaveBeenCalled();
  });
});

describe('Face ID and logout in public/app.js (issue #58)', () => {
  // Imported lazily so the bridge tests above do not depend on the browser harness.
  const { loadApp } = require('./helpers/browser-harness') as typeof import('./helpers/browser-harness');

  it('removes the stored Face ID credential when the user explicitly signs out (Vortex findings #7/#8)', async () => {
    const biometric = {
      isNative: true,
      isAvailable: jest.fn(async () => true),
      hasCredentials: jest.fn(async () => true),
      saveCredentials: jest.fn(async () => undefined),
      getCredentials: jest.fn(),
      clearCredentials: jest.fn(async () => undefined),
    };
    const app = loadApp({ biometric });
    await app.login('alice@example.test', 'token-alice', 'user-a');
    await app.serveDashboard('token-alice', []);
    await app.byId('logoutBtn').dispatch('click');
    await app.flush();
    expect(biometric.clearCredentials).toHaveBeenCalled();
  });

  it('does not keep a signed-out session alive or claim success when deleting the Face ID credential fails (no credential leakage)', async () => {
    const biometric = {
      isNative: true,
      isAvailable: jest.fn(async () => true),
      hasCredentials: jest.fn(async () => true),
      saveCredentials: jest.fn(async () => undefined),
      getCredentials: jest.fn(),
      clearCredentials: jest.fn(async () => { throw new Error('Keychain write busy'); }),
    };
    const app = loadApp({ biometric });
    await app.login('alice@example.test', 'token-alice', 'user-a');
    await app.serveDashboard('token-alice', []);
    await app.byId('logoutBtn').dispatch('click');
    await app.flush();

    expect(biometric.clearCredentials).toHaveBeenCalled();
    // The sign-out itself must still complete even though the native delete failed.
    expect(app.storage.has('sapay_access_token')).toBe(false);
    expect(app.byId('appView').hidden).toBe(true);
    expect(app.byId('authView').hidden).toBe(false);
    // The UI must not tell the user the sign-out was a plain success: that
    // would hide the fact that the old credential may still be usable.
    expect(app.byId('toast').textContent).not.toBe('تم تسجيل الخروج.');
  });
});
