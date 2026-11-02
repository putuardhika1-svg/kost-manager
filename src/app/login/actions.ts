"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { loginSchema, firstError } from "@/lib/validation";
import { signSession, setSessionCookie, verifyPassword, touchLastLogin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Attempt = { count: number; firstAt: number };

const globalForRate = globalThis as unknown as {
  __kmLoginAttempts?: Map<string, Attempt>;
};
const attempts = globalForRate.__kmLoginAttempts ?? new Map<string, Attempt>();
globalForRate.__kmLoginAttempts = attempts;

function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

/** Hanya izinkan path internal; tolak `//evil.com` dan `/\evil.com`. */
function safeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/dashboard";
  }
  return value;
}

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    redirect(`/login?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const next = safeNext(String(formData.get("next") ?? "/dashboard"));
  const rateKey = parsed.data.email;

  if (isRateLimited(rateKey)) {
    redirect(
      `/login?err=${encodeURIComponent("Terlalu banyak percobaan. Coba lagi dalam 15 menit.")}&next=${encodeURIComponent(next)}`,
    );
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !user.isActive || !valid) {
    recordFailure(rateKey);
    redirect(
      `/login?err=${encodeURIComponent("Email atau password salah")}&next=${encodeURIComponent(next)}`,
    );
  }

  attempts.delete(rateKey);

  const token = await signSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  await setSessionCookie(token);
  await touchLastLogin(user.id);
  await logAudit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id });

  redirect(next);
}
