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

デプロイ専用設定は用意済み: `vercel.json` がビルドコマンドを
`pnpm run build:deploy` に切り替え、**PostgreSQL用スキーマ
(`prisma/schema.postgres.prisma`) での generate / db push / シード投入 /
next build までを自動実行**する。手作業は以下の3ステップのみ。

### 1. Supabase でデータベースを作る（約3分）

1. [supabase.com](https://supabase.com) → New project（無料枠でOK。リージョンは Tokyo 推奨）
2. プロジェクト画面上部の **Connect** → `Connection string` から2つコピーする
   - **Transaction pooler**（port `6543`）→ `DATABASE_URL` に使う
   - **Direct connection**（port `5432`）→ `DIRECT_URL` に使う
   - どちらも `[YOUR-PASSWORD]` をプロジェクト作成時のDBパスワードに置換

### 2. Vercel にインポート（約3分）

1. [vercel.com/new](https://vercel.com/new) → このリポジトリを Import
   （Production Branch を使いたいブランチに設定）
2. Environment Variables に以下を設定:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase の Transaction pooler 接続文字列 |
| `DIRECT_URL` | Supabase の Direct connection 接続文字列 |
| `AUTH_SECRET` | `openssl rand -base64 32` で生成したランダム値（未設定だと本番起動を拒否する） |

3. **Deploy** を押す

### 3. スマホで開く

発行された `https://<project>.vercel.app` をスマホで開けば完了。
ビルド時に用具マスタ129製品が自動投入される（シードは upsert なので再デプロイしても重複しない）。

> 補足: Neon 等の他のPostgreSQLでも動く。プーラーを使わない場合は
> `DIRECT_URL` に `DATABASE_URL` と同じ値を設定すればよい。

### もっと簡単に: Vercel の Supabase 統合を使う場合

Vercel プロジェクトの **Storage** (または Marketplace) から Supabase を
Connect すると、接続情報 (`POSTGRES_PRISMA_URL` /
`POSTGRES_URL_NON_POOLING` / `SUPABASE_JWT_SECRET` 等) が自動注入される。
このリポジトリはそれらを自動検出するため、**手動の環境変数設定は不要**
(上記ステップ1〜2の接続文字列コピーを丸ごとスキップして Redeploy するだけ)。
手動で `DATABASE_URL` / `DIRECT_URL` / `AUTH_SECRET` を設定した場合は
そちらが優先される。

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
