const CACHE_NAME = 'smart-presenter-v41-fix';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './index.tsx',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap'
];

// Install Event: Cache assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event: Clean old caches aggressively
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Take control of all clients immediately
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Only handle http/https requests
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  
  // 1. Navigation Fallback (SPA Pattern): Fixes 404 on launch
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try network first for navigation to get fresh content
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (error) {
          // If network fails (offline or 404), return the cached index.html
          // Use a robust strategy to find the index
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('./index.html');
          return cachedIndex || await cache.match('./') || await cache.match('index.html');
        }
      })()
    );
    return;
  }

  // Allow caching of local assets and specific CDNs
  const isLocal = url.origin === self.location.origin;
  const isAllowedCDN = 
      url.hostname.includes('tailwindcss.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('esm.sh') ||
      url.hostname.includes('gstatic.com');

  if (!isLocal && !isAllowedCDN) {
    return;
  }

  // 2. Stale-While-Revalidate for assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Network failure - nothing to do, rely on cache
      });

      return cachedResponse || fetchPromise;
    })
  );
});