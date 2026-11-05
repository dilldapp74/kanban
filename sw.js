// Service Worker: macht das Board installierbar und offline startbar.
// Strategie: immer zuerst aus dem Netz laden (damit Updates sofort ankommen),
// bei fehlender Verbindung die zuletzt gespeicherte Fassung verwenden.

const CACHE = 'kanban-v11';

const DATEIEN = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './sync.js',
  './familie.js',
  './thema.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js'
];

self.addEventListener('install', ereignis => {
  ereignis.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)));
  self.skipWaiting();
});

self.addEventListener('activate', ereignis => {
  // Alte Cache-Versionen aufräumen
  ereignis.waitUntil(
    caches.keys().then(namen => Promise.all(namen.filter(n => n !== CACHE).map(n => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', ereignis => {
  const anfrage = ereignis.request;
  const url = new URL(anfrage.url);
  // Nur die eigenen Dateien und die Supabase-Bibliothek – Datenbankzugriffe nie zwischenspeichern
  const eigene = url.origin === self.location.origin || url.hostname === 'cdn.jsdelivr.net';
  if (anfrage.method !== 'GET' || !eigene) return;

  ereignis.respondWith(
    fetch(anfrage)
      .then(antwort => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then(c => c.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(anfrage, { ignoreSearch: true }))
  );
});

// ---------- Push-Benachrichtigungen (kommen von der Edge Function "benachrichtigen") ----------

self.addEventListener('push', ereignis => {
  let nachricht = {};
  try {
    nachricht = ereignis.data ? ereignis.data.json() : {};
  } catch (e) { /* kein gültiges JSON – Standardtext zeigen */ }
  ereignis.waitUntil(self.registration.showNotification(nachricht.titel || 'Family Kanban', {
    body: nachricht.text || '',
    icon: 'icons/icon-192.png',
    tag: nachricht.tag,           // gleiche Karte: alte Nachricht wird ersetzt statt gestapelt
    data: { url: './' }
  }));
});

// Antippen öffnet die App (oder holt das offene Fenster nach vorn)
self.addEventListener('notificationclick', ereignis => {
  ereignis.notification.close();
  ereignis.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenster => {
      for (const f of fenster) if ('focus' in f) return f.focus();
      return self.clients.openWindow(ereignis.notification.data.url);
    })
  );
});
