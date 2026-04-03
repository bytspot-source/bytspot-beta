import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bytspot.app',
  appName: 'Bytspot',
  webDir: 'dist',

  // Server config — for live dev against hosted backend
  server: {
    androidScheme: 'https',
    // During TestFlight, the app loads from the bundled dist/
    // Uncomment the line below ONLY for local device testing:
    // url: 'http://192.168.x.x:3000',
    // cleartext: true,
  },

  ios: {
    // Respect iOS safe areas (notch, Dynamic Island, home indicator)
    contentInset: 'always',
    // Allow scroll bounce — matches the Bytspot swipe UX
    scrollEnabled: true,
    backgroundColor: '#000000',
  },

  plugins: {
    // ── Push Notifications (add @capacitor/push-notifications later) ──
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // ── Geolocation (When In Use only — no background location) ──
    Geolocation: {
      // NSLocationWhenInUseUsageDescription declared in Info.plist
    },

    // ── Status Bar ──
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000',
    },

    // ── Splash Screen ──
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
    },
  },
};

export default config;

