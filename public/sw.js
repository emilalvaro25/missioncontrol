const CACHE_NAME = 'mission-control-v1';
const URLS_TO_CACHE = [
    '/index.html',
    '/analyzers.html',
    '/history.html',
    '/assets/css/style.css',
    '/assets/js/app.js',
    '/assets/images/logo.svg',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});
