// Uji cepat: verifikasi hash password, tanda tangan JWT, lalu akses halaman terproteksi.
// Jalankan: node --env-file=.env scripts/smoke.mjs
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const email = process.env.OWNER_EMAIL ?? "owner@kost.local";
const password = process.env.OWNER_PASSWORD ?? "owner12345";

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`GAGAL: user ${email} tidak ditemukan. Jalankan npm run db:owner atau db:seed.`);
  process.exit(1);
}

const passwordOk = await bcrypt.compare(password, user.passwordHash);
console.log("bcrypt password cocok:", passwordOk);
if (!passwordOk) process.exit(1);

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = await new SignJWT({ sub: user.id, role: user.role, email: user.email })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(secret);

const cookie = `km_session=${token}`;

const pages = ["/dashboard", "/kamar",   "/tagihan",
  "/meter",
  "/pembayaran", "/penyewa", "/kontrak", "/properti", "/maintenance", "/laporan", "/pengaturan"];
for (const path of pages) {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const body = await response.text();
  const hasError = /Application error|Internal Server Error|__next_error__/i.test(body);
  console.log(`${path} -> ${response.status}${hasError ? " (ADA ERROR DI HALAMAN)" : ""}`);
}

const period = new Date().toISOString().slice(0, 7);
const exportResponse = await fetch(`${BASE}/laporan/export?period=${period}`, {
  headers: { cookie },
  redirect: "manual",
});
console.log(
  `/laporan/export -> ${exportResponse.status} (${exportResponse.headers.get("content-type") ?? "-"})`,
);

await prisma.$disconnect();
