// Firebase Service Worker pentru Push Notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA1jYd3llJx2KeR5OvU1REH3ze9LussRWg",
  authDomain: "nowo-debfb.firebaseapp.com",
  projectId: "nowo-debfb",
  storageBucket: "nowo-debfb.firebasestorage.app",
  messagingSenderId: "369091761430",
  appId: "1:369091761430:web:35ef9f63b4d21c754cac37",
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'SafeWalk', {
    body: body || '',
    icon: icon || '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: payload.data?.mapsLink ? [
      { action: 'view', title: 'Vezi locația' }
    ] : [],
  });
});

// Click on notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const mapsLink = event.notification.data?.mapsLink;
  if (event.action === 'view' && mapsLink) {
    clients.openWindow(mapsLink);
  } else {
    clients.openWindow('/');
  }
});