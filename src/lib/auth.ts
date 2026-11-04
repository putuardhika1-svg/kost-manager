import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "./session";
import type { SessionPayload } from "./session";
import type { Prisma, Tenant, User, UserProperty } from "@prisma/client";

export { SESSION_COOKIE };
export type { SessionPayload };

const SESSION_MINUTES = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name, email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MINUTES}m`)
    .sign(sessionSecret());
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MINUTES * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export type CurrentUser = User & { properties: UserProperty[]; tenant: Tenant | null };

export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { properties: true, tenant: true },
  });
  if (!user || !user.isActive) redirect("/login?err=Sesi+tidak+valid");
  return user;
});

export async function requireRole(roles: string[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard?err=Anda+tidak+memiliki+akses+ke+halaman+tersebut");
  }
  return user;
}

export type TenantUser = CurrentUser & { tenant: Tenant };

/** Memastikan user berperan `tenant` dan terhubung dengan data penyewa. */
export async function requireTenant(): Promise<TenantUser> {
  const user = await requireUser();
  if (user.role !== "tenant") redirect("/dashboard");
  if (!user.tenant) {
    redirect("/dashboard?err=Akun+belum+terhubung+ke+data+penyewa.+Hubungi+owner.");
  }
  return { ...user, tenant: user.tenant };
}

/** null = akses semua properti (owner). Array kosong = tidak ada akses. */
export async function propertyScope(user: CurrentUser): Promise<string[] | null> {
  if (user.role === "owner") return null;
  return user.properties.map((p) => p.propertyId);
}

export function canAccessProperty(
  user: CurrentUser,
  propertyId: string,
  scope: string[] | null,
): boolean {
  if (scope === null) return true;
  return scope.includes(propertyId);
}

export async function touchLastLogin(userId: string): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  } catch {
    // diabaikan: kegagalan pencatatan login tidak boleh menggagalkan autentikasi
  }
}

export type PropertyFilter = Prisma.RoomWhereInput;
