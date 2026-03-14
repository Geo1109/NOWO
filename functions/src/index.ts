import * as admin from "firebase-admin";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ── Trigger: când se adaugă un alert nou la un user ──────────────
export const onNewAlert = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return null;

  const beforeAlerts: any[] = before?.incomingAlerts || [];
  const afterAlerts: any[] = after?.incomingAlerts || [];

  const newAlerts = afterAlerts.filter(
    (a) => !beforeAlerts.some((b) => b.timestamp === a.timestamp)
  );
  if (newAlerts.length === 0) return null;

  const fcmToken: string | undefined = after?.fcmToken;
  if (!fcmToken) return null;

  for (const alert of newAlerts) {
    const message = {
      token: fcmToken,
      notification: {
        title: "🚨 Alertă de urgență SafeWalk",
        body: `${alert.from} are nevoie de ajutor! Apasă pentru a vedea locația.`,
      },
      data: {
        mapsLink: alert.mapsLink || "",
        fromUid: alert.fromUid || "",
        timestamp: alert.timestamp || "",
        type: "emergency_alert",
      },
      android: {
        priority: "high" as const,
        notification: { channelId: "emergency", priority: "max" as const, defaultVibrateTimings: true },
      },
      apns: { payload: { aps: { sound: "default", badge: 1, contentAvailable: true } } },
    };
    try {
      await messaging.send(message);
    } catch (e) {
      console.error("Failed to send alert:", e);
    }
  }
  return null;
});

// ── Trigger: când se adaugă un raport nou ────────────────────────
export const onNewReport = onDocumentCreated("reports/{reportId}", async (event) => {
  const report = event.data?.data();
  if (!report) return null;

  const { lat, lng, categories } = report;
  const usersSnap = await db.collection("users").where("fcmToken", "!=", "").get();
  const RADIUS_DEG = 0.0045;

  const sends: Promise<any>[] = [];

  usersSnap.forEach((userDoc) => {
    const userData = userDoc.data();
    if (!userData.fcmToken) return;
    if (userData.notifyFlagged === false) return;

    const userLat = userData.lastLat;
    const userLng = userData.lastLng;
    if (!userLat || !userLng) return;

    const dist = Math.sqrt(Math.pow(userLat - lat, 2) + Math.pow(userLng - lng, 2));
    if (dist > RADIUS_DEG) return;

    const catLabel = (categories || []).join(", ");
    const message = {
      token: userData.fcmToken,
      notification: {
        title: "⚠️ Zonă periculoasă în apropiere",
        body: `A fost raportat: ${catLabel}. Fii atent/ă!`,
      },
      data: { type: "danger_zone", lat: String(lat), lng: String(lng) },
      android: { priority: "high" as const },
      apns: { payload: { aps: { sound: "default" } } },
    };

    sends.push(messaging.send(message).catch((e) => console.error("Failed to notify:", e)));
  });

  await Promise.all(sends);
  return null;
});