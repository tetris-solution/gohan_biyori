# ごはんびより — Cloudflare版

料理献立アプリをCloudflare Workers + D1で配信する構成。既存の食材保存方法ページも含みます。

## 実装済み

- ユーザー名・パスワードによるアカウント作成、ログイン、ログアウト
- PBKDF2-SHA256（100,000回）でパスワードをハッシュ化
- HttpOnly / Secure / SameSite Cookieによる30日間のセッション
- D1にユーザー別のレシピ・食材・献立・買い物・スーパー情報を保存
- 他端末からログイン／再読み込みした際の最新データ取得
- 更新バージョンによる同時編集の衝突検出
- 旧localStorageデータの明示的な取り込み
- 保存失敗時の通知、再送信、未保存データのダウンロード
- 同一IPからの認証試行を10分間20回に制限
- Same-origin検証、入力検証、CSP

現時点でメール確認・パスワード再発行・アカウント削除・リアルタイム同期は未実装。ユーザー名方式でメールを収集しません。パスワードは紛失すると復旧できません。サンプルの栄養価、AI・OCR・チラシ自動収集の未接続は既存版と同じです。

## デプロイ

Cloudflareシークレットを環境に設定します。トークンや.envをGitにコミットしないでください。

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`（対象アカウントのWorkers Scripts編集、D1編集、およびデプロイに必要なアカウント参照権限）

```sh
npm install
npm test
node scripts/provision.mjs
```

スクリプトは同名のDBを再利用し、なければ作成します。DB IDをwrangler.jsoncへ保存し、マイグレーション後にWorkerを公開します。workers.devのURLはデプロイ出力で確認します。初回のworkers.dev設定が必要なアカウントでは、Cloudflareダッシュボードで有効にしてください。

以降は `npm run db:migrate`、`npm run deploy`。ローカル開発は `npx wrangler d1 migrations apply gohan-biyori-db --local` と `npm run dev`。

## テスト

`npm test` はNode.jsの組み込みSQLiteで登録・認証・利用者間データ分離・更新衝突・ログアウト・認証試行制限を検証します。Node.js 24以上を推奨。Cloudflare実環境での最終検証は別途必要です。

## 公開前の状態

コードとローカルAPIテストは準備済みで、GitHubに保存しています。Cloudflare実環境の公開・検証は未完了です。既存Sites版はこのDBに接続していません。

## 画像保存（R2）

Cloudflare R2で非公開バケット `gohan-biyori-images` を作成します。公開URL・r2.dev公開・CORSは不要です。Workerの `IMAGES` バインディングに接続し、ログイン本人のみ取得できるAPI経由で配信します。料理・食材・レシートをJPEG/PNG/WebPで1枚5MBまで保存可能。R2保存・一覧・削除は実装済み、自動解析は未接続です。

現在のwrangler.jsoncにはユーザーが作成したD1のIDとR2バケット名を設定済みです。CloudflareのGit連携でのDeploy commandは `npx wrangler d1 migrations apply gohan-biyori-db --remote && npx wrangler deploy` としてください。先にR2バケットを作成し、CloudflareビルドのAPIトークンがD1のマイグレーションとR2バインディングに必要な権限を持つことを確認します。
