"use client";

import { useState, useEffect } from "react";
import { supabase, Staff, Department } from "@/lib/supabase";

export default function StaffAdmin() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", name_kana: "", email: "", department_id: "", role: "staff" as "admin" | "staff", slack_user_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [issuingCodeFor, setIssuingCodeFor] = useState<string | null>(null);

  // 既存スタッフの編集を開始する
  function handleEdit(staff: Staff) {
    setEditingId(staff.id);
    setForm({
      name: staff.name,
      name_kana: staff.name_kana || "",
      email: staff.email,
      department_id: staff.department_id || "",
      role: staff.role,
      slack_user_id: staff.slack_user_id || "",
    });
    setError("");
    setShowForm(true);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError("");
    setForm({ name: "", name_kana: "", email: "", department_id: "", role: "staff", slack_user_id: "" });
  }

  // ログインコードを発行/再発行（スタッフポータルへのログインに使う）
  async function handleIssueLoginCode(id: string) {
    setIssuingCodeFor(id);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    await fetch(`${backendUrl}/api/staff/${id}/login-code`, { method: "POST" });
    setIssuingCodeFor(null);
    loadData();
  }

  // スタッフIDをクリップボードにコピー（スタッフポータルの待機画面で使うため）
  function handleCopyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: staff }, { data: depts }] = await Promise.all([
      supabase.from("staff").select("*, department:department_id(id, name)").order("name"),
      supabase.from("departments").select("*").order("name"),
    ]);
    setStaffList(staff || []);
    setDepartments(depts || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name || !form.email) {
      setError("氏名とメールは必須です");
      return;
    }
    if (!form.name_kana) {
      setError("フリガナは必須です（受付トップの五十音検索に使われます）");
      return;
    }
    if (!/^[ァ-ヶーヴ\s　]+$/.test(form.name_kana)) {
      setError("フリガナはカタカナで入力してください（例: ヤマダ タロウ）");
      return;
    }
    setSaving(true);
    setError("");
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    // スタッフ登録・更新はバックエンド経由（service keyが必要なため）
    const res = await fetch(
      editingId ? `${backendUrl}/api/staff/${editingId}` : `${backendUrl}/api/staff`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }
    );
    const data = await res.json();
    setSaving(false);
    if (!data.success) {
      setError(data.message || "保存に失敗しました");
      return;
    }
    handleCancelForm();
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("このスタッフを削除しますか？")) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
    await fetch(`${backendUrl}/api/staff/${id}`, { method: "DELETE" });
    loadData();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">スタッフ管理</h1>
          <p className="text-gray-500 mt-1">スタッフの登録・編集・削除</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setShowForm(true); }}
          className="px-5 py-2.5 text-white font-medium rounded-xl transition-all hover:opacity-90"
          style={{ backgroundColor: "#1a365d" }}
        >
          ＋ スタッフを追加
        </button>
      </div>

      {/* 登録・編集フォーム */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">{editingId ? "スタッフ編集" : "新規スタッフ登録"}</h2>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">氏名 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm"
                placeholder="山田 太郎"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">フリガナ（カタカナ） *</label>
              <input
                type="text"
                value={form.name_kana}
                onChange={(e) => setForm({ ...form, name_kana: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm"
                placeholder="ヤマダ タロウ"
              />
              <p className="text-xs text-gray-400 mt-1">受付トップの五十音絞り込みに使われます</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm"
                placeholder="yamada@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">部署</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm bg-white"
              >
                <option value="">未設定</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "staff" })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm bg-white"
              >
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slack ID（任意）</label>
              <input
                type="text"
                value={form.slack_user_id}
                onChange={(e) => setForm({ ...form, slack_user_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm font-mono"
                placeholder="U0123ABC456"
              />
              <p className="text-xs text-gray-400 mt-1">iPhoneなどWeb Push通知が届きにくい場合の保険。SlackプロフィールのメンバーIDを入力</p>
            </div>
          </div>
          <div className="flex space-x-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-white font-medium rounded-lg text-sm transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#1a365d" }}
            >
              {saving ? "保存中..." : "保存する"}
            </button>
            <button
              onClick={handleCancelForm}
              className="px-5 py-2 text-gray-600 font-medium rounded-lg text-sm bg-gray-100 hover:bg-gray-200 transition-all"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* スタッフ一覧 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">読み込み中...</div>
        ) : staffList.length === 0 ? (
          <div className="p-8 text-center text-gray-400">スタッフが登録されていません</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">氏名</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">メール</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">部署</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">権限</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">通知</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">ログインコード</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">スタッフID</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((staff) => (
                <tr key={staff.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {staff.name}
                    <span className="block text-xs font-normal text-gray-400">{staff.name_kana || "（フリガナ未設定）"}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{staff.email}</td>
                  <td className="px-6 py-4 text-gray-500">{(staff.department as Department)?.name || "未設定"}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${staff.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                      {staff.role === "admin" ? "管理者" : "スタッフ"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${staff.push_subscription ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {staff.push_subscription ? "登録済み" : "未登録"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {staff.login_code && (
                        <span className="font-mono text-xs bg-gray-50 px-2 py-1 rounded-lg">{staff.login_code}</span>
                      )}
                      <button
                        onClick={() => handleIssueLoginCode(staff.id)}
                        disabled={issuingCodeFor === staff.id}
                        className="text-xs text-[#1a365d] hover:underline disabled:opacity-50"
                      >
                        {issuingCodeFor === staff.id ? "発行中..." : staff.login_code ? "再発行" : "発行"}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleCopyId(staff.id)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors font-mono text-xs text-gray-500"
                      title={staff.id}
                    >
                      {staff.id.slice(0, 8)}...
                      <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copiedId === staff.id && <span className="text-green-600">コピー済み</span>}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(staff)} className="text-gray-500 hover:text-[#1a365d] text-xs font-medium transition-colors mr-4">
                      編集
                    </button>
                    <button onClick={() => handleDelete(staff.id)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
