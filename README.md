# VoiceTask

**🎉 Stage 1 Beta リリース完了 (Week 11-12 Testing & Beta Release)**

音声入力で素早くタスクを作成・管理できるWebアプリケーション  
Firebase統合により、複数デバイス間でリアルタイム同期・プッシュ通知に対応

## 📱 プロジェクト概要

**VoiceTask**は、音声入力で簡単にスケジュールを管理できる、あらゆるデバイス（スマホ・タブレット・PC）に対応したレスポンシブWebアプリケーションです。

### 🎯 主な特徴
- **音声入力対応**: 「明日10時 重要 顧客に電話 30分」と話すだけで自動的にタスクを作成
- **日本語自然言語解析**: chrono-nodeを使用した高精度な日時解析
- **リアルタイム同期**: Firestoreによる複数デバイス間でのデータ共有
- **プッシュ通知**: FCM (Firebase Cloud Messaging) による通知機能
- **繰り返しタスク**: 日次・週次・月次の自動繰り返しに対応
- **カテゴリ・タグ**: 色分け・絵文字アイコンによる視覚的なタスク管理
- **日本の祝日**: 2024-2026年の祝日カレンダー表示
- **レスポンシブデザイン**: iPhone、iPad、Android、デスクトップすべてで快適に動作
- **PWA対応**: ホーム画面に追加してアプリのように使用可能

## 🌐 公開URL

### サンドボックス環境（開発用）
- **URL**: https://3000-iaucei33hu14f8a45otlh-3844e1b6.sandbox.novita.ai
- **用途**: 開発・テスト環境
- **有効期限**: セッション終了まで

### Cloudflare Pages（本番環境）
- **デプロイ方法**: `npm run deploy:prod`
- **プロジェクト名**: voicetask
- **本番URL**: デプロイ後に表示されます

## ✅ Stage 1 Beta 実装完了機能

### Week 1-2: Firebase Authentication ✅
- **Google OAuthログイン**: ワンクリックでGoogleアカウント認証
- **メールアドレス/パスワード認証**: 従来の認証方式にも対応
- **ユーザープロフィール管理**: 表示名・メールアドレスの管理
- **認証状態の永続化**: リロード後も自動ログイン維持
- **音声入力最適化**: iPhone Safari対応、タップ遅延対策

### Week 3-4: Firestore リアルタイム同期 ✅
- **クラウドデータベース統合**: Cloud Firestoreによるデータ管理
- **リアルタイム更新**: onSnapshot()による即時データ同期
- **複数デバイス対応**: スマホ・タブレット・PCで同じデータを共有
- **オフライン対応**: IndexedDB persistenceによるオフライン動作
- **自動マイグレーション**: LocalStorageからFirestoreへの自動移行
- **コレクション構造**: `users/{userId}/tasks/{taskId}`

### Week 5-6: プッシュ通知 (FCM) ✅
- **Firebase Cloud Messaging統合**: WebプッシュAPIによる通知
- **フォアグラウンド通知**: アプリ使用中の即時通知表示
- **バックグラウンド通知**: Service Workerによる通知受信
- **通知許可管理**: 通知設定の有効化・無効化
- **FCMトークン管理**: デバイストークンの自動保存・更新
- **Service Worker**: `/firebase-messaging-sw.js`による通知ハンドリング

### Week 7-8: 繰り返しタスク ✅
- **繰り返しパターン**: 日次・週次・月次・カスタム間隔
- **曜日指定**: 「毎週月・水・金」などの複数曜日指定可能
- **月内日付指定**: 「毎月15日」などの特定日指定
- **終了条件**: 終了日または回数による繰り返し終了設定
- **インスタンス管理**: 個別タスクの編集・削除・完了処理
- **自動生成**: 次回インスタンスの自動作成（完了時・日付変更時）
- **音声入力対応**: 「毎週月曜日9時」などの自然言語解析

### Week 9-10: カテゴリ・タグ + 日本の祝日 ✅
- **デフォルトカテゴリ**: 仕事💼・個人🏠・健康💪・勉強📚・会議🤝・趣味🎨
- **カラーコーディング**: 各カテゴリに専用カラー（blue/violet/green/yellow/red/pink）
- **絵文字アイコン**: 視覚的な識別を容易に
- **音声入力での自動判定**: 「会議」「仕事」などのキーワードで自動カテゴリ設定
- **カスタムタグ**: ユーザー定義のタグ追加
- **フィルタリング**: カテゴリ・タグによる絞り込み表示
- **日本の祝日カレンダー**: 2024-2026年の全祝日データ
- **祝日表示**: カレンダービューでの視覚的ハイライト

