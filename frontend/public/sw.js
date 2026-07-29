/**
 * Service Worker
 * Web Pushプッシュ通知の受信と、通知クリック時の動作を管理する
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// プッシュ通知を受信したとき
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "来訪者があります", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "来訪者があります", {
      body: payload.body || "エントランスに来訪者が来ています",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: true,  // 手動で閉じるまで消えない
      vibrate: [200, 100, 200, 100, 200], // バイブレーションパターン
      data: { url: payload.url || "/call" },
      actions: [
        { action: "answer", title: "応答する" },
        { action: "dismiss", title: "後で" },
      ],
    })
  );
});

// 通知をクリックしたとき（応答画面を全画面で開く）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/call";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // すでに開いているウィンドウがあればフォーカス
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // 新しいウィンドウを開く
      return self.clients.openWindow(url);
    })
  );
});
