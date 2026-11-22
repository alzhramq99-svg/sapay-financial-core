import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BiometricPlugin, ERROR, MESSAGES, PROMPT_REASON, SERVER, createBiometricBridge,
} from '../mobile/src/biometric-core';

// Value of AccessControl.BIOMETRY_CURRENT_SET in @capgo/capacitor-native-biometric 8.x.
const BIOMETRY_CURRENT_SET = 1;

const pluginError = (code: string, message = 'native error') => Object.assign(new Error(message), { code });

function mockPlugin(overrides: Partial<Record<keyof BiometricPlugin, jest.Mock>> = {}) {
  const plugin = {
    isAvailable: jest.fn().mockResolvedValue({ isAvailable: true }),
    setCredentials: jest.fn().mockResolvedValue(undefined),
    getSecureCredentials: jest.fn().mockResolvedValue({ username: 'demo@example.test', password: 'demo-password-2026' }),
    isCredentialsSaved: jest.fn().mockResolvedValue({ isSaved: true }),
    deleteCredentials: jest.fn().mockResolvedValue(undefined),
    // Unprotected read from the plugin. The bridge must never call it.
    getCredentials: jest.fn().mockResolvedValue({ username: 'legacy@example.test', password: 'legacy-password' }),
    ...overrides,
  };
  return plugin;
}

const bridgeFor = (plugin: ReturnType<typeof mockPlugin>, native = true) =>
  createBiometricBridge(plugin as unknown as BiometricPlugin, native, BIOMETRY_CURRENT_SET);

