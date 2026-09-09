-- 「誰が呼ばれたか（宛先）」を記録する列を追加
-- Supabase管理画面 > SQL Editor に貼り付けて実行してください

ALTER TABLE visit_logs ADD COLUMN IF NOT EXISTS target_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL;
COMMENT ON COLUMN visit_logs.target_staff_id IS '指名呼び出しの宛先（誰が呼ばれたか）';
COMMENT ON COLUMN visit_logs.staff_id IS '応答したスタッフ（誰が応答したか。共有端末が応答した場合はNULL）';
