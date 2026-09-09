"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { consumePendingCallUrl } from "@/lib/pendingCall";

type StaffSession = { staffId: string; name: string };

const SESSION_KEY = "staff_session";
// スタッフが手動で通知を無効化したことを記録するキー（自動復元処理が再購読しないようにするため）
const PUSH_DISABLED_KEY = "staff_push_disabled";

// スタッフが自分のデバイスで使うポータル画面
// - ログインコードでのログイン(初回のみ。以後は端末に保存され自動ログイン)
// - プッシュ通知の許可・登録
// - 自分宛の受付番号発行
export default function StaffPortal() {
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const [loginCode, setLoginCode] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [newCode, setNewCode] = useState<string | null>(null);
  const [expiresInHours, setExpiresInHours] = useState(8);
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "disabling">("idle");
  const [error, setError] = useState("");

  // iOSで通知タップ時にPWAが/staffから起動してしまった場合、
  // sw.jsが保存しておいた本来の行き先（/call）があればそちらへ移動する
  useEffect(() => {
    consumePendingCallUrl().then((url) => {
      if (url) router.replace(url);
    });
  }, [router]);

  // 端末に保存済みのログインセッションがあれば自動的に復元する
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setSessionLoaded(true);
  }, []);

  // ログインコードを照合してログイン
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginCode) return;
    setLoggingIn(true);
    setError("");

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/staff/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginCode }),
    });
    const data = await res.json();
    setLoggingIn(false);

    if (!data.success) {
      setError(data.message || "ログインに失敗しました");
      return;
    }

    const newSession: StaffSession = { staffId: data.staff.id, name: data.staff.name };
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    setSession(newSession);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setLoginCode("");
    setPushStatus("idle");
    setNewCode(null);
    setError("");
  }

  // プッシュ通知を許可してサーバーに登録
  async function handleEnablePush() {
    if (!session) return;
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
      body: JSON.stringify({ staffId: session.staffId, subscription: subscription.toJSON() }),
    });
    const data = await res.json();

    if (data.success) {
      localStorage.removeItem(PUSH_DISABLED_KEY);
      setPushStatus("granted");
    } else {
      setError("通知登録に失敗しました");
      setPushStatus("idle");
    }
  }

  // プッシュ通知を無効にする（ブラウザの購読を解除しサーバー側の登録も消す）
  async function handleDisablePush() {
    if (!session) return;
    setPushStatus("disabling");
    setError("");

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await subscription.unsubscribe();
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
      await fetch(`${backendUrl}/api/push/subscribe/${session.staffId}`, { method: "DELETE" });
    } catch {
      // ブラウザ側の解除に失敗しても、通知が来ない状態を優先してidleに戻す
    }

    localStorage.setItem(PUSH_DISABLED_KEY, "1");
    setPushStatus("idle");
  }

  // 通話終了後などにこのページへ戻ってきた際、
  // ブラウザ側で既に通知が許可済みなら再度許可を求めず「許可済み」状態を復元する
  useEffect(() => {
    if (!session) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    // スタッフが手動で無効化している場合は、許可済みでも自動再購読しない
    if (localStorage.getItem(PUSH_DISABLED_KEY)) return;

    if (Notification.permission === "denied") {
      setPushStatus("denied");
      return;
    }

    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then(async (registration) => {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          setPushStatus("granted");
        } else {
          // 許可はされているが購読が切れている場合、確認ダイアログなしで裏側で再購読する
          handleEnablePush();
        }
      });
    }
  }, [session]);

  // 自分宛の受付番号を発行
  async function handleIssueCode() {
    if (!session) return;
    setIssuing(true);
    setError("");

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/codes/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: session.staffId, expiresInMinutes: expiresInHours * 60 }),
    });
    const data = await res.json();
    setIssuing(false);

    if (!data.success) {
      setError(data.message || "発行に失敗しました");
      return;
    }
    setNewCode(data.code);
  }

  // セッション復元処理が終わるまでは何も出さない(ログイン画面がちらつくのを防ぐ)
  if (!sessionLoaded) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  // 未ログイン: ログインコード入力画面
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-8"
        >
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3" style={{ backgroundColor: "#1a365d" }}>
              R
            </div>
            <h1 className="text-xl font-bold text-gray-900">スタッフログイン</h1>
            <p className="text-gray-500 text-sm mt-1">管理者から発行されたログインコードを入力してください</p>
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">ログインコード</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-center text-2xl tracking-widest font-mono"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={loggingIn || loginCode.length === 0}
            className="w-full py-3 text-white font-medium rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#1a365d" }}
          >
            {loggingIn ? "確認中..." : "ログイン"}
          </button>

          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => router.push("/call?role=staff")}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              この端末を共有応答用タブレットにする（ログイン不要）
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ログイン済み: ポータル画面
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg" style={{ backgroundColor: "#1a365d" }}>
            R
          </div>
          <h1 className="text-2xl font-bold text-gray-900">スタッフポータル</h1>
          <p className="text-gray-500 mt-1">{session.name} さんとしてログイン中</p>
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">
            ログアウト
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* プッシュ通知設定 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <h2 className="font-bold text-gray-900 mb-1">着信通知を有効にする</h2>
          <p className="text-gray-500 text-sm mb-4">
            有効にすると、このアプリを閉じていても来訪者が呼び出したときにスマホへ電話のような通知が届きます(Androidで安定動作。iPhoneは管理者にご相談ください)。
          </p>
          {pushStatus === "granted" ? (
            <div>
              <div className="flex items-center gap-2 text-green-700 font-medium mb-3">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                通知が有効になりました
              </div>
              <button
                onClick={handleDisablePush}
                className="w-full py-2 text-gray-500 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-sm"
              >
                通知を無効にする
              </button>
            </div>
          ) : pushStatus === "disabling" ? (
            <p className="text-gray-400 text-sm">無効にしています...</p>
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

        {/* 手動待機（通知が使えないときの補助オプション） */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <h2 className="font-bold text-gray-900 mb-1">手動で着信を待つ（補助）</h2>
          <p className="text-gray-500 text-sm mb-4">通知が使えない場合の代替手段です。この画面を開いたままにしておくと、直接指名の呼び出しに応答できます。</p>
          <button
            onClick={() => router.push(`/call?role=staff&staffId=${session.staffId}`)}
            className="w-full py-3 text-white font-medium rounded-xl transition-all hover:opacity-90"
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
                  onClick={() => {
                    navigator.clipboard.writeText(newCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`flex-1 py-2 font-medium text-sm rounded-lg transition-all ${
                    copied ? "bg-green-100 text-green-700" : "bg-blue-100 hover:bg-blue-200 text-blue-700"
                  }`}
                >
                  {copied ? "コピーしました ✓" : "コピー"}
                </button>
                <button
                  onClick={() => { setNewCode(null); setCopied(false); }}
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
