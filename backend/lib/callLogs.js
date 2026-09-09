/**
 * 来訪ログ（visit_logs）の記録
 * 呼び出し開始→応答→終了→解錠という一連の流れを1行のログとして追跡する。
 * visitorSocketIdをキーに対応する visit_logs.id をメモリ上で覚えておき、
 * 各イベントのタイミングで該当行をUPDATEしていく
 */

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// visitorSocketId → visit_logs.id
const logIds = new Map();

// 呼び出し開始時にログ行を作成する
// targetStaffId: 指名呼び出しで「誰が呼ばれたか」（宛先）。応答したスタッフ(staff_id)とは別に記録する
async function startCallLog(visitorSocketId, { route, departmentId, targetStaffId, receptionCodeId }) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('visit_logs')
      .insert({
        route,
        department_id: departmentId || null,
        target_staff_id: targetStaffId || null,
        reception_code_id: receptionCodeId || null,
      })
      .select('id')
      .single();
    if (error) throw error;
    logIds.set(visitorSocketId, data.id);
  } catch (err) {
    console.error('来訪ログ作成エラー:', err.message);
  }
}

// 応答時に、応答したスタッフと通話開始時刻を記録する
async function markAnswered(visitorSocketId, staffId) {
  const id = logIds.get(visitorSocketId);
  if (!id) return;
  try {
    const supabase = getSupabase();
    const update = { call_started_at: new Date().toISOString() };
    if (staffId) update.staff_id = staffId;
    await supabase.from('visit_logs').update(update).eq('id', id);
  } catch (err) {
    console.error('来訪ログ更新エラー（応答）:', err.message);
  }
}

// 通話終了時に終了時刻を記録する（呼び出しがキャンセルされた場合も含む）
async function markEnded(visitorSocketId) {
  const id = logIds.get(visitorSocketId);
  if (!id) return;
  logIds.delete(visitorSocketId);
  try {
    const supabase = getSupabase();
    await supabase.from('visit_logs').update({ call_ended_at: new Date().toISOString() }).eq('id', id);
  } catch (err) {
    console.error('来訪ログ更新エラー（終了）:', err.message);
  }
}

// 解錠時に記録する
async function markUnlocked(visitorSocketId, staffId) {
  const id = logIds.get(visitorSocketId);
  if (!id) return;
  try {
    const supabase = getSupabase();
    await supabase
      .from('visit_logs')
      .update({ unlocked: true, unlocked_by: staffId || null })
      .eq('id', id);
  } catch (err) {
    console.error('来訪ログ更新エラー（解錠）:', err.message);
  }
}

module.exports = { startCallLog, markAnswered, markEnded, markUnlocked };
