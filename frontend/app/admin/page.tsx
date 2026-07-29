"use client";

import Link from "next/link";

const QUICK_ACTIONS = [
  { href: "/admin/codes", label: "受付番号を発行", desc: "来訪者用の番号を生成", color: "#1a365d" },
  { href: "/admin/staff", label: "スタッフを登録", desc: "新しいスタッフを追加", color: "#0f766e" },
  { href: "/admin/logs", label: "来訪ログを見る", desc: "最近の来訪履歴を確認", color: "#7c3aed" },
];

export default function AdminDashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="text-gray-500 mt-1">受付システムの管理・設定を行います</p>
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-3 gap-6 mb-10">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all group"
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
              style={{ backgroundColor: action.color }}
            >
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 text-lg">{action.label}</h3>
            <p className="text-gray-500 text-sm mt-1">{action.desc}</p>
          </Link>
        ))}
      </div>

      {/* セットアップ状況 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-gray-900 text-lg mb-4">セットアップチェックリスト</h2>
        <div className="space-y-3">
          {[
            { label: "Supabaseプロジェクト作成", done: false, link: "https://supabase.com" },
            { label: "supabase/schema.sql の実行", done: false, hint: "Supabase > SQL Editor に貼り付けて実行" },
            { label: ".env.local に SUPABASE_URL / ANON_KEY を設定", done: false },
            { label: "VAPID鍵を生成して .env に設定（npx web-push generate-vapid-keys）", done: false },
            { label: "Sesame APIキーを backend/.env に設定", done: false },
            { label: "Renderにバックエンドをデプロイ", done: false },
            { label: "Vercelにフロントエンドをデプロイ", done: false },
          ].map((item, i) => (
            <div key={i} className="flex items-start space-x-3 py-2 border-b border-gray-50 last:border-0">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${item.done ? "bg-green-500 border-green-500" : "border-gray-300"}`}>
                {item.done && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
              <div>
                <p className={`text-sm font-medium ${item.done ? "text-gray-400 line-through" : "text-gray-700"}`}>{item.label}</p>
                {item.hint && <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
