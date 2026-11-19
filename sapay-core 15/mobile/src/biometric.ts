import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';

// Must match `biometricServer` in public/app.js, which saves and reads the
// Keychain entry under this key; a different default made clearCredentials()
// with no argument delete a different (empty) entry.
const SERVER = 'sapay-financial-core';
const native = Capacitor.isNativePlatform();

async function isAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return Boolean(result.isAvailable);
  } catch {
    return false;
  }
}

async function saveCredentials(username: string, password: string, server = SERVER): Promise<void> {
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    throw new Error('بيانات الدخول غير مكتملة؛ سجّل الدخول بكلمة المرور أولاً.');
  }
  if (!native) throw new Error('Face ID متاح داخل تطبيق iOS فقط.');
  const result = await NativeBiometric.isAvailable();
  if (!result.isAvailable) throw new Error('لم يتم إعداد Face ID على هذا الجهاز.');
  await NativeBiometric.setCredentials({ username, password, server });
}

async function getCredentials(server = SERVER): Promise<{ username: string; password: string }> {
  if (!native) throw new Error('Face ID متاح داخل تطبيق iOS فقط.');
  const available = await NativeBiometric.isAvailable();
  if (!available.isAvailable) throw new Error('Face ID غير متاح. استخدم كلمة المرور.');
  await NativeBiometric.verifyIdentity({
    reason: 'تأكيد هويتك لتسجيل الدخول إلى SApay',
    title: 'تسجيل الدخول إلى SApay',
    subtitle: 'استخدم Face ID للمتابعة',
    description: 'بيانات الدخول محفوظة على هذا الجهاز',
  });
  return NativeBiometric.getCredentials({ server });
}

async function hasCredentials(server = SERVER): Promise<boolean> {
  if (!native) return false;
  try {
    const result = await NativeBiometric.isCredentialsSaved({ server });
    return Boolean(result.isSaved);
  } catch {
    return false;
  }
}

async function clearCredentials(server = SERVER): Promise<void> {
  if (native) await NativeBiometric.deleteCredentials({ server });
}

(window as any).SApayBiometric = {
  isNative: native,
  isAvailable,
  saveCredentials,
  getCredentials,
  hasCredentials,
  clearCredentials,
};