### Week 11-12: テスト・バグ修正・β版リリース準備 ✅
- **バグ修正**: 繰り返しタスクの曜日解析バグ修正（daysOfWeek型エラー）
- **エラーハンドリング検証**: 音声認識の包括的なエラー処理確認
- **README更新**: 全実装機能を反映した詳細ドキュメント作成
- **型定義の完全性**: RecurrenceRule, Category, Task型の完全なドキュメント化

## 🎯 音声入力の使い方

### 基本的なタスク作成
```
「明日の午前10時に歯医者」
→ 明日 10:00 のタスク「歯医者」を作成

「来週の火曜日15時にミーティング 60分」
→ 来週火曜 15:00、所要時間60分のタスク「ミーティング」を作成

「今月25日 重要 月次報告書」
→ 今月25日の重要タスク「月次報告書」を作成
```

### 繰り返しタスク
```
「毎週月曜日9時に週次レビュー」
→ 毎週月曜 9:00 に繰り返すタスク

「毎日午後3時に水分補給」
→ 毎日 15:00 に繰り返すタスク

「毎月1日に経費精算」
→ 毎月1日に繰り返すタスク

「毎週火曜と木曜の18時にジム」
→ 毎週火・木 18:00 に繰り返すタスク
```

### カテゴリ指定
```
「明日10時に会議で四半期レビュー」
→ 会議カテゴリ（🤝赤色）のタスクを作成

「仕事で来週金曜15時にプレゼン準備」
→ 仕事カテゴリ（💼青色）のタスクを作成
```

### 音声入力のコツ
- 📍 **日時を先に**: 「明日10時」→「タスク名」の順が認識されやすい
- ⏱️ **所要時間**: 「30分」「1時間」などで duration 設定
- ⭐ **優先度**: 「重要」「緊急」で priority: 'high' に設定
- 🔔 **通知**: デフォルトでタスク時刻の10分前に通知
- 🔄 **繰り返し**: 「毎日」「毎週○曜日」「毎月×日」で自動設定

## 🛠️ 技術スタック

### フロントエンド
- **React 19**: UIフレームワーク
- **TypeScript**: 型安全性
- **TailwindCSS**: ユーティリティファーストCSS（CDN版）
- **date-fns**: 日付操作ライブラリ
- **chrono-node**: 自然言語日時解析
- **uuid**: 一意ID生成

### Firebase Services
- **Firebase Authentication**: ユーザー認証（Google OAuth / Email+Password）
- **Cloud Firestore**: リアルタイムNoSQLデータベース
- **Firebase Cloud Messaging (FCM)**: Webプッシュ通知
- **Firebase SDK**: 10.7.1

### バックエンド
- **Hono**: 軽量高速Webフレームワーク
- **Cloudflare Pages**: エッジデプロイプラットフォーム
- **Wrangler**: Cloudflare開発ツール

### ビルド・開発ツール
- **Vite**: 高速ビルドツール
- **PM2**: プロセス管理（開発環境）
- **Service Worker**: バックグラウンド通知処理

## 📦 データ構造

### Task型（完全版）
```typescript
interface Task {
  id: string;              // UUID
  title: string;           // タスク名
  note?: string;           // メモ・詳細
  dateISO: string;         // ISO 8601形式の日時
  durationMin: number;     // 所要時間（分）
  priority: 'low' | 'medium' | 'high';  // 優先度
  done: boolean;           // 完了状態
  notify: boolean;         // 通知有効化
  
  // 繰り返しタスク用プロパティ
  recurrence?: RecurrenceRule;     // 繰り返しルール
  recurrenceId?: string;           // 親タスクID（インスタンスの場合）
  originalDate?: string;           // 元の予定日（インスタンス変更時）
  
  // カテゴリ・タグ用プロパティ
  category?: string;               // カテゴリID（'work', 'personal', など）
  tags?: string[];                 // カスタムタグ配列
}
```

### RecurrenceRule型
```typescript
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

interface RecurrenceRule {
  frequency: RecurrenceFrequency;  // 繰り返し頻度
  interval: number;                // 間隔（例: 2 = 2日ごと、3 = 3週間ごと）
  daysOfWeek?: number[];           // 曜日指定（0=日曜, 1=月曜, ..., 6=土曜）
  dayOfMonth?: number;             // 月内の日付（1-31）
  endDate?: string;                // 終了日（ISO 8601）
  count?: number;                  // 繰り返し回数
}
```

