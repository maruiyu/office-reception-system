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

  // 来訪者が受付番号/担当者指名で呼び出したとき
  socket.on('visitor:call-by-code', async ({ staffId }) => {
    const targetSocketId = staffSockets.get(staffId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:incoming', {
        type: 'code',
        visitorSocketId: socket.id,
      });
    }

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
      const supabase = getSupabase();
      const { data: staff } = await supabase
        .from('staff')
        .select('slack_user_id')
        .eq('id', staffId)
        .maybeSingle();
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
    io.to(`dept:${departmentId}`).emit('call:incoming', {
      type: 'department',
      departmentId,
      visitorSocketId: socket.id,
    });

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
      const supabase = getSupabase();
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

  // スタッフ（管理者へのエスカレーション含む）が応答したとき
  socket.on('staff:answer', ({ visitorSocketId }) => {
    const call = pendingCalls.get(visitorSocketId);
    if (call) {
      clearTimeout(call.timer);
      pendingCalls.delete(visitorSocketId);
    }
    stopRinging(visitorSocketId);

    io.to(visitorSocketId).emit('call:answered', {
      staffSocketId: socket.id,
    });
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

    console.log(`クライアント切断: ${socket.id}`);
  });
});

// サーバー起動
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`バックエンドサーバー起動: http://localhost:${PORT}`);
});
