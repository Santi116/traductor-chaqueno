// Service worker: guarda la aplicación en el dispositivo para que abra sin internet.
// La versión cambia sola cuando cambia cualquier archivo (se actualiza en la siguiente apertura).
const VERSION = "tch-7803500e0e";
const ARCHIVOS = ["./", "glosario_inicial.json", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "manifest.webmanifest", "static/almacen.js", "static/app.js", "static/bandera.js", "static/img/chaco.png", "static/img/escudo.png", "static/img/favicon.png", "static/img/wiphala.jpg", "static/instalar.js", "static/minga.js", "static/style.css", "static/voz.js", "static/xlsx.js"];

self.addEventListener("install", e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
    if (e.request.method !== "GET") return;
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).catch(() => caches.match("index.html"))));
});
