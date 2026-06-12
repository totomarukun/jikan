import { PrismaClient } from "@prisma/client";

// Vercel の Supabase 統合は接続情報を POSTGRES_* 名で注入するため、
// DATABASE_URL が未設定ならそこから補完する (PrismaClient 生成より前に行う)
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL;
process.env.DIRECT_URL =
  process.env.DIRECT_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
