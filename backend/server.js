/**
 * バックエンドメインサーバー
 * Express + Socket.io で受付システムのリアルタイム通信を担当
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const sesameRoutes = require('./routes/sesame');
const codesRoutes = require('./routes/codes');
const pushRoutes = require('./routes/push');
const staffRoutes = require('./routes/staff');
const settingsRoutes = require('./routes/settings');
const pushNotify = require('./lib/pushNotify');
const slackNotify = require('./lib/slackNotify');
const callLogs = require('./lib/callLogs');
const { getEscalationSettings } = require('./lib/settings');
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const app = express();
const server = http.createServer(app);

// CORS設定（フロントエンドからのアクセスを許可。開発中はPCのlocalhostとスマホ用のLAN IPなど複数オリジンをカンマ区切りで指定できる）
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ルート登録
app.use('/api/sesame', sesameRoutes);
app.use('/api/codes', codesRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/settings', settingsRoutes);

// ヘルスチェック（Renderのスリープ防止用）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================================================
// Socket.io イベント処理
// =====================================================

// 接続中のソケットを管理するマップ
// staff_id → socket.id の対応を保持
const staffSockets = new Map();
// room_id → [socket.id, ...] の対応（部署呼び出し用）
const departmentRooms = new Map();
// エスカレーション待ちの通話を管理
// visitorSocketId → { timer, answered }
const pendingCalls = new Map();
// 応答があるまで着信プッシュ通知を繰り返し送る（電話の呼び出し音のように毎回鳴らすため）
// visitorSocketId → interval ID
const ringingIntervals = new Map();
// 応答前に来訪者がキャンセルした際、着信中の全員に呼び出し終了を伝えられるよう、
// 呼び出し開始時に通知した送信先（部屋名・個別socketId）を覚えておく
// visitorSocketId → string[]（io.to()に渡す宛先の配列）
const activeCallTargets = new Map();

const RING_INTERVAL_MS = 8000; // 再送間隔
const RING_MAX_COUNT = 8; // 安全のための最大再送回数（エスカレーション設定が無効でも無限に送り続けないように）

// 応答があるまでsendPushを繰り返し呼び出す（初回は呼び出し元で既に送信済みの前提）
function startRinging(visitorSocketId, sendPush) {
  let count = 0;
  const interval = setInterval(async () => {
    count += 1;
    if (count >= RING_MAX_COUNT) {
      stopRinging(visitorSocketId);
      return;
    }
    try {
      await sendPush();
    } catch (err) {
      console.error('再通知エラー:', err.message);
    }
  }, RING_INTERVAL_MS);

  ringingIntervals.set(visitorSocketId, interval);
}

function stopRinging(visitorSocketId) {
  const interval = ringingIntervals.get(visitorSocketId);
  if (interval) {
    clearInterval(interval);
    ringingIntervals.delete(visitorSocketId);
  }
}

// 応答がなければ管理者へエスカレーションする
async function scheduleEscalation(visitorSocketId) {
  let settings;
  try {
    settings = await getEscalationSettings();
  } catch (err) {
    console.error('設定取得エラー:', err.message);
    return;
  }
  if (!settings.enabled) return;

  const timer = setTimeout(async () => {
    const call = pendingCalls.get(visitorSocketId);
    if (!call || call.answered) return;
    pendingCalls.delete(visitorSocketId);
    stopRinging(visitorSocketId);

    console.log(`エスカレーション発生: visitorSocketId=${visitorSocketId}`);

    // 元々鳴っていた画面（担当者・部署・共有端末）を鳴りっぱなしにしないよう、いったん終了を伝える
    const originalTargets = activeCallTargets.get(visitorSocketId);
    if (originalTargets) {
      originalTargets.rooms.forEach((room) => io.to(room).emit('call:ended'));
      if (originalTargets.staffId) {
        const liveSocketId = staffSockets.get(originalTargets.staffId);
        if (liveSocketId) io.to(liveSocketId).emit('call:ended');
      }
    }
    // 以後のキャンセル通知は管理者宛に届くよう、通知先を管理者ルームに差し替える
    activeCallTargets.set(visitorSocketId, { rooms: ['admins'], staffId: null });

    io.to('admins').emit('call:incoming', {
      type: 'escalation',
      visitorSocketId,
    });
    io.to(visitorSocketId).emit('call:escalated');

    try {
      await pushNotify.notifyRole('admin', {
        title: '【転送】応答がありません',
        body: '担当者が応答しなかったため、管理者に転送されました',
        url: `/call?role=staff&visitorSocketId=${visitorSocketId}`,
      });
    } catch (err) {
      console.error('エスカレーション通知エラー:', err.message);
    }
  }, settings.timeoutSeconds * 1000);

  pendingCalls.set(visitorSocketId, { timer, answered: false });
}

io.on('connection', (socket) => {
  console.log(`クライアント接続: ${socket.id}`);

  // スタッフがログイン状態で接続したとき
  socket.on('staff:register', async ({ staffId, departmentId }) => {
    staffSockets.set(staffId, socket.id);
    // 部署のルームに参加
    if (departmentId) {
      socket.join(`dept:${departmentId}`);
    }
    // 担当者未指定の呼び出し（配達業者など）を受け取れるよう、全スタッフ共通のルームにも参加
    socket.join('all-staff');

    // 管理者であればエスカレーション先ルームにも参加
    try {
      const supabase = getSupabase();
      const { data } = await supabase.from('staff').select('role').eq('id', staffId).maybeSingle();
      if (data?.role === 'admin') {
        socket.join('admins');
      }
    } catch (err) {
      console.error('スタッフ権限確認エラー:', err.message);
    }

    console.log(`スタッフ登録: staffId=${staffId}, dept=${departmentId}`);
  });

  // 共有端末（受付に置く応答用タブレットなど）の登録
  // 特定のスタッフに紐付かないため、部署・指名・担当者未指定の呼び出しをすべて保険として受け取る
  socket.on('frontdesk:register', () => {
    socket.join('front-desk');
    socket.join('all-staff');
    console.log(`共有端末登録: socketId=${socket.id}`);
  });

  // 来訪者が受付番号/担当者指名で呼び出したとき
  socket.on('visitor:call-by-code', async ({ staffId, codeId, route }) => {
    // 来訪ログに1行作成する（応答・終了・解錠は後続イベントで同じ行を更新していく）
    callLogs.startCallLog(socket.id, {
      route: route === 'staff' ? 'staff' : 'code',
      targetStaffId: staffId,
      receptionCodeId: codeId,
    });

    // 共有端末（部署・指名・担当者未指定すべてを受け取る）で誰宛の呼び出しか分かるよう、
    // 通知を送る前に名前を解決しておく
    const supabase = getSupabase();
    let staff = null;
    try {
      const { data } = await supabase
        .from('staff')
        .select('name, slack_user_id')
        .eq('id', staffId)
        .maybeSingle();
      staff = data;
    } catch (err) {
      console.error('スタッフ情報取得エラー:', err.message);
    }

    const targetSocketId = staffSockets.get(staffId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:incoming', {
        type: 'code',
        visitorSocketId: socket.id,
        staffName: staff?.name,
      });
    }
    // 本人が気づかない場合の保険として、共有端末（受付タブレット）にも着信を知らせる
    io.to('front-desk').emit('call:incoming', {
      type: 'code',
      visitorSocketId: socket.id,
      staffName: staff?.name,
    });
    // targetSocketIdをそのまま覚えるのではなくstaffIdを覚えておく。
    // プッシュ通知経由でスタッフが後から接続してくることもあり、その場合キャンセル時点の
    // socket.idは呼び出し開始時点と異なるため、キャンセル時に最新の接続先を引き直す
    activeCallTargets.set(socket.id, { rooms: ['front-desk'], staffId: staffId || null });

    const relativeUrl = `/call?role=staff&staffId=${staffId}&visitorSocketId=${socket.id}`;

    // 担当者のスマホへプッシュ通知（Socket接続の有無に関わらず送る。
    // タップすると /call が visitorSocketId 付きで開き、そのまま応答できる）
    try {
      await pushNotify.notifyStaff(staffId, { url: relativeUrl });
    } catch (err) {
      console.error('プッシュ通知エラー:', err.message);
    }

    // Slack通知（Web Pushが届きにくい端末向けの保険。slack_user_id未設定なら何もしない）
    try {
      await slackNotify.notifyStaffSlack(staff, {
        url: `${process.env.FRONTEND_URL || ''}${relativeUrl}`,
      });
    } catch (err) {
      console.error('Slack通知エラー:', err.message);
    }

    startRinging(socket.id, () => pushNotify.notifyStaff(staffId, { url: relativeUrl }));
    scheduleEscalation(socket.id);
  });

  // 来訪者が部署を選択して呼び出したとき
  socket.on('visitor:call-by-department', async ({ departmentId }) => {
    callLogs.startCallLog(socket.id, { route: 'department', departmentId });

    // 共有端末で誰宛の呼び出しか分かるよう、通知を送る前に部署名を解決しておく
    const supabase = getSupabase();
    let department = null;
    try {
      const { data } = await supabase.from('departments').select('name').eq('id', departmentId).maybeSingle();
      department = data;
    } catch (err) {
      console.error('部署情報取得エラー:', err.message);
    }

    io.to(`dept:${departmentId}`).emit('call:incoming', {
      type: 'department',
      departmentId,
      departmentName: department?.name,
      visitorSocketId: socket.id,
    });
    // 共有端末（受付タブレット）にも保険として着信を知らせる
    io.to('front-desk').emit('call:incoming', {
      type: 'department',
      departmentId,
      departmentName: department?.name,
      visitorSocketId: socket.id,
    });
    activeCallTargets.set(socket.id, { rooms: [`dept:${departmentId}`, 'front-desk'], staffId: null });

    const relativeUrl = `/call?role=staff&departmentId=${departmentId}&visitorSocketId=${socket.id}`;

    try {
      await pushNotify.notifyDepartment(departmentId, {
        body: 'エントランスに来訪者が来ています（部署宛）',
        url: relativeUrl,
      });
    } catch (err) {
      console.error('部署プッシュ通知エラー:', err.message);
    }

    try {
      const { data: staffList } = await supabase
        .from('staff')
        .select('slack_user_id')
        .eq('department_id', departmentId)
        .not('slack_user_id', 'is', null);
      await slackNotify.notifyDepartmentSlack(staffList, {
        url: `${process.env.FRONTEND_URL || ''}${relativeUrl}`,
      });
    } catch (err) {
      console.error('部署Slack通知エラー:', err.message);
    }

    startRinging(socket.id, () =>
      pushNotify.notifyDepartment(departmentId, {
        body: 'エントランスに来訪者が来ています（部署宛）',
        url: relativeUrl,
      })
    );
    scheduleEscalation(socket.id);
  });

  // 来訪者が担当者を指定せず呼び出したとき（配達業者など誰が対応してもよい場合）
  socket.on('visitor:call-any', async () => {
    callLogs.startCallLog(socket.id, { route: 'any' });

    io.to('all-staff').emit('call:incoming', {
      type: 'any',
      visitorSocketId: socket.id,
    });
    activeCallTargets.set(socket.id, { rooms: ['all-staff'], staffId: null });

    const relativeUrl = `/call?role=staff&visitorSocketId=${socket.id}`;

    try {
      await pushNotify.notifyAll({
        body: 'エントランスに来訪者が来ています（担当者未指定）',
        url: relativeUrl,
      });
    } catch (err) {
      console.error('全体プッシュ通知エラー:', err.message);
    }

    try {
      const supabase = getSupabase();
      const { data: staffList } = await supabase
        .from('staff')
        .select('slack_user_id')
        .not('slack_user_id', 'is', null);
      await slackNotify.notifyAllSlack(staffList, {
        url: `${process.env.FRONTEND_URL || ''}${relativeUrl}`,
      });
    } catch (err) {
      console.error('全体Slack通知エラー:', err.message);
    }

    startRinging(socket.id, () =>
      pushNotify.notifyAll({
        body: 'エントランスに来訪者が来ています（担当者未指定）',
        url: relativeUrl,
      })
    );
    scheduleEscalation(socket.id);
  });

  // スタッフ（管理者へのエスカレーション含む）が応答したとき
  socket.on('staff:answer', ({ visitorSocketId, staffId }) => {
    const call = pendingCalls.get(visitorSocketId);
    if (call) {
      clearTimeout(call.timer);
      pendingCalls.delete(visitorSocketId);
    }
    stopRinging(visitorSocketId);
    activeCallTargets.delete(visitorSocketId);
    callLogs.markAnswered(visitorSocketId, staffId);

    io.to(visitorSocketId).emit('call:answered', {
      staffSocketId: socket.id,
    });
  });

  // 来訪者が応答される前に呼び出しをキャンセルしたとき
  // 着信中の全員（指名先・部署ルーム・共有端末など）に呼び出し終了を伝える
  socket.on('visitor:call-cancel', () => {
    const info = activeCallTargets.get(socket.id);
    if (info) {
      info.rooms.forEach((room) => io.to(room).emit('call:ended'));
      // staffIdの場合は、呼び出し開始後にプッシュ通知経由で接続してきたケースもあるため
      // キャンセル時点の最新のsocket.idを引き直して送る
      if (info.staffId) {
        const liveSocketId = staffSockets.get(info.staffId);
        if (liveSocketId) io.to(liveSocketId).emit('call:ended');
      }
      activeCallTargets.delete(socket.id);
    }

    const call = pendingCalls.get(socket.id);
    if (call) {
      clearTimeout(call.timer);
      pendingCalls.delete(socket.id);
    }
    stopRinging(socket.id);
    callLogs.markEnded(socket.id);
  });

  // WebRTC シグナリング（オファー/アンサー/ICE候補）
  socket.on('webrtc:offer', ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit('webrtc:offer', {
      fromSocketId: socket.id,
      offer,
    });
  });

  socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('webrtc:answer', {
      fromSocketId: socket.id,
      answer,
    });
  });

  socket.on('webrtc:ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc:ice-candidate', {
      fromSocketId: socket.id,
      candidate,
    });
  });

  // 通話終了（スタッフ or 来訪者どちらかが終了したとき）
  socket.on('call:end', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('call:ended');
    // どちらが来訪者か判定せず両方試す（該当しない方はMapに無いので何も起きない）
    callLogs.markEnded(socket.id);
    callLogs.markEnded(targetSocketId);
  });

  // 切断時にスタッフマップから削除
  socket.on('disconnect', () => {
    for (const [staffId, sockId] of staffSockets.entries()) {
      if (sockId === socket.id) {
        staffSockets.delete(staffId);
        break;
      }
    }

    // 来訪者が離脱した場合、エスカレーションタイマーも解除する
    const call = pendingCalls.get(socket.id);
    if (call) {
      clearTimeout(call.timer);
      pendingCalls.delete(socket.id);
    }
    stopRinging(socket.id);
    activeCallTargets.delete(socket.id);
    // 来訪者が応答前に切断した場合の保険。応答後の切断は通常call:endで既に記録済みのため無害
    callLogs.markEnded(socket.id);

    console.log(`クライアント切断: ${socket.id}`);
  });
});

// サーバー起動
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`バックエンドサーバー起動: http://localhost:${PORT}`);
});
