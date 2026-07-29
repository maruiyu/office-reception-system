"use client";

import { useEffect } from "react";

// Service Workerを登録するクライアントコンポーネント
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("SW登録失敗:", err));
    }
  }, []);

  return null;
}
