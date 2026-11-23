import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { createBiometricBridge } from './biometric-core';

// The bridge logic and its security notes live in biometric-core.ts. The
// Keychain key (`SERVER` there) must match `biometricServer` in public/app.js.
(window as any).SApayBiometric = createBiometricBridge(
  NativeBiometric,
  Capacitor.isNativePlatform(),
  AccessControl.BIOMETRY_CURRENT_SET,
);
