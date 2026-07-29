"use client";

import { useState, useEffect } from "react";
import { supabase, Department } from "@/lib/supabase";

export default function DepartmentsAdmin() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from("departments").select("*").order("name");
    setDepartments(data || []);
    setLoading(false);
  }

  async function handleAdd() {
    if (!newName.trim()) { setError("部署名を入力してください"); return; }
    setSaving(true);
    const { error: err } = await supabase.from("departments").insert({ name: newName.trim() });
    setSaving(false);
    if (err) { setError("登録に失敗しました"); return; }
    setNewName("");
    setError("");
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("この部署を削除しますか？所属スタッフの部署設定が外れます。")) return;
    await supabase.from("departments").delete().eq("id", id);
    loadData();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">部署管理</h1>
        <p className="text-gray-500 mt-1">受付画面に表示する部署を管理します</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">部署を追加</h2>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="部署名（例: 営業部）"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a365d] text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-5 py-2 text-white font-medium rounded-lg text-sm transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#1a365d" }}
          >
            {saving ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">読み込み中...</div>
        ) : departments.length === 0 ? (
          <div className="p-8 text-center text-gray-400">部署が登録されていません</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {departments.map((dept) => (
              <li key={dept.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                <span className="font-medium text-gray-900">{dept.name}</span>
                <button onClick={() => handleDelete(dept.id)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
