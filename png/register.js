// register.js

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker 登録成功:', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker 登録失敗:', error);
      });
  });
}