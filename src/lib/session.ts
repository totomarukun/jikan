import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "tactap_session";
export const USER_COOKIE = "tactap_user";

const ONE_YEAR = 60 * 60 * 24 * 365;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: ONE_YEAR,
  path: "/",
} as const;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  // 本番でのシークレット未設定は脆弱なセッションを生むため起動時に弾く
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET が未設定です。`openssl rand -base64 32` で生成した値を環境変数に設定してください。",
    );
  }
  return "tactap-dev-secret-do-not-use-in-prod";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeUserToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeUserToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(userId);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

/** 匿名セッションIDを取得 (なければ null) */
export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * 匿名セッションIDを取得し、なければ発行する。
 * cookie の書き込みを伴うため Route Handler / Server Action からのみ呼ぶこと。
 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(SESSION_COOKIE, id, COOKIE_OPTIONS);
  return id;
}

/** ログイン中ユーザーのIDを取得 (未ログインなら null) */
export async function getUserId(): Promise<string | null> {
  const store = await cookies();
  return decodeUserToken(store.get(USER_COOKIE)?.value);
}

/** ログインセッションを開始する。Route Handler / Server Action からのみ呼ぶこと。 */
export async function setUserSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, encodeUserToken(userId), COOKIE_OPTIONS);
}

export async function clearUserSession(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
}
