// Face ID bridge logic, kept free of Capacitor imports so it can be unit
// tested with a mocked plugin (test/biometric-bridge.spec.ts). biometric.ts
// wires it to @capgo/capacitor-native-biometric.
//
// Security model (plugin >= 8.4, verified against the 8.9.3 iOS source):
// - setCredentials({ accessControl: BIOMETRY_CURRENT_SET }) stores a
//   kSecClassGenericPassword item protected by SecAccessControl
//   (.biometryCurrentSet, WhenPasscodeSetThisDeviceOnly). iOS itself refuses to
//   release it without a fresh Face ID match, and invalidates it when the
//   enrolled faces change.
// - getSecureCredentials() reads that item; the Face ID prompt is shown by the
//   Keychain read itself, so no JavaScript-level "verified" flag can be forged
//   to skip it (the class of bypass in GHSA-vx5f-vmr6-32wf).
// - Items saved by plugin 7.x are unprotected kSecClassInternetPassword items.
//   They are never read: getCredentials() (the unprotected read) is not used.
//   When no protected item exists the bridge deletes any legacy item and asks
//   the user to sign in with the password once, which re-enrolls safely.

export const SERVER = 'sapay-financial-core';

// Error codes returned by the plugin's iOS getSecureCredentials()
// (NativeBiometricPlugin.swift, BiometricAuthError in definitions.d.ts).
export const ERROR = {
  AUTHENTICATION_FAILED: '10',
  USER_CANCEL: '16',
  SYSTEM_CANCEL: '15',
  APP_CANCEL: '11',
  USER_LOCKOUT: '2',
  USER_TEMPORARY_LOCKOUT: '4',
  NO_PROTECTED_CREDENTIALS_FOUND: '21',
} as const;

export const MESSAGES = {
  incomplete: 'بيانات الدخول غير مكتملة؛ سجّل الدخول بكلمة المرور أولاً.',
  iosOnly: 'Face ID متاح داخل تطبيق iOS فقط.',
  notEnrolled: 'لم يتم إعداد Face ID على هذا الجهاز.',
  unavailable: 'Face ID غير متاح. استخدم كلمة المرور.',
  saveFailed: 'تعذر حفظ بيانات Face ID. تأكد من تفعيل رمز مرور الجهاز وFace ID ثم أعد المحاولة.',
  cancelled: 'تم إلغاء التحقق عبر Face ID. يمكنك المحاولة مجددًا أو استخدام كلمة المرور.',
  failed: 'تعذر التحقق من هويتك عبر Face ID. حاول مرة أخرى أو استخدم كلمة المرور.',
  lockout: 'تم إيقاف Face ID مؤقتًا بعد محاولات متعددة. استخدم كلمة المرور.',
  reEnroll: 'لأمان حسابك، سجّل الدخول بكلمة المرور مرة واحدة لإعادة تفعيل Face ID.',
  generic: 'تعذر تسجيل الدخول باستخدام Face ID. استخدم كلمة المرور.',
} as const;

export const PROMPT_REASON = 'تأكيد هويتك لتسجيل الدخول إلى SApay';

export type Credentials = { username: string; password: string };

// The subset of the NativeBiometric plugin API this bridge relies on.
// getCredentials (the unprotected read) is intentionally absent.
export interface BiometricPlugin {
  isAvailable(): Promise<{ isAvailable: boolean }>;
  setCredentials(options: { username: string; password: string; server: string; accessControl: number }): Promise<void>;
  getSecureCredentials(options: { server: string; reason?: string }): Promise<Credentials>;
  isCredentialsSaved(options: { server: string }): Promise<{ isSaved: boolean }>;
  deleteCredentials(options: { server: string }): Promise<void>;
}

const codeOf = (error: unknown): string =>
  error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';

export function createBiometricBridge(plugin: BiometricPlugin, native: boolean, biometryCurrentSet: number) {
  async function isAvailable(): Promise<boolean> {
    if (!native) return false;
    try {
      const result = await plugin.isAvailable();
      return Boolean(result?.isAvailable);
    } catch {
      return false;
    }
  }

  async function clearCredentials(server = SERVER): Promise<void> {
    if (native) await plugin.deleteCredentials({ server });
  }

  async function saveCredentials(username: string, password: string, server = SERVER): Promise<void> {
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      throw new Error(MESSAGES.incomplete);
    }
    if (!native) throw new Error(MESSAGES.iosOnly);
    if (!(await isAvailable())) throw new Error(MESSAGES.notEnrolled);
    try {
      // Removes both a legacy unprotected item and any earlier protected one,
      // so only the Face ID-bound copy remains.
      await plugin.deleteCredentials({ server });
      await plugin.setCredentials({ username, password, server, accessControl: biometryCurrentSet });
    } catch {
      throw new Error(MESSAGES.saveFailed);
    }
  }

  async function getCredentials(server = SERVER): Promise<Credentials> {
    if (!native) throw new Error(MESSAGES.iosOnly);
    if (!(await isAvailable())) throw new Error(MESSAGES.unavailable);
    let credentials: Credentials;
    try {
      credentials = await plugin.getSecureCredentials({ server, reason: PROMPT_REASON });
    } catch (error) {
      switch (codeOf(error)) {
        case ERROR.USER_CANCEL:
        case ERROR.SYSTEM_CANCEL:
        case ERROR.APP_CANCEL:
          throw new Error(MESSAGES.cancelled);
        case ERROR.AUTHENTICATION_FAILED:
          throw new Error(MESSAGES.failed);
        case ERROR.USER_LOCKOUT:
        case ERROR.USER_TEMPORARY_LOCKOUT:
          throw new Error(MESSAGES.lockout);
        case ERROR.NO_PROTECTED_CREDENTIALS_FOUND:
          // Legacy (unprotected) item from plugin 7.x, or the item was
          // invalidated by a Face ID enrollment change: never fall back to an
          // unprotected read; remove what is left and re-enroll via password.
          try { await plugin.deleteCredentials({ server }); } catch { /* best effort */ }
          throw new Error(MESSAGES.reEnroll);
        default:
          throw new Error(MESSAGES.generic);
      }
    }
    if (typeof credentials?.username !== 'string' || !credentials.username ||
        typeof credentials?.password !== 'string' || !credentials.password) {
      throw new Error(MESSAGES.generic);
    }
    return { username: credentials.username, password: credentials.password };
  }

  async function hasCredentials(server = SERVER): Promise<boolean> {
    if (!native) return false;
    try {
      const result = await plugin.isCredentialsSaved({ server });
      return Boolean(result?.isSaved);
    } catch {
      return false;
    }
  }

  return { isNative: native, isAvailable, saveCredentials, getCredentials, hasCredentials, clearCredentials };
}
