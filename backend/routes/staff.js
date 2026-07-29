/**
 * スタッフ管理ルート
 * スタッフの登録・削除（service keyが必要なため、バックエンド経由）
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// スタッフ登録
router.post('/', async (req, res) => {
  try {
    const { name, name_kana, email, department_id, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: '氏名とメールは必須です' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('staff')
      .insert({
        name,
        name_kana: name_kana || null,
        email,
        department_id: department_id || null,
        role: role || 'staff',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, staff: data });
  } catch (error) {
    console.error('スタッフ登録エラー:', error.message);
    res.status(500).json({ success: false, message: '登録に失敗しました' });
  }
});

// スタッフ更新
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, name_kana, email, department_id, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: '氏名とメールは必須です' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('staff')
      .update({
        name,
        name_kana: name_kana || null,
        email,
        department_id: department_id || null,
        role: role || 'staff',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, staff: data });
  } catch (error) {
    console.error('スタッフ更新エラー:', error.message);
    res.status(500).json({ success: false, message: '更新に失敗しました' });
  }
});

// スタッフ削除
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const { error } = await supabase.from('staff').delete().eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('スタッフ削除エラー:', error.message);
    res.status(500).json({ success: false, message: '削除に失敗しました' });
  }
});

module.exports = router;
