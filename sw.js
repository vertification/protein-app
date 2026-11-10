// 단백질 20g 앱 서비스워커 — 앱 버전 2026.11.10c
// 인터넷이 되면 새 파일을 먼저 받아오고(자동 업데이트), 3초 안에 안 오거나 오프라인이면 저장해 둔 파일로 엽니다.
const CACHE = 'p20-2026.11.10c';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const WAIT = 3000; // 신호가 약할 때 저장본으로 여는 데까지 기다리는 시간(ms)
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const put = (r, res) => { if (res.ok) { const cp = res.clone(); return caches.open(CACHE).then(c => c.put(r, cp)).then(() => res); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    // no-cache: GitHub Pages의 10분 HTTP 캐시를 건너뛰고 서버에 새 버전이 있는지 확인 (navigate 요청은 옵션을 못 붙여서 URL로 다시 요청)
    const net = fetch(r.url, {cache: 'no-cache', credentials: 'same-origin'}).then(res => put(r, res));
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match(r, {ignoreSearch: true}).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html') : null)).then(hit => {
      if (!hit) return net;
      const late = new Promise(ok => setTimeout(() => ok(hit), WAIT));
      return Promise.race([net.then(res => res.ok ? res : hit, () => hit), late]);
    }));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => put(r, res))));
  }
});
