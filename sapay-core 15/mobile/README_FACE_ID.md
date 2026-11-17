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

Face ID is a local device identity check; the server still validates the email/password credentials through the existing login endpoint. Do not describe this as server-side passkey authentication or as a substitute for server authentication. The current demo API does not implement passkeys.
