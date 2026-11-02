import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} wajib diisi`);
  return value;
}

async function main() {
  const name = process.env.OWNER_NAME?.trim() || "Owner Kost";
  const email = required("OWNER_EMAIL").toLowerCase();
  const password = required("OWNER_PASSWORD");
  const phone = process.env.OWNER_PHONE?.trim() || null;

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("OWNER_PASSWORD minimal 8 karakter dan mengandung huruf serta angka");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`Akun owner ${email} sudah ada; tidak ada perubahan.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      phone,
      role: "owner",
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: owner.id,
      action: "owner.bootstrap",
      entity: "User",
      entityId: owner.id,
      payload: JSON.stringify({ email }),
    },
  });

  console.log(`Owner ${email} berhasil dibuat.`);
}

main()
  .catch((error) => {
    console.error("Gagal membuat owner:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
