/**
 * Supabaseクライアント（フロントエンド用）
 * anon keyを使用 - 読み取り専用操作のみ行うこと
 * 書き込みが必要な操作はバックエンド経由で行う
 */

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// createBrowserClient はセッションをCookieに保存するため、
// middleware（サーバー側）でもログイン状態を判定できる
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// データベース型定義
export type Department = {
  id: string;
  name: string;
  created_at: string;
};

export type Staff = {
  id: string;
  name: string;
  name_kana: string | null;
  email: string;
  department_id: string;
  role: "admin" | "staff";
  push_subscription: object | null;
  created_at: string;
  department?: Department;
};

export type ReceptionCode = {
  id: string;
  code: string;
  staff_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  staff?: Staff;
};

export type VisitLog = {
  id: string;
  route: "code" | "department";
  department_id: string | null;
  staff_id: string | null;
  reception_code_id: string | null;
  unlocked: boolean;
  unlocked_by: string | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  created_at: string;
};
