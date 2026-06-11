# TacTap（タクタップ）

**卓球用具のAB比較。データで、用具選びの後悔を減らす。**

「ラバーA vs ラバーB、どっちが好み？」という3秒のAB比較に答えるほど、
スタイル診断や「自分と似たプレイヤーの選好データ」がアンロックされる、
ゲーミファイドなSNS型サービスです。

## 主要機能（MVP / Must Have）

| # | 機能 | 実装 |
|---|---|---|
| F1 | AB比較カード出題（3レイヤー戦略 + 直近10問の重複排除） | `/play` |
| F2 | 前提質問3問（レベル / プレースタイル / ラケット系統） | `/onboarding` |
| F3 | 匿名投稿対応（登録不要、cookieセッション） | 全投稿フロー |
| F4 | 回答進捗・アンロック報酬（5 / 10 / 20 / 30問） | `/unlock/[milestone]` |
| F5 | ユーザー登録・匿名→登録のデータ引き継ぎ | `/signup` `/login` |
| F6 | 用具対決ビュー（フィルタ付き集計） | `/compare/[aId]/vs/[bId]` |
| F7 | 用具マスタ（実在の人気129製品をシード済み） | `prisma/seed.ts` |
| F8 | マイページ | `/me` |
| — | スタイル診断（30問達成）+ 似た人の支持用具 | `/diagnosis` |
| — | 乗り換え検討ハブ（現用ラバー基準の候補比較） | `/switch` |
| — | 人気の対決ランキング | `/battles` |
| — | 用具個別ページ（スペック・勝敗・購入リンク） | `/equipment/[id]` |
| — | 回答直後の「みんなの回答」即時開示 | `/play` |

## 技術スタック

- **Next.js 16**（App Router）/ TypeScript strict / Tailwind CSS v4
- **Prisma 6** + SQLite（ローカル）→ PostgreSQL / Supabase（本番）
- **Zod**（入力検証）/ **Vitest**（ユニットテスト）
- ホスティング想定: **Vercel**

## ローカル開発

```bash
pnpm install
cp .env.example .env        # DATABASE_URL="file:./dev.db" のままでOK
pnpm prisma generate
pnpm db:push                # スキーマをDBへ反映
pnpm db:seed                # 用具マスタ129製品を投入
pnpm dev                    # http://localhost:3000
```

テストとビルド:

```bash
pnpm test    # ユニットテスト（質問生成 / 診断ロジック）
pnpm lint
pnpm build
```

## 本番デプロイ（Vercel + Supabase）

1. **Supabase** でプロジェクトを作成し、接続文字列を取得
2. `prisma/schema.prisma` の `provider` を `"postgresql"` に変更
   （enumはString+Zod検証で表現しているため、それ以外の変更は不要）
3. **Vercel** にリポジトリをインポートし、環境変数を設定
   - `DATABASE_URL` … Supabaseの接続文字列（pgbouncer推奨）
   - `AUTH_SECRET` … `openssl rand -base64 32` で生成したランダム値
4. デプロイ後に `pnpm prisma db push && pnpm db:seed` を一度実行

### 今後の本番強化（Phase 2.1以降の推奨）

- 認証を簡易メールログインから **Supabase Auth（マジックリンク）** へ移行
- 集計の `PairwiseStat` キャッシュテーブル導入（データ増加時）
- PostHog（アナリティクス）/ Sentry（エラー監視）の導入
- 診断結果の動的OGP画像生成（SNSシェア強化）

## ディレクトリ構成

```
prisma/
  schema.prisma          # データモデル（User / Equipment / Comparison / SessionProgress）
  seed.ts                # 用具マスタ129製品
src/
  app/                   # 画面（M1〜M6, L1, L2, C1）+ API Route Handlers
  components/            # ロゴ、ABカード等のUI
  lib/
    question-generator.ts  # 質問生成（3レイヤー戦略）
    diagnosis.ts           # スタイル診断ロジック
    session.ts             # 匿名セッション / 簡易認証
    play.ts / data.ts      # 出題・集計のデータアクセス
docs/
  tactap-plan-v1.0.md    # サービス企画書
```

## ブランド

- カラー: TacTap Green `#1A8917` / TacTap Coral `#D85A30`（分割円ロゴ = AB比較の表現）
- フォント: Inter / Noto Sans JP / JetBrains Mono（データ表示）
- ブランドプロミス: **データで、用具選びの後悔を減らす。**
