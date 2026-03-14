import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Must match applicationId in android/app/build.gradle
  appId: 'com.safewalk.app',
  appName: 'SafeWalk',
  // Points to your built web assets
  webDir: 'dist',
  // Keep the bundled JS in sync with the native shell
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // ── Push Notifications (FCM) ──────────────────────────────────────────
    PushNotifications: {
      // presentationOptions controls what happens when a push arrives
      // while the app is in the foreground on iOS (irrelevant on Android
      // but harmless to set).
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // ── Local Notifications ───────────────────────────────────────────────
    LocalNotifications: {
      // Android notification channel for the safety timer alerts
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#ef4444',
      sound: 'default',
    },

    // ── Geolocation ───────────────────────────────────────────────────────
    // (no extra config needed — permissions are declared in AndroidManifest.xml)

    // ── Status Bar ────────────────────────────────────────────────────────
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F8FAFC',
    },
  },
};

export default config;