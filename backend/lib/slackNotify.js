/**
 * Slack通知の共通ロジック
 * Web Pushが届きにくい端末（主にiPhone）向けの保険として、
 * SLACK_WEBHOOK_URL が設定されているスタッフにのみ送信する
 */

async function postToSlack(text) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return; // Slack未導入の環境では何もしない

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

// 特定スタッフ1人へSlackメンション通知
async function notifyStaffSlack(staff, { url } = {}) {
  if (!staff?.slack_user_id) return;
  await postToSlack(`<@${staff.slack_user_id}> 来訪者から呼び出しです\n${url}`);
}

// 部署内でSlack IDが設定されている全員へまとめて1通で通知
async function notifyDepartmentSlack(staffList, { url } = {}) {
  const mentions = (staffList || [])
    .filter((s) => s.slack_user_id)
    .map((s) => `<@${s.slack_user_id}>`);
  if (mentions.length === 0) return;
  await postToSlack(`${mentions.join(' ')} 部署宛に来訪者から呼び出しです\n${url}`);
}

// 担当者を指定しない呼び出し（配達業者など）で、Slack IDが設定されている全スタッフへまとめて1通で通知
async function notifyAllSlack(staffList, { url } = {}) {
  const mentions = (staffList || [])
    .filter((s) => s.slack_user_id)
    .map((s) => `<@${s.slack_user_id}>`);
  if (mentions.length === 0) return;
  await postToSlack(`${mentions.join(' ')} 担当者未指定で来訪者から呼び出しです\n${url}`);
}

module.exports = { notifyStaffSlack, notifyDepartmentSlack, notifyAllSlack };
