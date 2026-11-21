import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.saadaligroup.sapay',
  appName: 'SApay',
  webDir: 'www',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
    // Matches the dark SApay identity and scripts/configure-ios-appearance.mjs,
    // so no light area shows behind the WebView during launch or overscroll.
    backgroundColor: '#0A0A0A',
    preferredContentMode: 'mobile',
  },
};

export default config;
