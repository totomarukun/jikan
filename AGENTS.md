<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TacTap プロジェクトガイド

- サービス仕様の一次資料は `docs/tactap-plan-v1.0.md`（企画書 v1.0）。機能・画面・データモデルの判断はこれに従う。
- DB は Prisma 6 + SQLite（ローカル）。SQLite が enum 非対応のため、enum 相当は String + `src/lib/types.ts` の Zod スキーマで検証する。新しい enum 値を足すときは両方を更新すること。
- 本番は Supabase (PostgreSQL) 想定。`schema.prisma` の provider 切り替えのみで移行できる状態を維持する。
- ブランドガイドライン（企画書 第10章）を遵守: 「絶対」「No.1」「最強」等の表現は禁止。カラーは `globals.css` の `--color-tt-*` トークンを使う。
- セットアップ: `pnpm install && pnpm prisma generate && pnpm db:push && pnpm db:seed`。検証: `pnpm lint && pnpm test && pnpm build`。
