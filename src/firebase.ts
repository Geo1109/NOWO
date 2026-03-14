import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

const firebaseConfig = {
  apiKey: "AIzaSyA1jYd3llJx2KeR5OvU1REH3ze9LussRWg",
  authDomain: "nowo-debfb.firebaseapp.com",
  databaseURL: "https://nowo-debfb-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nowo-debfb",
  storageBucket: "nowo-debfb.firebasestorage.app",
  messagingSenderId: "369091761430",
  appId: "1:369091761430:web:35ef9f63b4d21c754cac37",
  measurementId: "G-SWQETPVMRM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/**
 * Request push notification permission and return the native FCM token.
 * On Android (via Capacitor) we use @capacitor/push-notifications.
 * On web we return null — web push is handled by the service worker.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    // Web: FCM token is managed by firebase-messaging-sw.js (service worker).
    // Return null here; the web flow is unchanged.
    return null;
  }

  try {
    // Check existing permission status first
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return null;
    }

    // Register with FCM — the native SDK handles the rest
    await PushNotifications.register();

    return new Promise<string | null>((resolve) => {
      // Timeout so we never hang indefinitely
      const timeout = setTimeout(() => resolve(null), 12000);

      PushNotifications.addListener('registration', (token) => {
        clearTimeout(timeout);
        resolve(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timeout);
        console.error('FCM registration error:', err);
        resolve(null);
      });
    });
  } catch (e) {
    console.error('FCM token error:', e);
    return null;
  }
}

/**
 * Listen for foreground push notifications (app is open).
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(callback: (payload: any) => void): () => void {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback: no-op (web handles this via firebase-messaging-sw.js)
    return () => {};
  }

  let listenerHandle: { remove: () => void } | null = null;

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Normalise to the same shape the web SDK returns so consumers don't change
    callback({
      notification: {
        title: notification.title,
        body:  notification.body,
      },
      data: notification.data ?? {},
    });
  }).then((handle) => {
    listenerHandle = handle;
  });

  return () => listenerHandle?.remove();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST   = 'list',
  GET    = 'get',
  WRITE  = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('Firestore Error:', operationType, path, msg);
  throw new Error(msg);
}