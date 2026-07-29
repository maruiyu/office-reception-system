"use client";

import { useState, useEffect } from "react";
import { supabase, Staff, ReceptionCode } from "@/lib/supabase";

export default function CodesAdmin() {
  const [codes, setCodes] = useState<ReceptionCode[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(8);
  const [issuing, setIssuing] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: codeData }, { data: staffData }] = await Promise.all([
      supabase
        .from("reception_codes")
        .select("*, staff:staff_id(id, name)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("staff").select("id, name").order("name"),
    ]);
    setCodes((codeData || []) as ReceptionCode[]);
    setStaffList((staffData || []) as Staff[]);
    setLoading(false);
  }

  async function handleIssue() {
    if (!selectedStaffId) {
      setError("担当者を選択してください");
      return;
    }
    setIssuing(true);
    setError("");
    setNewCode(null);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/codes/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staffId: selectedStaffId,
        expiresInMinutes: expiresInHours * 60,
      }),
    });
    const data = await res.json();
    setIssuing(false);

    if (!data.success) {
      setError(data.message || "発行に失敗しました");
      return;
    }

    setNewCode(data.code);
    loadData();
  }

  function statusLabel(code: ReceptionCode) {
    if (code.used_at) return { text: "使用済み", cls: "bg-gray-100 text-gray-400" };
    if (new Date(code.expires_at) < new Date()) return { text: "期限切れ", cls: "bg-red-100 text-red-500" };
    return { text: "有効", cls: "bg-green-100 text-green-700" };
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">受付番号発行</h1>
        <p className="text-gray-500 mt-1">来訪者用の受付番号（4〜6桁）を発行します</p>
      </div>

      {/* 発行フォーム */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">新しい番号を発行</h2>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">担当者 *</label>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm bg-white"
            >
              <option value="">担当者を選択...</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="w-48">
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
              <option value={72}>3日間</option>
            </select>
          </div>
          <button
            onClick={handleIssue}
            disabled={issuing}
            className="px-6 py-2 text-white font-medium rounded-lg text-sm transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#1a365d" }}
          >
            {issuing ? "発行中..." : "番号を発行"}
          </button>
        </div>

        {/* 発行完了 */}
        {newCode && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 font-medium mb-1">受付番号が発行されました</p>
              <p className="text-4xl font-black tracking-widest text-green-800">{newCode}</p>
              <p className="text-xs text-green-600 mt-1">来訪者にこの番号をメールや電話で伝えてください</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(newCode)}
              className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 font-medium text-sm rounded-lg transition-all"
            >
              コピー
            </button>
          </div>
        )}
      </div>

      {/* 発行済み番号一覧 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">発行履歴</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">読み込み中...</div>
        ) : codes.length === 0 ? (
          <div className="p-8 text-center text-gray-400">発行済みの番号がありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">番号</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">担当者</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">有効期限</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">状態</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const status = statusLabel(code);
                return (
                  <tr key={code.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-gray-900 text-lg tracking-widest">{code.code}</td>
                    <td className="px-6 py-4 text-gray-600">{(code.staff as Staff)?.name || "—"}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(code.expires_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
