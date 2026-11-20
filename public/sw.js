const CACHE_NAME = 'novahub-live-v7';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// Stealth Push Handler (Never shows actual message or sender name)
self.addEventListener('push', (event) => {
    const decoyMessages = [
        "New high score challenge! Game khelo **",
        "Daily spin reward ready! Game khelo ₹₹",
        "New puzzle level unlocked! Play now 🎮"
    ];
    const bodyText = decoyMessages[Math.floor(Math.random() * decoyMessages.length)];
    event.waitUntil(
        self.registration.showNotification("🎮 NovaHub Arcade", {
            body: bodyText,
            icon: "https://cdn-icons-png.flaticon.com/512/808/808439.png",
            badge: "https://cdn-icons-png.flaticon.com/512/808/808439.png",
            vibrate: [150, 70, 150],
            tag: "novahub-stealth-alert",
            renotify: true,
            data: { url: "./index.html" }
        })
    );
});

// Clicking decoy notification opens/focuses NovaHub
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || "./index.html";
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
