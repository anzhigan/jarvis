import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.jarvnote.app',
  appName: 'Jarvnote',
  webDir: 'dist',

  ios: {
    contentInset: 'always',
    scheme: 'Jarvnote',
    allowsLinkPreview: false,
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FAFAF9',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DEFAULT',
      backgroundColor: '#FAFAF9',
    },
    Keyboard: {
      resize: 'body',
      style: 'DEFAULT',
      resizeOnFullScreen: false,
    },
  },
};

export default config;
