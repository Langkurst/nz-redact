/* Keeps a copy of NZ Redact's own files so it works offline. It only ever fetches this site's files. */
var VERSION = "nz-redact-1.1.0";
var CACHE = VERSION + "-2";   // the second build of this version (new design and fonts); the old copy is deleted on activate
var FILES = ["./", "index.html", "src/nz-redact.js", "app/app.js", "app/theme.js", "app/accuracy.js", "app/app.css", "app/icons.svg",
  "app/icon.svg", "app/icon-192.png", "app/icon-512.png", "app/fonts/inter-latin-opsz-normal.woff2", "app/fonts/inter-latin-ext-opsz-normal.woff2",
  "app/fonts/newsreader-latin-wght-italic.woff2", "app/fonts/GeistMono-Variable.woff2", "manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Network first, so a new version shows straight away; the saved copy is used when offline.
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    if (res.ok) caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
