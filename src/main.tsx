import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#F8FAFC' }).catch(() => {});

  /**
   * Full permission + location-on sequence.
   * Shows native system dialogs for everything the app needs.
   */
  const requestAllPermissions = async () => {
    const { Geolocation } = await import('@capacitor/geolocation');

    // ── Step 1: Location permission ("Allow / Deny" dialog) ───────────────
    let locationGranted = false;
    try {
      const perm = await Geolocation.requestPermissions();
      locationGranted =
        perm.location === 'granted' || (perm as any).coarseLocation === 'granted';
    } catch (e) {
      console.warn('[Permissions] Location permission error:', e);
    }

    if (locationGranted) {
      await wait(500);

      // ── Step 2: Show "Turn on Location?" system dialog ────────────────
      // This is the Google Play Services ResolvableApiException dialog that
      // shows "Device location / Location Accuracy — No thanks / Turn on"
      try {
        const { LocationSettings } = await import('./LocationSettings');
        const result = await LocationSettings.requestLocationServices();
        console.log('[Permissions] Location services:', result.status);
      } catch (e) {
        console.warn('[Permissions] LocationSettings plugin not available:', e);
        // Plugin not registered yet — the app will still work, GPS will be
        // requested by startGeoWatch in App.tsx
      }
    }

    await wait(800);

    // ── Step 3: Push notifications ────────────────────────────────────────
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const result = await PushNotifications.requestPermissions();
      if (result.receive === 'granted') await PushNotifications.register();
    } catch (e) {
      console.warn('[Permissions] Push error:', e);
    }

    await wait(800);

    // ── Step 4: Local notifications ────────────────────────────────────────
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.requestPermissions();
    } catch (e) {
      console.warn('[Permissions] LocalNotif error:', e);
    }

    // ── Step 5: Motion (iOS 13+ only) ──────────────────────────────────────
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as any).requestPermission === 'function'
    ) {
      await wait(800);
      try {
        await (DeviceMotionEvent as any).requestPermission();
      } catch {}
    }
  };

  // Fire 1.2s after launch so the loading screen is visible first
  setTimeout(requestAllPermissions, 1200);

  // ── Re-initialise GPS when app comes back to foreground ─────────────────
  // Covers the case where: user was shown the location dialog → tapped "Turn on"
  // → came back to the app. Without this, the dot stays hidden until next restart.
  CapApp.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return;
    console.log('[NoWo] Resumed from background — rechecking GPS');
    // Dispatch a custom event that App.tsx listens to for re-triggering GPS
    window.dispatchEvent(new CustomEvent('nowo:appResumed'));
  });

  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else CapApp.exitApp();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);