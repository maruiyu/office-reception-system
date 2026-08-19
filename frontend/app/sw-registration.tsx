"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Service Workerを登録するクライアントコンポーネント
export default function ServiceWorkerRegistration() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.error("SW登録失敗:", err));

    // アプリが起動中に通知をタップした場合、SW側からpostMessageで行き先が届くので遷移する
    // （iOSのスタンドアロンPWAはopenWindow()だけではページ遷移しないことがあるための補完）
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate" && event.data.url) {
        router.push(event.data.url);
      }
    }
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [router]);

  return null;
}
