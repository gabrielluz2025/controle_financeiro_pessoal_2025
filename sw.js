// Finanças+ Service Worker — v5
const CACHE = 'financas-plus-v5';
const STATIC = [
    '/',
    '/index.html',
    '/css/enhanced-styles.css',
    '/js/ofx-importer.js',
    '/js/csv-importer.js',
    '/js/voice-input.js',
    '/js/quick-input-form.js',
    '/js/receipt-scanner.js',
    '/js/live-cashflow.js',
    '/js/theme-manager.js',
    '/manifest.json',
    '/nova.html',
];

const NETWORK_FIRST = ['/index.html', '/nova.html', '.html', '/js/', '/css/', '/sw.js'];

function isNetworkFirst(url) {
    return NETWORK_FIRST.some(p => url.includes(p));
}

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('/api/')) return;

    if (isNetworkFirst(e.request.url)) {
        e.respondWith(
            fetch(e.request).then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => {
                if (e.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
