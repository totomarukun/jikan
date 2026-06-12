import { PrismaClient } from "@prisma/client";

// Supabase の接続プーラー (port 6543) を Prisma から使う場合、
// pgbouncer=true がないと prepared statement の重複エラーになる。
// 統合が注入する URL にはこれが付かないことがあるため補完する。
// https://github.com/supabase/supabase/issues/27328
function withPoolerParams(url: string | undefined): string | undefined {
  if (!url || !url.startsWith("postgres")) return url;
  if (url.includes(":6543") && !url.includes("pgbouncer=true")) {
    return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
  }
  return url;
}

// Vercel の Supabase 統合は接続情報を POSTGRES_* 名で注入するため、
// DATABASE_URL が未設定ならそこから補完する (PrismaClient 生成より前に行う)
process.env.DATABASE_URL = withPoolerParams(
  process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL,
);
process.env.DIRECT_URL =
  process.env.DIRECT_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
