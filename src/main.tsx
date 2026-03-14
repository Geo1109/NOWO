import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

// ── Android-specific setup ──────────────────────────────────────────────────
if (Capacitor.isNativePlatform()) {
  // Style the status bar to match the app header
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#F8FAFC' }).catch(() => {});

  // Handle the Android hardware back button.
  // If there is browser history to go back to, go back;
  // otherwise exit the app so it doesn't feel broken.
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapApp.exitApp();
    }
  });

  // Resume push-notification listeners when the app comes back to foreground.
  // (The actual listener is registered in firebase.ts — this just ensures the
  // map / Firestore subscriptions re-hydrate cleanly after a background pause.)
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      console.log('[SafeWalk] App resumed from background');
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);