describe('Face ID bridge (biometric-core)', () => {
  describe('saving credentials', () => {
    it('stores them bound to the current Face ID enrollment after removing any older item', async () => {
      const plugin = mockPlugin();
      await bridgeFor(plugin).saveCredentials('demo@example.test', 'demo-password-2026');
      expect(plugin.deleteCredentials).toHaveBeenCalledWith({ server: SERVER });
      expect(plugin.setCredentials).toHaveBeenCalledWith({
        username: 'demo@example.test', password: 'demo-password-2026', server: SERVER, accessControl: BIOMETRY_CURRENT_SET,
      });
      expect(plugin.deleteCredentials.mock.invocationCallOrder[0]).toBeLessThan(plugin.setCredentials.mock.invocationCallOrder[0]!);
    });

    it.each([
      ['empty email', '', 'pw-123456789012'],
      ['blank email', '   ', 'pw-123456789012'],
      ['empty password', 'demo@example.test', ''],
    ])('rejects %s without touching the Keychain', async (_label, user, password) => {
      const plugin = mockPlugin();
      await expect(bridgeFor(plugin).saveCredentials(user, password)).rejects.toThrow(MESSAGES.incomplete);
      expect(plugin.setCredentials).not.toHaveBeenCalled();
    });

    it('refuses when biometrics are not enrolled or unavailable', async () => {
      const plugin = mockPlugin({ isAvailable: jest.fn().mockResolvedValue({ isAvailable: false }) });
      await expect(bridgeFor(plugin).saveCredentials('demo@example.test', 'pw')).rejects.toThrow(MESSAGES.notEnrolled);
      expect(plugin.setCredentials).not.toHaveBeenCalled();
    });

    it('reports a clear Arabic message when the protected store fails (e.g. no device passcode)', async () => {
      const plugin = mockPlugin({ setCredentials: jest.fn().mockRejectedValue(new Error('errSecParam')) });
      await expect(bridgeFor(plugin).saveCredentials('demo@example.test', 'pw')).rejects.toThrow(MESSAGES.saveFailed);
    });

    it('is refused outside the native iOS app', async () => {
      const plugin = mockPlugin();
      await expect(bridgeFor(plugin, false).saveCredentials('demo@example.test', 'pw')).rejects.toThrow(MESSAGES.iosOnly);
      expect(plugin.setCredentials).not.toHaveBeenCalled();
    });
  });

  describe('reading credentials', () => {
    it('returns credentials only through the Face ID-protected Keychain read', async () => {
      const plugin = mockPlugin();
      await expect(bridgeFor(plugin).getCredentials()).resolves.toEqual({ username: 'demo@example.test', password: 'demo-password-2026' });
      expect(plugin.getSecureCredentials).toHaveBeenCalledWith({ server: SERVER, reason: PROMPT_REASON });
    });

    it.each([
      ['user cancellation', ERROR.USER_CANCEL, MESSAGES.cancelled],
      ['system cancellation', ERROR.SYSTEM_CANCEL, MESSAGES.cancelled],
      ['app cancellation', ERROR.APP_CANCEL, MESSAGES.cancelled],
      ['a failed face match', ERROR.AUTHENTICATION_FAILED, MESSAGES.failed],
      ['biometric lockout', ERROR.USER_LOCKOUT, MESSAGES.lockout],
      ['temporary lockout', ERROR.USER_TEMPORARY_LOCKOUT, MESSAGES.lockout],
      ['an unknown native error', '0', MESSAGES.generic],
    ])('maps %s to an Arabic message and releases no credentials', async (_label, code, expected) => {
      const plugin = mockPlugin({ getSecureCredentials: jest.fn().mockRejectedValue(pluginError(code)) });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(expected);
      expect(plugin.getCredentials).not.toHaveBeenCalled();
    });

    it('accepts a numeric error code as well as the string form', async () => {
      const plugin = mockPlugin({ getSecureCredentials: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 16 })) });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(MESSAGES.cancelled);
    });

    it('refuses when biometrics become unavailable and never prompts', async () => {
      const plugin = mockPlugin({ isAvailable: jest.fn().mockResolvedValue({ isAvailable: false }) });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(MESSAGES.unavailable);
      expect(plugin.getSecureCredentials).not.toHaveBeenCalled();
    });

    it('treats an isAvailable() failure as unavailable', async () => {
      const plugin = mockPlugin({ isAvailable: jest.fn().mockRejectedValue(new Error('LAContext')) });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(MESSAGES.unavailable);
    });

    it('is refused outside the native iOS app', async () => {
      const plugin = mockPlugin();
      await expect(bridgeFor(plugin, false).getCredentials()).rejects.toThrow(MESSAGES.iosOnly);
      expect(plugin.getSecureCredentials).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty result', {}],
      ['a missing password', { username: 'demo@example.test' }],
      ['a non-string password', { username: 'demo@example.test', password: 1234 }],
    ])('rejects %s from the Keychain', async (_label, value) => {
      const plugin = mockPlugin({ getSecureCredentials: jest.fn().mockResolvedValue(value) });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(MESSAGES.generic);
    });
  });

  describe('bypass attempts and migration from plugin 7.x', () => {
    it('never falls back to the unprotected read when no protected item exists', async () => {
      // A device upgraded from the 7.x bridge holds only an unprotected
      // kSecClassInternetPassword item; reading it would skip Face ID.
      const plugin = mockPlugin({ getSecureCredentials: jest.fn().mockRejectedValue(pluginError(ERROR.NO_PROTECTED_CREDENTIALS_FOUND)) });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(MESSAGES.reEnroll);
      expect(plugin.getCredentials).not.toHaveBeenCalled();
      expect(plugin.deleteCredentials).toHaveBeenCalledWith({ server: SERVER });
    });

    it('still asks for password re-enrollment if deleting the legacy item fails', async () => {
      const plugin = mockPlugin({
        getSecureCredentials: jest.fn().mockRejectedValue(pluginError(ERROR.NO_PROTECTED_CREDENTIALS_FOUND)),
        deleteCredentials: jest.fn().mockRejectedValue(new Error('errSecInteractionNotAllowed')),
      });
      await expect(bridgeFor(plugin).getCredentials()).rejects.toThrow(MESSAGES.reEnroll);
      expect(plugin.getCredentials).not.toHaveBeenCalled();
    });

    it('does not expose any way to read credentials without the protected prompt', () => {
      const bridge = bridgeFor(mockPlugin()) as unknown as Record<string, unknown>;
      expect(Object.keys(bridge).sort()).toEqual(
        ['clearCredentials', 'getCredentials', 'hasCredentials', 'isAvailable', 'isNative', 'saveCredentials'],
      );
    });

    it('source never calls the plugin\'s unprotected getCredentials() or a standalone verifyIdentity() gate', () => {
      const source = ['biometric-core.ts', 'biometric.ts']
        .map((f) => readFileSync(join(__dirname, '..', 'mobile', 'src', f), 'utf8'))
        .join('\n')
        .replace(/\/\/.*$/gm, '');
      expect(source).not.toMatch(/plugin\.getCredentials\s*\(/);
      expect(source).not.toMatch(/NativeBiometric\.getCredentials\s*\(/);
      expect(source).not.toMatch(/verifyIdentity\s*\(/);
      expect(source).toMatch(/AccessControl\.BIOMETRY_CURRENT_SET/);
    });
  });

  describe('state helpers', () => {
    it('reports saved credentials and hides errors from isCredentialsSaved()', async () => {
      await expect(bridgeFor(mockPlugin()).hasCredentials()).resolves.toBe(true);
      const failing = mockPlugin({ isCredentialsSaved: jest.fn().mockRejectedValue(new Error('x')) });
      await expect(bridgeFor(failing).hasCredentials()).resolves.toBe(false);
      await expect(bridgeFor(mockPlugin(), false).hasCredentials()).resolves.toBe(false);
    });

    it('clears both legacy and protected items through deleteCredentials()', async () => {
      const plugin = mockPlugin();
      await bridgeFor(plugin).clearCredentials();
      expect(plugin.deleteCredentials).toHaveBeenCalledWith({ server: SERVER });
      const web = mockPlugin();
      await bridgeFor(web, false).clearCredentials();
      expect(web.deleteCredentials).not.toHaveBeenCalled();
    });

    it('reports unavailable on the web without calling the plugin', async () => {
      const plugin = mockPlugin();
      await expect(bridgeFor(plugin, false).isAvailable()).resolves.toBe(false);
      expect(plugin.isAvailable).not.toHaveBeenCalled();
    });
  });
});
