# 受付アプリ開発ガイド（Claude Code 向け）

オフィス向け無人受付システム。
来訪者がエントランスタブレットを操作 → 担当者スマホにビデオ着信 → 顔確認して電気錠解錠。。

---

## ディレクトリ構成

```
extension-system/
├── frontend/          # Next.js 16（Vercel にデプロイ）
│   ├── app/
│   │   ├── page.tsx          # 受付トップ画面（来訪者用）
│   │   ├── call/page.tsx     # 応答画面（スタッフ用）
│   │   ├── admin/            # 管理画面（スタッフ/部署/番号/ログ/設定）
│   │   └── staff/page.tsx    # スタッフポータル（番号発行・プッシュ登録）
│   ├── lib/
│   │   ├── supabase.ts       # Supabase クライアント＋型定義
│   │   ├── socket.ts         # Socket.io シングルトン
│   │   └── webrtc.ts         # WebRTC P2P 通話マネージャー
│   └── public/
│       ├── manifest.json     # PWA 設定
│       └── sw.js             # Service Worker（プッシュ通知処理）
│
├── backend/           # Node.js + Express（Render にデプロイ）
│   ├── server.js             # メインサーバー（Socket.io シグナリング含む）
│   └── routes/
│       ├── sesame.js         # Sesame API 解錠・ステータス確認
│       ├── codes.js          # 受付番号の発行・照合・使用済み更新
│       ├── push.js           # Web Push 購読登録・通知送信
│       ├── staff.js          # スタッフ登録（service key 必要なためバックエンド経由）
│       └── settings.js       # システム設定（タイムアウト秒数など）
│
├── supabase/
│   └── schema.sql            # テーブル定義・RLS・初期データ
│
└── mock-up/                  # 元のHTMLモックアップ（参考用・変更不要）
    ├── reception-home.html
    └── call-screen.html
```

---

## 開発サーバーの起動

```bash
# フロントエンド（ポート3000）
cd frontend
npm run dev

# バックエンド（ポート4000）
cd backend
npm run dev
```

---

## 環境変数

### frontend/.env.local

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BM...
```

### backend/.env

```
PORT=4000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...    # service_role キー（フロントに渡さない）
SESAME_API_KEY=...             # Sesame APIキー（フロントに渡さない）
SESAME_DEVICE_ID=...           # Sesame デバイス UUID
VAPID_PUBLIC_KEY=BM...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:admin@example.com
FRONTEND_URL=http://localhost:3000
SLACK_WEBHOOK_URL=              # Slack Incoming Webhook（任意。Web Pushが届きにくい端末向けの保険）
```

---

## Supabase セットアップ手順

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. **SQL Editor** に `supabase/schema.sql` の内容を貼り付けて実行
3. **Settings > API** から URL と anon key・service_role key を取得
4. 各 `.env` ファイルに設定

---

## VAPID 鍵の生成（Web Push 用）

```bash
npx web-push generate-vapid-keys
```

出力された public/private 両方を `backend/.env` に、public のみ `frontend/.env.local` にも設定。

---

## 技術スタックと設計方針

| 要素         | 技術                 | 理由                                |
| ------------ | -------------------- | ----------------------------------- |
| ビデオ通話   | WebRTC + Google STUN | 無料・P2P・サーバー負荷なし         |
| シグナリング | Socket.io            | WebRTC のオファー/アンサー/ICE 交換 |
| プッシュ通知 | Web Push（PWA）      | Android 全画面着信通知を実現        |
| DB           | Supabase             | 無料枠・自動課金なし・PostgreSQL    |
| 電気錠       | Sesame API v3        | 導入済み・REST・無料                |

### セキュリティ原則

- `SESAME_API_KEY` と `SUPABASE_SERVICE_KEY` は**バックエンドのみ**で使用
- フロントエンドのコードにシークレットを書かない
- Supabase RLS で anon key からの不正アクセスを制限

### 禁止事項

- 有料API・従量課金サービスの追加
- APIキーのフロントエンドへの露出
- `.env` ファイルのコミット

---

## 画面遷移

```
/ (受付トップ)
  ├─ 部署ボタン押下    → /call?type=department&departmentId=...
  ├─ 受付番号入力      → /call?type=code&codeId=...&staffId=...
  └─ 担当者名選択      → /call?type=staff&staffId=...

/call (応答画面)
  着信中 → [応答] → 通話中 → [解錠] → 解錠完了 → /
                  → [拒否]              → /

/admin            管理画面（スタッフ・部署・受付番号・ログ・設定）
/staff            スタッフポータル（番号発行・プッシュ通知登録）
```

---

## スタッフのログイン・着信通知

- `/staff` はスタッフポータル。管理画面（`/admin/staff`）で発行した**6桁のログインコード**でログインする（Supabase UUIDの手入力は廃止）
- ログイン情報は端末の`localStorage`に保存され、次回以降は自動ログインされる
- 通知を許可すればアプリを閉じていても着信のようなプッシュ通知が届く（Android推奨）。iPhoneなどWeb Pushが届きにくい端末向けに、管理画面で該当スタッフに`slack_user_id`（Slackメンバーの`Copy member ID`で取得）を設定するとSlack通知が保険として併用される（`backend/lib/slackNotify.js`）

## 未実装の機能

- エスカレーション（タイムアウト→管理者転送）のバックエンドロジック
- Supabase Auth による認証（現在は管理画面のみメール/パスワード。バックエンドAPI自体には認証がない）
- 管理画面・バックエンドAPIの認証保護
- アイコン画像（`public/icon-192.png`, `public/icon-512.png`）

---

## コーディング規則

- コメントは**日本語**で書く（非エンジニアも読む可能性がある）
- APIキーを扱う処理は必ず `backend/routes/` に実装する
- フロントエンドから直接 Supabase の書き込みをしない（staff テーブル等）
