// javascript-obfuscator:disable

// 🚨 1. THIS MUST BE AT THE VERY TOP! 
// 🚨 1. THIS MUST BE AT THE VERY TOP! 
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.stopImmediatePropagation();

  // DEFAULT FALLBACK: Open Inbox
  let targetAction = 'openMessages';
  let targetHash = '#inbox';

  // THE SMART ROUTER: Read the hidden Firebase payload!
  try {
    let msgType = event.notification.data.type || event.notification.data.FCM_MSG?.data?.type;
    
    if (msgType === 'admin_broadcast') {
      targetAction = 'openNotifications';
      targetHash = '#notifications';
    }
    else if (msgType === 'assignment') {
      targetAction = 'openAssignments';
      targetHash = '#assignments';
    }
    // 🚨 ADD THESE TWO LINES FOR THE PRINCIPAL DASHBOARD 🚨
    else if (msgType === 'teacher_request') {
      targetAction = 'openTeacherReq';
      targetHash = '#teacher_requests';
    }
    else if (msgType === 'event_request') {
      targetAction = 'openEventReq';
      targetHash = '#events';
    }
    // 🚨 NEW: ROUTER FOR STAFF & ACCOUNTANT APPROVALS 🚨
    else if (msgType === 'admin_request') {
      targetAction = 'openAdminReq';
      targetHash = '#admin_requests';
    }
    
    // 🚨 ADD THIS FIX: Stop "system" notifications from defaulting to the Inbox!
    else if (msgType === 'general' || msgType === 'login') {
      targetAction = 'none'; // Don't click any buttons
      targetHash = ''; // Just open the plain home screen URL
    }
  } catch(e) {
    console.log("Could not read message type, defaulting to inbox.");
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('adhyora.pixelaks.in')) {
          client.postMessage({ action: targetAction }); // 🚨 DYNAMIC ACTION
          return client.focus(); 
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow('https://adhyora.pixelaks.in/' + targetHash); // 🚨 DYNAMIC HASH
      }
    })
  );
});

// ==========================================================
// 2. NOW we are safe to let Firebase load in the background
// ==========================================================
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD_ixI42lNdSqWxHj2EZNpXDLBZ2U8coLA",
  authDomain: "adhyora-5d4c1.firebaseapp.com",
  projectId: "adhyora-5d4c1",
  storageBucket: "adhyora-5d4c1.firebasestorage.app",
  messagingSenderId: "206050348148",
  appId: "1:206050348148:web:da4e421e00ec2f77429521"
});

const messaging = firebase.messaging();

// 🚨 SERVICE WORKER HANDLES NOTIFICATION — enables heads-up banner + vibration!
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);

  const title = payload.data.title || 'Adhyora';
  const body = payload.data.body || 'You have a new notification';
  const type = payload.data.type || 'general';
  const icon = payload.data.image || './web-app-manifest-192x192.png';

  const notificationOptions = {
    body: body,
    icon: icon,
    badge: './ic_stat_notify.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: type,
    data: payload.data
  };

  return self.registration.showNotification(title, notificationOptions);
});

// 🚨 Badge count
self.addEventListener('push', (event) => {
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(1).catch(error => console.error("Badging failed:", error));
  }
});

// ==========================================================
// 3. OFFLINE CACHING FOR GOOGLE PLAY PWA APPROVAL
// ==========================================================
const CACHE_NAME = 'adhyora-offline-v1';
const OFFLINE_URL = './offline.html'; 

// When the app is installed, save offline.html to the phone
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Intercept network requests
self.addEventListener('fetch', (event) => {
  // Only intercept page navigations (HTML files)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If the network fails (offline), pull offline.html from the cache!
        return caches.match(OFFLINE_URL);
      })
    );
  }
});