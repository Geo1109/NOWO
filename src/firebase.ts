import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

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

// Messaging — only in browser (not SSR)
let messagingInstance: ReturnType<typeof getMessaging> | null = null;
export function getFirebaseMessaging() {
  if (!messagingInstance && typeof window !== 'undefined') {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

const VAPID_KEY = "BINV6r3kEz_GLcCeAPM1MEXQx2wMlk__P9Jitvq99Z708BUakEBuQALF3m67MeCDA87kjXnypN0BlBY3iCIsoOI";

// Request permission + get FCM token
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const messaging = getFirebaseMessaging();
    if (!messaging) return null;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token || null;
  } catch (e) {
    console.error('FCM token error:', e);
    return null;
  }
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: any) => void) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('Firestore Error:', operationType, path, msg);
  throw new Error(msg);
}