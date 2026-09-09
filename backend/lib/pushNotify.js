/**
 * Web Push 送信の共通ロジック
 * routes/push.js（HTTP経由の手動送信）と server.js（Socket.ioの着信時に自動送信）の両方から使う
 */

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

function buildPayload({ title, body, url } = {}) {
  return JSON.stringify({
    title: title || '来訪者があります',
    body: body || 'エントランスに来訪者が来ています',
    url: url || '/call',
    requireInteraction: true,
  });
}

// 特定スタッフのデバイスへプッシュ通知を送る
async function notifyStaff(staffId, options = {}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('staff')
    .select('push_subscription')
    .eq('id', staffId)
    .single();

  if (error || !data?.push_subscription) return { sent: 0 };

  try {
    await webpush.sendNotification(data.push_subscription, buildPayload(options));
    return { sent: 1 };
  } catch (err) {
    console.error(`プッシュ送信失敗 staffId=${staffId}:`, err.message);
    return { sent: 0 };
  }
}

// 部署に所属する全スタッフのデバイスへプッシュ通知を送る
async function notifyDepartment(departmentId, options = {}) {
  const supabase = getSupabase();
  const { data: staffList, error } = await supabase
    .from('staff')
    .select('id, push_subscription')
    .eq('department_id', departmentId)
    .not('push_subscription', 'is', null);

  if (error || !staffList) return { sent: 0 };

  const payload = buildPayload(options);
  const results = await Promise.allSettled(
    staffList.map((s) => webpush.sendNotification(s.push_subscription, payload))
  );

  return { sent: results.filter((r) => r.status === 'fulfilled').length };
}

// 特定ロール（admin等）の全スタッフへプッシュ通知を送る
async function notifyRole(role, options = {}) {
  const supabase = getSupabase();
  const { data: staffList, error } = await supabase
    .from('staff')
    .select('id, push_subscription')
    .eq('role', role)
    .not('push_subscription', 'is', null);

  if (error || !staffList) return { sent: 0 };

  const payload = buildPayload(options);
  const results = await Promise.allSettled(
    staffList.map((s) => webpush.sendNotification(s.push_subscription, payload))
  );

  return { sent: results.filter((r) => r.status === 'fulfilled').length };
}

// 担当者を指定しない呼び出し（配達業者など）向けに、全スタッフのデバイスへプッシュ通知を送る
async function notifyAll(options = {}) {
  const supabase = getSupabase();
  const { data: staffList, error } = await supabase
    .from('staff')
    .select('id, push_subscription')
    .not('push_subscription', 'is', null);

  if (error || !staffList) return { sent: 0 };

  const payload = buildPayload(options);
  const results = await Promise.allSettled(
    staffList.map((s) => webpush.sendNotification(s.push_subscription, payload))
  );

  return { sent: results.filter((r) => r.status === 'fulfilled').length };
}

module.exports = { notifyStaff, notifyDepartment, notifyRole, notifyAll };
