// service-worker.js

const CACHE_NAME = 'my-pwa-cache-v1';
const urlsToCache = [
  './',
  'pdf.html',
  'pdf.css',
  'pdf.js',
  'crapper.html',
  'crapper.css',
  'crapper.js',
  'manifest.json',
  'register.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
  'https://cdn.jsdelivr.net/npm/piexifjs@1.0.4/piexif.min.js',
  'https://use.fontawesome.com/releases/v5.6.3/css/all.css', // 外部CSS
  'https://fonts.googleapis.com/css2?family=Lobster&display=swap', // 外部フォント
  'p1.png' // アイコン画像
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