/**
 * システム設定ルート
 * エスカレーション秒数などの設定を読み書きする
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

// 設定を保存・更新
router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'key と value は必須です' });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: String(value) });

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('設定保存エラー:', error.message);
    res.status(500).json({ success: false, message: '保存に失敗しました' });
  }
});

// 設定を取得
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, value: data?.value ?? null });
  } catch (error) {
    console.error('設定取得エラー:', error.message);
    res.status(500).json({ success: false, message: '取得に失敗しました' });
  }
});

module.exports = router;
