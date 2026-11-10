# SApay iOS application shell

This folder packages the existing Arabic SApay web interface as an iOS app using Capacitor. It does not reimplement wallet or API logic.

## Requirements
- Node.js 20+
- macOS with Xcode 16+ for iOS builds (the cloud workflow uses a GitHub-hosted macOS runner)
- Active Apple Developer Program membership and App Store Connect access for device distribution through TestFlight

## Build the iOS project locally

```bash
cd "sapay-core 15/mobile"
npm install
npm run copy:web
npx cap add ios
npx cap sync ios
```

The web bundle is copied from `../public`; `runtime-config.js` points to the HTTPS demo API. The generated CocoaPods workspace (`ios/App/App.xcworkspace`) must be used for Xcode builds so the Capacitor framework is linked. API calls and authentication remain served by the existing backend. No secrets or real-money integrations are included in this app shell.

## Cloud build and TestFlight

The workflow is `.github/workflows/ios-testflight.yml` and is manually dispatched from GitHub Actions. It runs on a GitHub-hosted macOS runner, generates the Capacitor iOS project, archives and exports an App Store IPA, stores the IPA as a short-lived workflow artifact, and uploads it to TestFlight.

Before running the workflow, configure these GitHub Actions repository secrets:

| Secret | Purpose |
|---|---|
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded Apple Distribution certificate exported as a password-protected `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | Password used to export the `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded App Store provisioning profile for `com.saadaligroup.sapay` |
| `IOS_TEAM_ID` | Apple Developer Team ID |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API issuer ID |
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_CONNECT_API_PRIVATE_KEY` | Contents of the App Store Connect API private key (.p8) |

Do not commit certificates, private keys, provisioning profiles, passwords, or API keys. Add them only under GitHub repository Settings → Secrets and variables → Actions. Never paste them into chat.

### Apple-side prerequisites

1. The Apple Developer Program membership must be active.
2. Register the explicit App ID / Bundle ID `com.saadaligroup.sapay`.
3. Create the app record in App Store Connect using the same Bundle ID.
4. Create an Apple Distribution certificate and an App Store provisioning profile for that App ID.
5. Create an App Store Connect API key with the required app upload access and configure the secrets above.
6. Confirm the app's privacy disclosures, support URL, privacy policy URL, screenshots, review notes, and other metadata before submission.

The workflow does not bypass Apple's enrollment or signing requirements. Until the membership is active and all secrets and Apple-side records exist, a signed IPA and TestFlight upload cannot complete.

## App identity

- App name: SApay
- Bundle ID: `com.saadaligroup.sapay`
- SKU: `SAPAY-IOS-001`
- Demo API only; no real-money transfers or live bank integrations.
