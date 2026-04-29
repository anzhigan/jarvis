import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.jarvnote.app',
  appName: 'Jarvnote',
  webDir: 'dist',

  // Mode A — bundled webview (offline-capable, must rebuild app for updates)
  // Mode B — server URL (uncomment for live reload to prod, no rebuild needed):
  // server: {
  //   url: 'https://jarvnote.ru',
  //   cleartext: false,
  // },

  ios: {
    // Show keyboard above webview without resizing the page
    contentInset: 'automatic',
    // Override default scheme so cookies / localStorage work consistently
    scheme: 'Jarvnote',
    // Allow back/forward swipe gestures
    allowsLinkPreview: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FAFAF9',
      iosSpinnerStyle: 'small',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DEFAULT',          // adapts to system theme
      backgroundColor: '#FAFAF9',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',          // viewport resizes when keyboard opens
      style: 'default',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
