/**
 * 受付番号（reception_codes）関連ルート
 * 番号の発行・照合・無効化を担当
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

// 4〜6桁のランダム数字を生成
function generateCode() {
  const digits = Math.floor(Math.random() * 3) + 4; // 4〜6桁
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

// 受付番号を発行（スタッフ/管理者が呼び出す）
router.post('/issue', async (req, res) => {
  try {
    const { staffId, expiresInMinutes = 480 } = req.body; // デフォルト8時間

    if (!staffId) {
      return res.status(400).json({ success: false, message: 'staffId は必須です' });
    }

    const supabase = getSupabase();
    let code;
    let attempts = 0;

    // 重複しない番号が見つかるまで最大5回試みる
    while (attempts < 5) {
      code = generateCode();
      const { data } = await supabase
        .from('reception_codes')
        .select('id')
        .eq('code', code)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!data) break; // 重複なし
      attempts++;
    }

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const { data, error } = await supabase
      .from('reception_codes')
      .insert({ code, staff_id: staffId, expires_at: expiresAt.toISOString() })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, code: data.code, expiresAt: data.expires_at });
  } catch (error) {
    console.error('受付番号発行エラー:', error.message);
    res.status(500).json({ success: false, message: '番号発行に失敗しました' });
  }
});

// 受付番号を照合して担当者を返す（来訪者が入力したとき）
router.post('/verify', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'code は必須です' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('reception_codes')
      .select(`
        id,
        code,
        expires_at,
        used_at,
        staff:staff_id (
          id,
          name,
          department:department_id (
            id,
            name
          )
        )
      `)
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, message: '番号が見つかりません' });
    }

    if (data.used_at) {
      return res.status(410).json({ success: false, message: 'この番号はすでに使用済みです' });
    }

    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).json({ success: false, message: 'この番号は期限切れです' });
    }

    res.json({
      success: true,
      codeId: data.id,
      staff: data.staff,
    });
  } catch (error) {
    console.error('番号照合エラー:', error.message);
    res.status(500).json({ success: false, message: '照合に失敗しました' });
  }
});

// 受付番号を使用済みにする（通話開始後に呼び出す）
router.patch('/:codeId/use', async (req, res) => {
  try {
    const { codeId } = req.params;
    const supabase = getSupabase();

    const { error } = await supabase
      .from('reception_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', codeId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('番号使用済み更新エラー:', error.message);
    res.status(500).json({ success: false, message: '更新に失敗しました' });
  }
});

module.exports = router;
