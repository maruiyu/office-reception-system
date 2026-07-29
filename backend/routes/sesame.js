/**
 * Sesame API 連携ルート
 * APIキーはサーバーサイドのみで使用し、フロントエンドには一切渡さない
 */

const express = require('express');
const router = express.Router();

const SESAME_BASE_URL = 'https://api.candyhouse.co/public';

// 共通ヘッダー
function sesameHeaders() {
  return {
    'Authorization': process.env.SESAME_API_KEY,
    'Content-Type': 'application/json',
  };
}

// 解錠API
router.post('/unlock', async (req, res) => {
  try {
    const deviceId = process.env.SESAME_DEVICE_ID;
    const response = await fetch(`${SESAME_BASE_URL}/sesame/${deviceId}`, {
      method: 'POST',
      headers: sesameHeaders(),
      body: JSON.stringify({ command: 'unlock' }),
    });

    if (!response.ok) {
      throw new Error(`Sesame API エラー: ${response.status}`);
    }

    const data = await response.json();
    res.json({ success: true, taskId: data.task_id });
  } catch (error) {
    console.error('解錠エラー:', error.message);
    res.status(500).json({ success: false, message: '解錠に失敗しました' });
  }
});

// 解錠結果確認API
router.get('/unlock-result/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const response = await fetch(
      `${SESAME_BASE_URL}/action-result?task_id=${taskId}`,
      { headers: sesameHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Sesame API エラー: ${response.status}`);
    }

    const data = await response.json();
    res.json({
      success: data.status === 'terminated' && data.successful,
      status: data.status,
    });
  } catch (error) {
    console.error('解錠結果確認エラー:', error.message);
    res.status(500).json({ success: false, message: '結果確認に失敗しました' });
  }
});

// 錠前ステータス確認API
router.get('/status', async (req, res) => {
  try {
    const deviceId = process.env.SESAME_DEVICE_ID;
    const response = await fetch(`${SESAME_BASE_URL}/sesame/${deviceId}`, {
      headers: sesameHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Sesame API エラー: ${response.status}`);
    }

    const data = await response.json();
    res.json({
      locked: data.locked,
      battery: data.battery,
      responsive: data.responsive,
    });
  } catch (error) {
    console.error('ステータス確認エラー:', error.message);
    res.status(500).json({ success: false, message: 'ステータス取得に失敗しました' });
  }
});

module.exports = router;
