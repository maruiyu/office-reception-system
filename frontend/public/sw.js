/**
 * Service Worker
 * Web Pushプッシュ通知の受信と、通知クリック時の動作を管理する
 */

const PENDING_CALL_DB = "reception-app";
const PENDING_CALL_STORE = "pending-call";

function openPendingCallDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PENDING_CALL_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PENDING_CALL_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// iOSは通知タップでアプリが未起動から立ち上がる際、SWのopenWindow()より先に
// PWAのstart_url（/staff）を開いてしまうことがあるため、行き先URLを保存しておき
// 起動後にページ側（staff/page.tsx）で読み取って/callへ移動できるようにする
async function savePendingCallUrl(url) {
  const db = await openPendingCallDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_CALL_STORE, "readwrite");
    tx.objectStore(PENDING_CALL_STORE).put({ url, savedAt: Date.now() }, "latest");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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

  const targetUrl = payload.url || "/call";

  event.waitUntil(
    Promise.all([
      savePendingCallUrl(targetUrl).catch(() => {}),
      self.registration.showNotification(payload.title || "来訪者があります", {
        body: payload.body || "エントランスに来訪者が来ています",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        requireInteraction: true,  // 手動で閉じるまで消えない
        vibrate: [200, 100, 200, 100, 200], // バイブレーションパターン
        // 同じtagで再送されるたびに、古い通知を消さずに毎回音・バイブで再アラートさせる
        // （応答があるまでバックエンドが数秒おきに再送する「呼び出し音」代わり）
        tag: "incoming-call",
        renotify: true,
        data: { url: targetUrl },
        actions: [
          { action: "answer", title: "応答する" },
          { action: "dismiss", title: "後で" },
        ],
      }),
      // 対応iOS/ブラウザではアプリアイコンにバッジを表示し、後から気づけるようにする
      self.navigator?.setAppBadge ? self.navigator.setAppBadge(1).catch(() => {}) : Promise.resolve(),
    ])
  );
});

// 通知をクリックしたとき（応答画面を全画面で開く）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const rawUrl = event.notification.data?.url || "/call";
  // iOS Safariは相対URLをclients.openWindow()に渡すと正しく開けないことがあるため絶対URLに変換する
  const url = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // すでに開いているウィンドウ（アプリが起動中）があれば、
      // openWindow()に頼らずpostMessageでアプリ側のルーターに直接遷移させる
      // （iOSのスタンドアロンPWAは複数ウィンドウを持てず、openWindow()がフォーカスするだけで
      //   ページ遷移が起きないことがあるため）
      if (clients.length > 0) {
        const client = clients[0];
        client.postMessage({ type: "navigate", url: rawUrl });
        if ("focus" in client) return client.focus();
        return;
      }
      // 起動中のウィンドウがなければ新しく開く
      return self.clients.openWindow(url);
    })
  );
});