### Category型
```typescript
interface Category {
  id: string;      // 'work', 'personal', 'health', 'study', 'meeting', 'hobby'
  name: string;    // 表示名（'仕事', '個人', など）
  color: string;   // TailwindCSSカラー（'blue', 'violet', など）
  icon?: string;   // 絵文字アイコン（'💼', '🏠', など）
}
```

### デフォルトカテゴリ
```typescript
const defaultCategories: Category[] = [
  { id: 'work', name: '仕事', color: 'blue', icon: '💼' },
  { id: 'personal', name: '個人', color: 'violet', icon: '🏠' },
  { id: 'health', name: '健康', color: 'green', icon: '💪' },
  { id: 'study', name: '勉強', color: 'yellow', icon: '📚' },
  { id: 'meeting', name: '会議', color: 'red', icon: '🤝' },
  { id: 'hobby', name: '趣味', color: 'pink', icon: '🎨' },
];
```

### 日本の祝日データ
```typescript
const japaneseHolidays: { [key: string]: string } = {
  // 2024年
  '2024-01-01': '元日',
  '2024-01-08': '成人の日',
  '2024-02-11': '建国記念の日',
  '2024-02-12': '振替休日',
  '2024-02-23': '天皇誕生日',
  '2024-03-20': '春分の日',
  '2024-04-29': '昭和の日',
  '2024-05-03': '憲法記念日',
  '2024-05-04': 'みどりの日',
  '2024-05-05': 'こどもの日',
  '2024-05-06': '振替休日',
  '2024-07-15': '海の日',
  '2024-08-11': '山の日',
  '2024-08-12': '振替休日',
  '2024-09-16': '敬老の日',
  '2024-09-22': '秋分の日',
  '2024-09-23': '振替休日',
  '2024-10-14': 'スポーツの日',
  '2024-11-03': '文化の日',
  '2024-11-04': '振替休日',
  '2024-11-23': '勤労感謝の日',
  
  // 2025-2026年も同様に定義
};
```

## 🚀 セットアップ方法

### 1. リポジトリのクローン
```bash
git clone <repository-url>
cd webapp
```

### 2. 依存関係のインストール
```bash
npm install
```

### 3. Firebase設定

#### 3.1 Firebaseプロジェクトの作成
1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」から新規プロジェクト作成
3. プロジェクト設定 > 全般 から「ウェブアプリを追加」

#### 3.2 Authentication の有効化
1. Firebase Console > Authentication > Sign-in method
2. 「Google」を有効化
3. 「メール/パスワード」を有効化

#### 3.3 Firestore Database の作成
1. Firebase Console > Firestore Database > データベースの作成
2. 本番環境モードで開始（セキュリティルールは後で設定）
3. ロケーション: `asia-northeast1` (東京) を推奨

#### 3.4 Firestore セキュリティルール
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ユーザーは自分のデータのみアクセス可能
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

#### 3.5 Cloud Messaging (FCM) の設定
1. Firebase Console > プロジェクトの設定 > Cloud Messaging
2. 「ウェブプッシュ証明書」タブで「鍵ペアを生成」
3. VAPID公開鍵をコピー

#### 3.6 環境変数の設定
`.env`ファイルを作成（`.env.example`を参考）:
```bash
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_VAPID_KEY=your_vapid_key_here
```

### 4. ビルドと起動

#### ローカル開発（Viteデブサーバー）
```bash
npm run dev
```

#### サンドボックス開発（Cloudflare Workers）
```bash
# ビルド
npm run build

# PM2で起動
pm2 start ecosystem.config.cjs

# サービス確認
curl http://localhost:3000
pm2 logs voicetask --nostream
```

## 📤 デプロイ方法

### Cloudflare Pages本番デプロイ

#### 1. Cloudflare API Key の設定
サンドボックス環境で実行:
```bash
# setup_cloudflare_api_key ツールを使用して認証設定
# 失敗した場合: Deployタブで Cloudflare API Key を設定
```

#### 2. 環境変数の確認
```bash
npx wrangler whoami  # 認証確認
```

#### 3. プロジェクトのビルド
```bash
npm run build
# dist/ ディレクトリに以下が生成される:
# - _worker.js (Honoアプリ)
# - _routes.json (ルーティング設定)
# - public/ からの静的ファイル
```

#### 4. Cloudflare Pages プロジェクト作成
```bash
npx wrangler pages project create voicetask \
  --production-branch main \
  --compatibility-date 2024-01-01
```

