// Service Worker для push-уведомлений
const CACHE_NAME = 'realtime-chat-v1';

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(clients.claim());
});

// Обработка push-уведомлений
self.addEventListener('push', (event) => {
    console.log('Push notification received');
    
    let notificationData = {
        title: 'Real-time Chat',
        body: 'У вас новое сообщение',
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: 'chat-notification'
    };
    
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                tag: data.tag || notificationData.tag
            };
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            requireInteraction: false,
            vibrate: [200, 100, 200]
        })
    );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked');
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Если окно уже открыто, фокусируемся на нем
                for (let client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Иначе открываем новое окно
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// Фоновое обновление данных
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

function doBackgroundSync() {
    // Здесь можно добавить логику синхронизации данных
    return Promise.resolve();
}

