// 🚨 1. THIS MUST BE AT THE VERY TOP! 
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.stopImmediatePropagation();

  // DEFAULT FALLBACK: Open Inbox
  let targetAction = 'openMessages';
  let targetHash = '#inbox';

  // THE SMART ROUTER: Safely read the payload
  try {
    let msgType = "chat";
    
    // 🚨 FIX: Safely check both FCM formats so it never crashes!
    if (event.notification.data) {
        if (event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data) {
            msgType = event.notification.data.FCM_MSG.data.type;
        } else if (event.notification.data.type) {
            msgType = event.notification.data.type;
        }
    }
    
    if (msgType === 'admin_broadcast') {
      targetAction = 'openNotifications';
      targetHash = '#notifications';
    }
    else if (msgType === 'assignment') {
      targetAction = 'openAssignments';
      targetHash = '#assignments';
    }
    else if (msgType === 'teacher_request') {
      targetAction = 'openTeacherReq';
      targetHash = '#teacher_requests';
    }
    else if (msgType === 'event_request') {
      targetAction = 'openEventReq';
      targetHash = '#events';
    }
  } catch(e) {
    console.log("Could not read message type, defaulting to inbox.", e);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes('adhyora.pixelaks.in')) {
          client.postMessage({ action: targetAction }); 
          return client.focus(); 
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow('https://adhyora.pixelaks.in/' + targetHash); 
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

// This dummy fetch listener tells Android/Chrome that this site 
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
