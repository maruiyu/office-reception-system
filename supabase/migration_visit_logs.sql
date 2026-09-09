-- 来訪ログ機能を有効化するための追加SQL
-- Supabase管理画面 > SQL Editor に貼り付けて実行してください

-- route列の制約を拡張（'staff'指名・'any'担当者未指定を追加）
ALTER TABLE visit_logs DROP CONSTRAINT IF EXISTS visit_logs_route_check;
ALTER TABLE visit_logs ADD CONSTRAINT visit_logs_route_check
  CHECK (route IN ('code', 'staff', 'department', 'any'));

-- 管理画面（ログイン済み）から来訪ログを読めるようにする
DROP POLICY IF EXISTS "visit_logs_admin_read" ON visit_logs;
CREATE POLICY "visit_logs_admin_read"
  ON visit_logs FOR SELECT
  TO authenticated
  USING (true);
