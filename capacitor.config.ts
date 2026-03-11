import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.familytracker',
  appName: 'Family Tracker',
  webDir: 'dist',
  server: {
    url: 'https://91774990-4eed-4eed-b341-3cc928986c36.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
