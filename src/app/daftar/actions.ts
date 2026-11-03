"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { firstError, tenantRegistrationSchema } from "@/lib/validation";
import { addDays, addMonthsUTC, parseDateInput, startOfTodayUTC } from "@/lib/dates";
import { logAudit } from "@/lib/audit";

const MAX_REGISTRATIONS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Attempt = { count: number; firstAt: number };

const globalForRate = globalThis as unknown as {
  __kmRegistrationAttempts?: Map<string, Attempt>;
};
const attempts = globalForRate.__kmRegistrationAttempts ?? new Map<string, Attempt>();
globalForRate.__kmRegistrationAttempts = attempts;

function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_REGISTRATIONS;
}

function recordAttempt(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

function fail(message: string): never {
  redirect(`/daftar?err=${encodeURIComponent(message)}`);
}

export async function registerTenantAction(formData: FormData): Promise<void> {
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    fail("Terlalu banyak percobaan pendaftaran. Coba lagi dalam 15 menit.");
  }
  recordAttempt(ip);

  if (String(formData.get("website") ?? "").trim()) {
    redirect("/login?ok=Pendaftaran+diterima.+Silakan+masuk.");
  }

  const parsed = tenantRegistrationSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    addressOrigin: String(formData.get("addressOrigin") ?? "").trim(),
    idNumber: String(formData.get("idNumber") ?? "").trim() || undefined,
    emergencyContact: String(formData.get("emergencyContact") ?? "").trim() || undefined,
    roomId: String(formData.get("roomId") ?? "").trim(),
    startDate: String(formData.get("startDate") ?? "").trim(),
  });

  if (!parsed.success) fail(firstError(parsed.error));

  const data = parsed.data;
  const startDate = parseDateInput(data.startDate);
  if (!startDate) fail("Format tanggal mulai tidak valid");
  if (startDate < startOfTodayUTC()) fail("Tanggal mulai tidak boleh sebelum hari ini");

  const room = await prisma.room.findUnique({
    where: { id: data.roomId },
    include: {
      property: { select: { id: true, name: true } },
      contracts: {
        where: { status: { in: ["active", "pending"] } },
        select: { id: true },
      },
    },
  });

  if (!room) fail("Kamar tidak ditemukan");
  if (room.status !== "kosong" || room.contracts.length > 0) {
    fail("Kamar sudah tidak tersedia. Silakan pilih kamar lain.");
  }

  const [emailUsed, phoneUsed, lastReading] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
    prisma.tenant.findFirst({ where: { phone: data.phone }, select: { id: true } }),
    prisma.meterReading.findFirst({
      where: { roomId: room.id, status: { in: ["verified", "billed"] } },
      orderBy: [{ readingAt: "desc" }, { createdAt: "desc" }],
      select: { currentReading: true },
    }),
  ]);

  if (emailUsed) fail("Email sudah terdaftar. Silakan masuk atau gunakan email lain.");
  if (phoneUsed) fail("Nomor telepon sudah terdaftar.");

  const passwordHash = await hashPassword(data.password);
  const endDate = addDays(addMonthsUTC(startDate, 1), -1);
  const billingDay = Math.min(startDate.getUTCDate(), 28);
  const electricityStartReading = lastReading?.currentReading ?? 0;

  let created: { userId: string; contractId: string } | null = null;
  let error: string | null = null;

  try {
    created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.room.updateMany({
        where: { id: room.id, status: "kosong" },
        data: { status: "booked" },
      });
      if (claimed.count !== 1) {
        throw new Error("Kamar baru saja diambil penyewa lain. Silakan pilih kamar lain.");
      }

      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          idNumber: data.idNumber ?? null,
          emergencyContact: data.emergencyContact ?? null,
          addressOrigin: data.addressOrigin,
          status: "aktif",
        },
      });

      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          phone: data.phone,
          role: "tenant",
          tenantId: tenant.id,
        },
      });

      const contract = await tx.contract.create({
        data: {
          tenantId: tenant.id,
          roomId: room.id,
          startDate,
          endDate,
          rentAmount: room.monthlyPrice,
          deposit: room.monthlyPrice,
          billingDay,
          electricityStartReading,
          status: "pending",
          notes: "Pendaftaran mandiri melalui /daftar",
        },
      });

      return { userId: user.id, contractId: contract.id };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      error = "Email atau nomor telepon sudah terdaftar.";
    } else {
      error = err instanceof Error ? err.message : "Pendaftaran gagal. Coba lagi.";
    }
  }

  if (error || !created) fail(error ?? "Pendaftaran gagal. Coba lagi.");

  await logAudit({
    userId: created.userId,
    action: "tenant.register",
    entity: "Contract",
    entityId: created.contractId,
    payload: {
      roomId: room.id,
      propertyId: room.property.id,
      rentAmount: room.monthlyPrice,
    },
  });

  redirect(
    `/login?ok=${encodeURIComponent(
      `Pendaftaran kamar ${room.number} (${room.property.name}) terkirim. Tunggu persetujuan owner sebelum kontrak aktif.`,
    )}`,
  );
}
