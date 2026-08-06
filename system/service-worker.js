// service-worker.js

const CACHE_NAME = 'my-pwa-cache-v1';
const urlsToCache = [
  './',
  '../index.html',
  '../web/wiki.html',
  '../web/menu.html',
  '../web/top.html',
  '../web/top.css',
  '../web/index.html',
  '../web/style.css',
  '../web/img/bar1.jpg',
  '../web/img/bar2.jpg',
  '../web/img/bg-icho.jpg',
  '../web/img/bg-sakura.jpg',
  '../web/img/bg-sea.jpg',
  '../web/img/bg-snow.jpg',
  '../web/img/bg-web.jpg',
  '../web/img/Logo1.png',
  '../web/img/Logo2.png',
  '../web/web.html',
  '../web/web.css',
  '../web/font-face.css',
  '../web/function.js',
  '../web/jquery.min.js',
  '../web/Android.html',
  '../web/Android.css',
  '../web/iPhone.html',
  '../web/iPhone.css',
  '../web/iPhone.js',
  '../web/jquery.js',
  '../web/iPhone-m/lock.mp3',
  '../web/iPhone-m/lock.ogg',
  '../web/iPhone-m/unlock.mp3',
  '../web/iPhone-m/unlock.ogg',
  '../web/company.html',
  '../web/company.css',
  '../web/recruit.html',
  '../web/login1.html',
  '../web/login2.html',
  '../web/shot.html',
  '../web/player.png',
  '../PDF/pdf.html',
  '../PDF/pdf.css',
  '../PDF/pdf.js',
  '../PDF/cropper.html',
  '../PDF/cropper.css',
  '../PDF/cropper.js',
  '../edit/edit.html',
  '../edit/edit.css',
  '../edit/edit.js',
  '../png/png.html',
  '../png/png.css',
  '../png/png.js',
  '../CAD/cad.html'
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
