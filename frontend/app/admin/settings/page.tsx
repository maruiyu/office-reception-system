"use client";

import { useState, useEffect } from "react";

export default function SettingsAdmin() {
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [escalationEnabled, setEscalationEnabled] = useState(true);
  const [sesameStatus, setSesameStatus] = useState<{ locked?: boolean; battery?: number; responsive?: boolean } | null>(null);
  const [checkingLock, setCheckingLock] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [saved, setSaved] = useState(false);

  // 保存済みの設定値を読み込む
  useEffect(() => {
    async function loadSettings() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
      const [timeoutRes, escalationRes] = await Promise.all([
        fetch(`${backendUrl}/api/settings/timeout_seconds`).then((r) => r.json()),
        fetch(`${backendUrl}/api/settings/escalation_enabled`).then((r) => r.json()),
      ]);
      if (timeoutRes.value !== null && timeoutRes.value !== undefined) {
        setTimeoutSeconds(Number(timeoutRes.value));
      }
      if (escalationRes.value !== null && escalationRes.value !== undefined) {
        setEscalationEnabled(escalationRes.value === "true");
      }
    }
    loadSettings();
  }, []);

  async function handleSaveTimeout() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    await fetch(`${backendUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "timeout_seconds", value: String(timeoutSeconds) }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleToggleEscalation() {
    const next = !escalationEnabled;
    setEscalationEnabled(next);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    await fetch(`${backendUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "escalation_enabled", value: String(next) }),
    });
  }

  async function checkLockStatus() {
    setCheckingLock(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/sesame/status`);
    const data = await res.json();
    setSesameStatus(data);
    setCheckingLock(false);
  }

  async function handleManualUnlock() {
    if (!confirm("手動で電気錠を解錠しますか？")) return;
    setUnlocking(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/sesame/unlock`, { method: "POST" });
    const data = await res.json();
    setUnlocking(false);
    alert(data.success ? "解錠しました" : "解錠に失敗しました");
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">システム設定</h1>
        <p className="text-gray-500 mt-1">エスカレーションや解錠の設定を管理します</p>
      </div>

      {/* エスカレーション設定 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-1">エスカレーション設定</h2>
        <p className="text-gray-500 text-sm mb-4">担当者が応答しない場合に管理者へ転送するまでの待機時間</p>

        <div className="flex items-center justify-between py-3 border-b border-gray-100 mb-4">
          <div>
            <p className="text-sm font-medium text-gray-700">エスカレーションを有効にする</p>
            <p className="text-xs text-gray-400 mt-0.5">OFFにすると、応答がなくても管理者へは転送されません</p>
          </div>
          <button
            onClick={handleToggleEscalation}
            className={`relative w-12 h-7 rounded-full transition-colors ${escalationEnabled ? "" : "bg-gray-200"}`}
            style={escalationEnabled ? { backgroundColor: "#1a365d" } : {}}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${escalationEnabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>

        <div className={`flex items-center gap-4 ${escalationEnabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={120}
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-center font-bold text-lg"
            />
            <span className="text-gray-500 font-medium">秒</span>
          </div>
          <button
            onClick={handleSaveTimeout}
            className="px-5 py-2 text-white font-medium rounded-lg text-sm transition-all hover:opacity-90"
            style={{ backgroundColor: "#1a365d" }}
          >
            {saved ? "保存しました ✓" : "保存する"}
          </button>
        </div>
      </div>

      {/* Sesame 電気錠管理 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 mb-1">電気錠（Sesame）</h2>
        <p className="text-gray-500 text-sm mb-4">Sesame スマートロックの状態確認・手動解錠</p>

        {sesameStatus && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl flex gap-6 text-sm">
            <div>
              <span className="text-gray-400 block">状態</span>
              <span className={`font-bold ${sesameStatus.locked ? "text-red-600" : "text-green-600"}`}>
                {sesameStatus.locked ? "🔒 施錠中" : "🔓 解錠中"}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block">バッテリー</span>
              <span className="font-bold text-gray-700">{sesameStatus.battery ?? "—"}%</span>
            </div>
            <div>
              <span className="text-gray-400 block">通信</span>
              <span className={`font-bold ${sesameStatus.responsive ? "text-green-600" : "text-red-600"}`}>
                {sesameStatus.responsive ? "正常" : "通信不可"}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={checkLockStatus}
            disabled={checkingLock}
            className="px-5 py-2 text-gray-700 font-medium rounded-lg text-sm bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            {checkingLock ? "確認中..." : "状態を確認"}
          </button>
          <button
            onClick={handleManualUnlock}
            disabled={unlocking}
            className="px-5 py-2 text-white font-medium rounded-lg text-sm transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1e40af 0%, #1a365d 100%)" }}
          >
            {unlocking ? "解錠中..." : "手動で解錠"}
          </button>
        </div>
      </div>
    </div>
  );
}
