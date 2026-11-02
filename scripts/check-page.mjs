// Periksa isi halaman untuk memastikan tidak ada error runtime.
// Jalankan: node --env-file=.env scripts/check-page.mjs /dashboard
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const path = process.argv[2] ?? "/dashboard";
const email = process.env.OWNER_EMAIL ?? "owner@kost.local";
const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`GAGAL: user ${email} tidak ditemukan.`);
  process.exit(1);
}
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const token = await new SignJWT({ sub: user.id, role: user.role, email: user.email })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(secret);

const response = await fetch(`${process.env.APP_URL ?? "http://localhost:3000"}${path}`, {
  headers: { cookie: `km_session=${token}` },
  redirect: "manual",
});
const html = await response.text();
console.log("status:", response.status, "length:", html.length);

for (const pattern of ["Application error", "digest", "Internal Server Error", "Pendapatan", "Dashboard", "Tunggakan"]) {
  const index = html.toLowerCase().indexOf(pattern.toLowerCase());
  if (index >= 0) {
    console.log(`\n[${pattern}] @${index}: ...${html.slice(Math.max(0, index - 120), index + 160).replace(/\s+/g, " ")}...`);
  } else {
    console.log(`\n[${pattern}] tidak ditemukan`);
  }
}

await prisma.$disconnect();
