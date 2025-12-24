// Service Worker - автоматическая версия по timestamp
const CACHE_VERSION = 'spanish-trainer-v1735089000000';

self.addEventListener('install', (event) => {
  console.log('✅ Service Worker установлен, версия:', CACHE_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker активирован');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION) {
            console.log('🗑️ Удаляем старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Добавляем timestamp к CSS и JS файлам
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    const timestampedUrl = new URL(event.request.url);
    timestampedUrl.searchParams.set('_t', Date.now());
    
    event.respondWith(
      fetch(timestampedUrl)
        .then(response => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Для остальных файлов - обычная загрузка
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  }
});