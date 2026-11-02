import { jwtVerify } from "jose";

export const SESSION_COOKIE = "km_session";

export type SessionPayload = {
  sub: string;
  name: string;
  email: string;
  role: string;
};

export function sessionSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET belum diset atau terlalu pendek (minimal 16 karakter).");
  }
  return new TextEncoder().encode(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: String(payload.sub),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? ""),
    };
  } catch {
    return null;
  }
}
