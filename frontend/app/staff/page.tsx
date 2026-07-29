"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// スタッフが自分のデバイスで使うポータル画面
// - プッシュ通知の許可・登録
// - 自分宛の受付番号発行
export default function StaffPortal() {
  const router = useRouter();
  const [staffId, setStaffId] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);
  const [expiresInHours, setExpiresInHours] = useState(8);
  const [issuing, setIssuing] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [error, setError] = useState("");

  // プッシュ通知を許可してサーバーに登録
  async function handleEnablePush() {
    if (!staffId) { setError("スタッフIDを入力してください"); return; }
    setPushStatus("requesting");
    setError("");

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setError("このブラウザはプッシュ通知に対応していません");
      setPushStatus("idle");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushStatus("denied");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) { setError("VAPID_PUBLIC_KEYが設定されていません"); setPushStatus("idle"); return; }

    // URLBase64をUint8Arrayに変換
    const key = urlBase64ToUint8Array(vapidKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, subscription: subscription.toJSON() }),
    });
    const data = await res.json();

    if (data.success) {
      setPushStatus("granted");
    } else {
      setError("通知登録に失敗しました");
      setPushStatus("idle");
    }
  }

  // 自分宛の受付番号を発行
  async function handleIssueCode() {
    if (!staffId) { setError("スタッフIDを入力してください"); return; }
    setIssuing(true);
    setError("");

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/codes/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, expiresInMinutes: expiresInHours * 60 }),
    });
    const data = await res.json();
    setIssuing(false);

    if (!data.success) {
      setError(data.message || "発行に失敗しました");
      return;
    }
    setNewCode(data.code);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg" style={{ backgroundColor: "#1a365d" }}>
            R
          </div>
          <h1 className="text-2xl font-bold text-gray-900">スタッフポータル</h1>
          <p className="text-gray-500 mt-1">受付番号の発行・プッシュ通知の設定</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* スタッフID入力（暫定：後でSupabase Auth認証に置き換え） */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">スタッフID</label>
          <input
            type="text"
            value={staffId}
            onChange={(e) => { setStaffId(e.target.value); setError(""); }}
            placeholder="Supabaseのスタッフ UUID"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">管理者からUUIDを受け取ってください</p>
        </div>

        {/* プッシュ通知設定 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <h2 className="font-bold text-gray-900 mb-1">着信通知を有効にする</h2>
          <p className="text-gray-500 text-sm mb-4">来訪者が呼び出したとき、このデバイスに全画面通知が届きます</p>
          {pushStatus === "granted" ? (
            <div className="flex items-center gap-2 text-green-700 font-medium">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              通知が有効になりました
            </div>
          ) : pushStatus === "denied" ? (
            <p className="text-red-500 text-sm">通知が拒否されています。ブラウザの設定から許可してください。</p>
          ) : (
            <button
              onClick={handleEnablePush}
              disabled={pushStatus === "requesting"}
              className="w-full py-3 text-white font-medium rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#1a365d" }}
            >
              {pushStatus === "requesting" ? "許可を確認中..." : "通知を許可する"}
            </button>
          )}
        </div>

        {/* 着信スタンバイ（プッシュ通知なしでも動作確認できるよう、この画面を開いたままにしておくと着信を受けられる） */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <h2 className="font-bold text-gray-900 mb-1">着信を待つ</h2>
          <p className="text-gray-500 text-sm mb-4">この画面を開いたままにしておくと、直接指名の呼び出しに応答できます</p>
          <button
            onClick={() => router.push(`/call?role=staff&staffId=${staffId}`)}
            disabled={!staffId}
            className="w-full py-3 text-white font-medium rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#1a365d" }}
          >
            待機画面を開く
          </button>
        </div>

        {/* 受付番号発行 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-1">受付番号を発行</h2>
          <p className="text-gray-500 text-sm mb-4">来訪者に伝える受付番号を発行します</p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">有効期限</label>
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm bg-white"
            >
              <option value={1}>1時間</option>
              <option value={4}>4時間</option>
              <option value={8}>8時間（当日）</option>
              <option value={24}>24時間</option>
            </select>
          </div>

          {newCode ? (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
              <p className="text-sm text-blue-600 font-medium mb-2">受付番号</p>
              <p className="text-5xl font-black tracking-widest text-blue-900 mb-3">{newCode}</p>
              <p className="text-xs text-blue-500 mb-3">来訪者にこの番号をお伝えください</p>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(newCode)}
                  className="flex-1 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium text-sm rounded-lg transition-all"
                >
                  コピー
                </button>
                <button
                  onClick={() => setNewCode(null)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium text-sm rounded-lg transition-all"
                >
                  新規発行
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleIssueCode}
              disabled={issuing}
              className="w-full py-3 text-white font-medium rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #1e40af 0%, #1a365d 100%)" }}
            >
              {issuing ? "発行中..." : "番号を発行する"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// VAPID公開鍵のURLBase64 → Uint8Array<ArrayBuffer>変換
// ApplicationServerKey の型要件（ArrayBufferView<ArrayBuffer>）を満たすために
// new ArrayBuffer() を明示的に使ってジェネリック型を確定させる
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
