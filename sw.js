/* Acquisition Scan moved to Vehicle Scan (https://littlecountrycars.github.io/lcc-vehicle-scan/).
   This worker replaces the old one: it removes the old offline copy (only this app's own) and unregisters itself. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { await new Promise((r) => { const q = indexedDB.deleteDatabase('lcc-acquisition-scan'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); } catch (x) {}
    await self.registration.unregister();
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach((c) => { try { c.navigate('https://littlecountrycars.github.io/lcc-vehicle-scan/?mode=auction'); } catch (x) {} });
  })());
});
