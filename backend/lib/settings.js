/**
 * システム設定の読み取り共通処理
 * エスカレーション判定（server.js）から使う
 */

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// エスカレーション関連の設定をまとめて取得（取得失敗時はデフォルト値）
async function getEscalationSettings() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['timeout_seconds', 'escalation_enabled']);

  if (error || !data) {
    return { enabled: true, timeoutSeconds: 30 };
  }

  const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
  return {
    enabled: map.escalation_enabled !== 'false',
    timeoutSeconds: Number(map.timeout_seconds) || 30,
  };
}

module.exports = { getEscalationSettings };
