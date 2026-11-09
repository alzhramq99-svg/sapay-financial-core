import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.saadaligroup.sapay',
  appName: 'SApay',
  webDir: 'www',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f4f7f9',
    preferredContentMode: 'mobile',
  },
};

export default config;
