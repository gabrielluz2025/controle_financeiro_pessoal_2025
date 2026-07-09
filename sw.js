// Finanças+ Service Worker — v7 (layout responsivo desktop/tablet)
const CACHE = 'financas-plus-v7';
const STATIC = ['/', '/index.html', '/classico.html', '/nova.html', '/manifest.json', '/css/enhanced-styles.css'];

const NETWORK_FIRST = ['.html', '/js/', '/css/', '/sw.js'];

function isNetworkFirst(url) {
    return NETWORK_FIRST.some(p => url.includes(p));
}

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('/api/')) return;

    if (isNetworkFirst(e.request.url)) {
        e.respondWith(
            fetch(e.request).then(res => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
        );
        return;
    }

    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
});
