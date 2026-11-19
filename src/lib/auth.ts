import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "unipass_session";
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export function getAppOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error("APP_ORIGIN is not configured.");
  return new URL(value).origin;
}
export function getRequestOrigin(request: Request): string | null {
  const configuredOrigin = getAppOrigin();
  const header = request.headers.get("origin");
  if (!header) return null;

  let parsed: URL;
  try { parsed = new URL(header); } catch { return null; }
  if (parsed.origin === configuredOrigin) return parsed.origin;

  // Local dev servers may choose another port when the default port is occupied.
  // Keep this exception strictly to loopback HTTP origins and never enable it in production.
  if (process.env.NODE_ENV !== "production" && parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return parsed.origin;
  return null;
}
export function newToken() { return randomBytes(32).toString("base64url"); }

export async function getSessionWallet() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.authSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.wallet;
}

export function setSessionCookie(token: string, expires: Date) {
  return cookies().then(jar => jar.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires,
  }));
}
