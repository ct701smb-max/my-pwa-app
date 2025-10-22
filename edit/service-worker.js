// service-worker.js

const CACHE_NAME = 'my-pwa-cache-v1';
const urlsToCache = [
  './',
  'edit.html',
  'edit.css',
  'edit.js',
  'manifest.json',
  'register.js',
  'edit.png' // アイコン画像
  // その他、オフラインで表示したいファイルや画像を追加
];

// インストール処理 (ファイルをキャッシュ)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// リソースフェッチ処理 (キャッシュからリソースを取得)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュ内にリクエストに対応するリソースがあればそれを返す
        if (response) {
          return response;
        }
        // なければネットワークから取得
        return fetch(event.request);
      })
  );
});