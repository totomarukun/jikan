import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt によるパスワードハッシュ。形式: "salt(base64url):hash(base64url)"
// 外部依存を増やさないため Node 組み込みのみで実装する

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, KEY_LEN).toString("base64url");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const sep = stored.indexOf(":");
  if (sep <= 0) return false;
  const salt = stored.slice(0, sep);
  const expected = Buffer.from(stored.slice(sep + 1), "base64url");
  const actual = scryptSync(password, salt, KEY_LEN);
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}
