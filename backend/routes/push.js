/**
 * Web Push 通知ルート
 * スタッフのデバイスにプッシュ通知を送信する
 */

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// VAPID設定（サーバー起動時に一度だけ実行）
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// プッシュ購読を登録・更新（スタッフがブラウザで許可したとき）
router.post('/subscribe', async (req, res) => {
  try {
    const { staffId, subscription } = req.body;

    if (!staffId || !subscription) {
      return res.status(400).json({ success: false, message: 'staffId と subscription は必須です' });
    }

    const supabase = getSupabase();
    const { error } = await supabase
      .from('staff')
      .update({ push_subscription: subscription })
      .eq('id', staffId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('購読登録エラー:', error.message);
    res.status(500).json({ success: false, message: '購読登録に失敗しました' });
  }
});

// 特定スタッフに通知を送信
router.post('/notify/:staffId', async (req, res) => {
  try {
    const { staffId } = req.params;
    const { title, body, url } = req.body;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('staff')
      .select('push_subscription')
      .eq('id', staffId)
      .single();

    if (error || !data?.push_subscription) {
      return res.status(404).json({ success: false, message: '購読情報が見つかりません' });
    }

    const payload = JSON.stringify({
      title: title || '来訪者があります',
      body: body || 'エントランスに来訪者が来ています',
      url: url || '/call',
      requireInteraction: true, // 自動消えない通知
    });

    await webpush.sendNotification(data.push_subscription, payload);
    res.json({ success: true });
  } catch (error) {
    console.error('通知送信エラー:', error.message);
    res.status(500).json({ success: false, message: '通知送信に失敗しました' });
  }
});

// 部署全員に通知を送信
router.post('/notify-department/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { title, body, url } = req.body;

    const supabase = getSupabase();
    const { data: staffList, error } = await supabase
      .from('staff')
      .select('id, push_subscription')
      .eq('department_id', departmentId)
      .not('push_subscription', 'is', null);

    if (error) throw error;

    const payload = JSON.stringify({
      title: title || '来訪者があります',
      body: body || 'エントランスに来訪者が来ています（部署宛）',
      url: url || '/call',
      requireInteraction: true,
    });

    // 全スタッフへ並列送信（一部失敗しても続行）
    const results = await Promise.allSettled(
      staffList.map((staff) =>
        webpush.sendNotification(staff.push_subscription, payload)
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    res.json({ success: true, sent, total: staffList.length });
  } catch (error) {
    console.error('部署通知エラー:', error.message);
    res.status(500).json({ success: false, message: '部署通知に失敗しました' });
  }
});

module.exports = router;
