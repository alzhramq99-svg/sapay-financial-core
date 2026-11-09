# SApay iOS application shell

This folder packages the existing Arabic SApay web interface as a native iOS app using Capacitor. It does not reimplement wallet or API logic.

## Requirements
- Node.js 20+
- macOS with Xcode 16+ for iOS builds
- Apple Developer Program membership and App Store Connect access for device distribution through TestFlight

## Build the iOS project

```bash
cd "sapay-core 15/mobile"
npm install
npm run copy:web
npx cap add ios
npx cap sync ios
```

The web bundle is copied from `../public`; `runtime-config.js` already points to the HTTPS demo API. API calls and authentication remain served by the existing backend. No secrets or real-money integrations are included in this app shell.

## Signing and TestFlight

A physical-device IPA must be signed with an Apple Distribution certificate and an App Store provisioning profile. Configure signing in Xcode or a protected cloud macOS build after the Apple Developer membership is active. Never commit certificates, private keys, provisioning profiles, or App Store Connect API keys.

The repository workflow currently performs an unsigned iOS Simulator build as a packaging validation only; it does not produce a TestFlight-ready IPA.
