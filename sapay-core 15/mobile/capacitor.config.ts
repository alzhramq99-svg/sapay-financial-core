import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'Com.saadaligroup.sapay',
  appName: 'SApay',
  webDir: 'www',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#0A0A0A',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0A0A0A',
    preferredContentMode: 'mobile',
  },
};

export default config;
