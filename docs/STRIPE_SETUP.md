# Stripe Connectによる販売・会員コミュニティ

## 実装と接続状態

単品販売、月額コミュニティ、限定投稿・コメント、購入管理、Stripeの契約管理を実装しています。秘密鍵未登録時は下書きのみ作成でき、販売・Checkoutを無効化します。実際のStripeアカウントでの通し決済確認は接続後に行います。

## Stripe側で必要な設定

1. プラットフォームのStripeアカウントでConnectを有効にする。販売者は日本のExpress連結アカウントを使用し、Stripeのホスト型オンボーディングで本人確認・銀行口座を登録します。
2. 最初はテストモードを使う。Cloudflare Worker `gohan-biyori` の設定 → 変数とシークレットに `STRIPE_SECRET_KEY` を暗号化シークレットとして登録する。GitHubやチャットに秘密鍵を記載しない。公開可能キーは不要です。
3. StripeのWebhookを `https://gohan-biyori.tetris-solution.workers.dev/api/stripe/webhook` に設定し、連結アカウント（Connected accounts）のイベントを受け取る。署名シークレットをCloudflareの `STRIPE_WEBHOOK_SECRET` に登録する。
4. 対象イベント：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`customer.subscription.created`、`customer.subscription.updated`、`customer.subscription.deleted`、`invoice.paid`、`invoice.payment_failed`、`charge.refunded`、`charge.dispute.created`、`charge.dispute.closed`。
5. シークレット登録後、Workerを再デプロイする。アプリのアカウント → クリエイター設定 → 販売・コミュニティ設定から販売者登録、販売条件URL、オリジナル商品を設定する。
6. テスト環境で単品購入、定期購読、更新、解約、支払い失敗、返金を確認する。テスト・本番のConnectアカウント/商品/価格/顧客は異なるため、同じD1のIDを使い回さない。テスト用WorkerとD1を分離する。テストシークレットを登録すると画面にテスト決済モードを表示する。
7. 本番販売時は本番用Stripeアカウント、シークレット、本番Webhookを使う。Stripeの審査、販売者登録、実際の入金確認が必要です。

販売機能の追加だけではStripeの秘密鍵は取得できません。ChatGPTのStripeプラグイン接続と、公開アプリのサーバー用シークレットの設定は別です。

## 決済モデル

Stripe ConnectのDirect charges。商品、価格、顧客、Checkout、定期購読、Customer Portalは連結アカウントに対して作成します。決済・入金をStripeで扱います。プラットフォームの追加手数料は未設定（0%）で、Stripe/Connect所定の手数料は別途かかります。Direct chargesでもプラットフォームの責任がなくなるわけではありません。Stripeの契約・アカウント設定に従います。

通貨は日本円。価格は税込100〜100,000円。コミュニティはクリエイター1人につき1件、毎月自動更新、トライアルなし。販売開始後の料金・課金方式は固定します。無料の公開レシピとは別テーブルに保存し、引用元の本文を自動で販売商品に変換しません。販売権利を確認するチェックと、販売者情報・特定商取引法の表記・解約/返金条件の外部URLを必須にします。法律上の掲載義務を免除する機能ではありません。

## 個人情報の最小化

アプリの決済テーブルは、内部アカウントID、Stripeの販売者/顧客/Checkout/PaymentIntent/定期購読ID、商品ID、状態、期限、処理時刻だけを保存します。カード番号・本名・住所・銀行口座・本人確認書類・決済用メールアドレスはD1に保存しません。Webhookの本文も保存しません。Webhook処理時のJSONとStripe API結果は一時的にメモリで扱い、DBへは許可したフィールドだけを書きます。Stripeには必要な決済情報が保存されます。

公開表示名、紹介文、商品本文、投稿・コメントはユーザー入力として保存されます。コメントはユーザー名を表示し、APIでは他者の内部ユーザーIDを返しません。投稿者は退会・会員期限終了後でも自分のコメントを削除でき、クリエイターは自分のコミュニティを管理できます。投稿・コメントは本名や住所を入れないよう画面で説明します。

StripeのIDもアカウントと結びつく情報であり、個人情報に該当し得ます。完全匿名ではありません。既存の栄養プロフィール等は本人のプライベートデータとして従来どおり保存されます。注文・契約履歴は利用権限と決済対応に必要な間保持します。正式な保存期間、削除依頼の窓口、販売規約、Cloudflare/Stripeのログ保存設定は運営時に定めてください。

## 利用権限

ブラウザの完了URLでは権限を付与しません。署名を検証したWebhookで現在のStripe情報を再取得し、連結アカウント、顧客、商品価格、購入者、決済状態が対応することを確認します。単品は支払い完了後、月額は支払済みの有効な契約期間のみ閲覧可能です。未購入者には本文・会員投稿・コメントを送信しません。単品の一部返金を含む返金、不審請求の申立中は単品本文の権限を停止します。月額の返金だけではStripeの契約は解約されないため、返金に伴って解約する場合はStripeで契約も変更してください。

重複イベントはイベントIDで判定し、DBの権限更新とイベント記録を同じバッチで確定します。遅延イベントでも現在の契約状態を照会します。失敗は非2xxで返し、Stripeからの再送を受けます。解約はCustomer Portalから期間末で行い、請求書・支払い方法の変更もStripeに集約します。

## 検証

Node/SQLiteのテストで署名・期限・権限分離・料金改ざん・重複イベント・返金・不審請求・契約失敗/解約・投稿削除・未設定時の制限を検証。ブラウザで下書き登録、会員画面、コメント、スマホ/PCのレイアウトを検証しています。Stripe APIはテスト内で模擬し、実課金・実入金は行っていません。

参考：[Connect Direct charges](https://docs.stripe.com/connect/direct-charges)、[ホスト型オンボーディング](https://docs.stripe.com/connect/hosted-onboarding)、[Webhook署名検証](https://docs.stripe.com/webhooks/signature)、[Customer Portal](https://docs.stripe.com/customer-management)。
