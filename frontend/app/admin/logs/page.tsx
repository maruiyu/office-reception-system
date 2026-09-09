"use client";

import { useState, useEffect } from "react";
import { supabase, VisitLog } from "@/lib/supabase";

export default function LogsAdmin() {
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from("visit_logs")
      .select(`
        *,
        department:department_id(name),
        target_staff:target_staff_id(name),
        staff:staff_id(name)
      `)
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data || []) as VisitLog[]);
    setLoading(false);
  }

  // 「誰が呼ばれたか（宛先）」を呼び出し方法に応じて表示する
  function targetLabel(log: VisitLog) {
    const joined = log as unknown as { department?: { name: string }; target_staff?: { name: string } };
    if (log.route === "department") return joined.department?.name || "—";
    if (log.route === "any") return "誰でも";
    return joined.target_staff?.name || "—";
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">来訪ログ</h1>
        <p className="text-gray-500 mt-1">最近100件の来訪記録を表示します</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">来訪ログがありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">日時</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">呼び出し方法</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">宛先</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">応答者</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">通話時間</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">解錠</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const duration = log.call_started_at && log.call_ended_at
                  ? Math.round((new Date(log.call_ended_at).getTime() - new Date(log.call_started_at).getTime()) / 1000)
                  : null;
                return (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.route === "code"
                            ? "bg-blue-100 text-blue-700"
                            : log.route === "staff"
                              ? "bg-purple-100 text-purple-700"
                              : log.route === "department"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {log.route === "code"
                          ? "受付番号"
                          : log.route === "staff"
                            ? "指名"
                            : log.route === "department"
                              ? "部署指定"
                              : "担当者未指定"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {targetLabel(log)}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {(log as unknown as { staff?: { name: string } }).staff?.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {duration !== null ? `${duration}秒` : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.unlocked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {log.unlocked ? "解錠済み" : "未解錠"}
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
