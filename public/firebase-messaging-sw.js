importScripts("https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCxlPiB7gOAnpkTG60a2LpyJt1Nfn8m3g8",
  authDomain: "novahub-201e5.firebaseapp.com",
  projectId: "novahub-201e5",
  storageBucket: "novahub-201e5.firebasestorage.app",
  messagingSenderId: "188612451279",
  appId: "1:188612451279:web:02895aafeab4fcef7ad0ba"
});

const messaging = firebase.messaging();

// App band hone ya screen lock hone par fake game notification dikhayega
messaging.onBackgroundMessage((payload) => {
  const title = (payload.data && payload.data.title) || "🎮 NovaHub Arcade";
  const body = (payload.data && payload.data.body) || "New high score challenge! Game khelo **";
  self.registration.showNotification(title, {
    body,
    icon: "https://cdn-icons-png.flaticon.com/512/808/808439.png",
    badge: "https://cdn-icons-png.flaticon.com/512/808/808439.png",
    vibrate: [180, 80, 180],
    tag: "novahub-stealth-" + Date.now(),
    data: { url: "/index.html" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/index.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
