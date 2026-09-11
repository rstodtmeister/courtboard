import { defineConfig } from "vite";
import { createHash } from "node:crypto";

export default defineConfig({
  base: "./",
  plugins: [{
    name: 'score-offline-shell',
    generateBundle(_options, bundle) {
      const included = new Set<string>();
      function include(name: string) {
        if (included.has(name)) return;
        included.add(name);
        const entry = bundle[name];
        if (entry?.type === 'chunk') entry.imports.forEach(include);
      }
      for (const [name, entry] of Object.entries(bundle)) {
        if (name.endsWith('.css') || (entry.type === 'chunk' && (entry.isEntry || entry.name === 'ScoreEntryApp'))) include(name);
      }
      const files = ['index.html', ...included];
      const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16);
      this.emitFile({ type: 'asset', fileName: 'score-worker.js', source: `
const CACHE = 'courtboard-score-${version}';
const files = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(files))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('courtboard-score-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && url.searchParams.has('token')) {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('index.html'))));
  } else if (files.some(file => new URL(file, self.registration.scope).href === url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
  }
});
` });
    },
  }],
});
