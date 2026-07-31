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
    const { name, name_kana, email, department_id, role, slack_user_id } = req.body;

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
        slack_user_id: slack_user_id || null,
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
    const { name, name_kana, email, department_id, role, slack_user_id } = req.body;

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
        slack_user_id: slack_user_id || null,
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

// ログインコードを発行/再発行（管理画面から呼ばれる）
router.post('/:id/login-code', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    // 6桁の数字コードを生成し、重複していたら発行し直す
    let code;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      const { data: existing } = await supabase
        .from('staff')
        .select('id')
        .eq('login_code', code)
        .maybeSingle();
      if (!existing) break;
    }

    const { data, error } = await supabase
      .from('staff')
      .update({ login_code: code })
      .eq('id', id)
      .select('id, login_code')
      .single();

    if (error) throw error;

    res.json({ success: true, login_code: data.login_code });
  } catch (error) {
    console.error('ログインコード発行エラー:', error.message);
    res.status(500).json({ success: false, message: 'ログインコードの発行に失敗しました' });
  }
});

// スタッフポータルへのログイン（社員IDならぬログインコードで照合）
router.post('/login', async (req, res) => {
  try {
    const { loginCode } = req.body;
    if (!loginCode) {
      return res.status(400).json({ success: false, message: 'ログインコードを入力してください' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, department_id, role')
      .eq('login_code', loginCode)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(401).json({ success: false, message: 'コードが正しくありません' });
    }

    res.json({ success: true, staff: data });
  } catch (error) {
    console.error('スタッフログインエラー:', error.message);
    res.status(500).json({ success: false, message: 'ログインに失敗しました' });
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
