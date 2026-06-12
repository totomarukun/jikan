#!/usr/bin/env node
// Vercel デプロイ用ビルド (vercel.json から呼ばれる)。
//
// Vercel の Supabase Marketplace 統合は接続情報を POSTGRES_* という名前で
// 注入するため、DATABASE_URL / DIRECT_URL が未設定ならそこから補完する。
// 手動で DATABASE_URL 等を設定した場合はそちらが優先される。
import { spawnSync } from "node:child_process";

const env = { ...process.env };

env.DATABASE_URL =
  env.DATABASE_URL ?? env.POSTGRES_PRISMA_URL ?? env.POSTGRES_URL;
env.DIRECT_URL =
  env.DIRECT_URL ?? env.POSTGRES_URL_NON_POOLING ?? env.DATABASE_URL;

if (!env.DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL が見つかりません。Vercel の環境変数に " +
      "DATABASE_URL / DIRECT_URL を設定するか、Supabase 統合 " +
      "(Marketplace) をプロジェクトに接続してください。",
  );
  process.exit(1);
}

const steps = [
  ["pnpm", ["prisma", "generate", "--schema", "prisma/schema.postgres.prisma"]],
  ["pnpm", ["prisma", "db", "push", "--schema", "prisma/schema.postgres.prisma", "--skip-generate"]],
  ["pnpm", ["exec", "tsx", "prisma/seed.ts"]],
  ["pnpm", ["exec", "next", "build"]],
];

for (const [cmd, args] of steps) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
