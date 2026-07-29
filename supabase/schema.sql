-- ============================================================
-- 受付システム Supabase テーブル定義
-- Supabase管理画面 > SQL Editor に貼り付けて実行してください
-- ============================================================

-- 部署テーブル
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- スタッフテーブル（Supabase Authと連携）
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_kana TEXT, -- フリガナ（カタカナ）。受付トップの五十音絞り込みに使用
  email TEXT UNIQUE NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  role TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  push_subscription JSONB, -- Web Push購読情報
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 受付番号テーブル
CREATE TABLE IF NOT EXISTS reception_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 4〜6桁の数字
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ, -- 使用済み日時（NULLなら未使用）
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 来訪ログテーブル
CREATE TABLE IF NOT EXISTS visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL CHECK (route IN ('code', 'department')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL, -- 応答したスタッフ
  reception_code_id UUID REFERENCES reception_codes(id) ON DELETE SET NULL,
  unlocked BOOLEAN DEFAULT false,
  unlocked_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- システム設定テーブル
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================
-- 初期データ
-- ============================================================

-- 初期設定値
INSERT INTO settings (key, value) VALUES
  ('timeout_seconds', '30'),        -- エスカレーションまでの待機秒数
  ('escalation_enabled', 'true')    -- エスカレーション有効/無効
ON CONFLICT (key) DO NOTHING;

-- サンプル部署データ
INSERT INTO departments (name) VALUES
  ('総務部'),
  ('営業部'),
  ('開発部'),
  ('人事部')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Row Level Security（RLS）設定
-- anon keyからの読み取りは受付番号照合のみ許可
-- それ以外はバックエンド（service key）経由で操作する
-- ============================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE reception_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 部署名一覧は来訪者画面から読める（anon可）
CREATE POLICY "departments_public_read"
  ON departments FOR SELECT
  USING (true);

-- スタッフ一覧は来訪者画面から名前だけ読める（anon可）
CREATE POLICY "staff_public_read"
  ON staff FOR SELECT
  USING (true);

-- 設定はバックエンド（service key）のみ読み書き可能
-- （anon は読めない）

-- ============================================================
-- インデックス（パフォーマンス最適化）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reception_codes_code ON reception_codes (code);
CREATE INDEX IF NOT EXISTS idx_reception_codes_staff ON reception_codes (staff_id);
CREATE INDEX IF NOT EXISTS idx_visit_logs_created ON visit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff (department_id);
