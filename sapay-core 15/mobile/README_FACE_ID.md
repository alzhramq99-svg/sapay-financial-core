# SApay Face ID login

The iOS shell uses `@capgo/capacitor-native-biometric` to show the native iOS biometric prompt and keep the opt-in login credentials in the app's native credential store. The app always retains email/password login as a fallback.

## Setup

From `sapay-core 15/mobile`:

```sh
npm install
npm run cap:add:ios   # only if the ios/ project has not been created yet
npm run cap:sync
```

The sync script bundles `src/biometric.ts`, copies the web assets, syncs Capacitor plugins, and adds `NSFaceIDUsageDescription` to the generated iOS Info.plist.

Open `ios/App/App.xcworkspace` in Xcode, build on a Face ID-capable iPhone, and test:
1. Sign in using email and password.
2. Opt in when asked to enable Face ID.
3. Sign out, then use the Face ID button.
4. Confirm cancellation or unavailable biometrics leaves password login available.

## Face ID-bound Keychain (plugin 8.9.3, Capacitor 8)

- Requirements: Capacitor 8.6.2, `@capgo/capacitor-native-biometric` 8.9.3 (outside GHSA-vx5f-vmr6-32wf, which affects `< 8.3.6`), Node.js 22+, iOS 15.0+. The iOS project is generated with `npx cap add ios --packagemanager CocoaPods` so `ios/App/App.xcworkspace` exists; Capacitor 8 otherwise defaults to SPM.
- Credentials are stored with `accessControl: BIOMETRY_CURRENT_SET` and read only with `getSecureCredentials()`. iOS shows the Face ID prompt as part of the Keychain read and invalidates the item when the enrolled faces change. The bridge (`src/biometric-core.ts`) never uses the unprotected `getCredentials()` nor a standalone `verifyIdentity()` gate.
- Storing requires a device passcode (`WhenPasscodeSetThisDeviceOnly`).
- Migration: items saved by the 7.x bridge are unprotected and are never read. On first Face ID use after the upgrade (or after a Face ID enrollment change) the bridge deletes them and shows «لأمان حسابك، سجّل الدخول بكلمة المرور مرة واحدة لإعادة تفعيل Face ID.»; the next password login offers to enable Face ID again.
- Unit tests with a mocked plugin: `test/biometric-bridge.spec.ts` (cancel, failed match, lockout, unavailable, migration, no unprotected read). Real Face ID prompts, passcode-less devices and enrollment changes still need testing on a physical iPhone.

Face ID is a local device identity check; the server still validates the email/password credentials through the existing login endpoint. Do not describe this as server-side passkey authentication or as a substitute for server authentication. The current demo API does not implement passkeys.