#### 5. デプロイ実行
```bash
npm run deploy:prod
# または
npx wrangler pages deploy dist --project-name voicetask

# デプロイ完了後、以下のURLが表示される:
# - Production: https://random-id.voicetask.pages.dev
# - Branch: https://main.voicetask.pages.dev
```

#### 6. 環境変数の設定（本番環境）
```bash
# Firebase設定を Cloudflare Pages に追加
npx wrangler pages secret put VITE_FIREBASE_API_KEY --project-name voicetask
npx wrangler pages secret put VITE_FIREBASE_AUTH_DOMAIN --project-name voicetask
# ... 他の環境変数も同様に設定

# 設定確認
npx wrangler pages secret list --project-name voicetask
```

#### 7. デプロイ確認
```bash
# 各エンドポイントをテスト
curl https://voicetask.pages.dev
curl https://voicetask.pages.dev/api/health
```

#### 8. カスタムドメイン設定（オプション）
```bash
npx wrangler pages domain add example.com --project-name voicetask
```

## 📱 PWAとして使用する

### iPhoneの場合
1. Safariで VoiceTask を開く
2. 共有ボタン（↑）をタップ
3. 「ホーム画面に追加」を選択
4. アプリ名を確認して「追加」

### Androidの場合
1. Chromeで VoiceTask を開く
2. メニュー（⋮）をタップ
3. 「ホーム画面に追加」を選択
4. 「インストール」をタップ

### PCの場合
1. Chrome/Edgeで VoiceTask を開く
2. アドレスバー右側の「+」アイコンをクリック
3. 「インストール」をクリック

## 🔔 プッシュ通知の設定

### 初回通知許可
1. ログイン後、「通知を有効にする」ボタンをクリック
2. ブラウザの通知許可ダイアログで「許可」を選択
3. FCMトークンが自動的にFirestoreに保存される

### 通知のテスト
1. 現在時刻の10分後にタスクを作成
2. `notify: true` を確認
3. 10分前に通知が届く

### 通知が届かない場合
- ブラウザの通知設定を確認（許可されているか）
- Service Worker が正常に登録されているか確認（DevTools > Application > Service Workers）
- FCMトークンが Firestore に保存されているか確認
- ブラウザコンソールでエラーメッセージを確認

## 🐛 既知の問題と解決済みバグ

### ✅ 解決済み（Week 11-12）
- **繰り返しタスクの曜日解析バグ**: parseVoiceTextToTask で曜日名（文字列）を数値インデックスに正しく変換するように修正

### 🔧 制限事項
- **音声認識**: Web Speech API に依存（Safari/Chrome のみ対応）
- **iOS通知**: iOSのブラウザではバックグラウンド通知に制限あり
- **オフライン機能**: オフライン時は Firestore への同期が保留される

## 📝 開発ロードマップ

### ✅ Stage 1 Beta（完了）
- [x] Week 1-2: Firebase Authentication
- [x] Week 3-4: Firestore リアルタイム同期
- [x] Week 5-6: プッシュ通知 (FCM)
- [x] Week 7-8: 繰り返しタスク
- [x] Week 9-10: カテゴリ・タグ + 日本の祝日
- [x] Week 11-12: テスト・バグ修正・β版リリース準備

### 🔜 Stage 2: 正式版（未定）
- [ ] サブタスク機能
- [ ] タスク共有・コラボレーション
- [ ] カスタムリマインダー（複数通知時刻設定）
- [ ] 統計・レポート機能
- [ ] ダークモード
- [ ] 多言語対応（英語・中国語）
- [ ] AI音声アシスタント統合

### 🚀 Stage 3: エンタープライズ版（未定）
- [ ] チーム管理機能
- [ ] 権限管理
- [ ] API公開
- [ ] Slack/Teams統合
- [ ] カスタムワークフロー

## 📚 参考リンク

- [Firebase Documentation](https://firebase.google.com/docs)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Hono Framework](https://hono.dev/)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [chrono-node](https://github.com/wanasit/chrono)

## 📄 ライセンス

MIT License

## 👨‍💻 開発者

VoiceTask Development Team

## 🙏 謝辞

このプロジェクトは以下のオープンソースプロジェクトを使用しています:
- React, TypeScript, TailwindCSS
- Firebase (Authentication, Firestore, Cloud Messaging)
- Hono, Cloudflare Pages
- date-fns, chrono-node, uuid

---

**Stage 1 Beta リリース完了**: 2025年（Week 11-12完了）  
**最終更新**: 2025-10-29
# Trigger rebuild with .env.production
