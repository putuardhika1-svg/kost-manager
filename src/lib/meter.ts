import "server-only";
import { prisma } from "./db";
import { monthEndUTC, monthStartUTC } from "./dates";

export function meterPeriod(date: Date): { periodStart: Date; periodEnd: Date } {
  return {
    periodStart: monthStartUTC(date.getUTCFullYear(), date.getUTCMonth() + 1),
    periodEnd: monthEndUTC(date.getUTCFullYear(), date.getUTCMonth() + 1),
  };
}

function roundKwh(value: number): number {
  return Math.round(value * 100) / 100;
}

export function meterAmount(usageKwh: number, tariffPerKwh: number): number {
  return Math.max(0, Math.round(usageKwh * tariffPerKwh));
}

async function findLastVerifiedReading(
  roomId: string,
  readingAt: Date,
  excludeId?: string,
): Promise<{ currentReading: number } | null> {
  return prisma.meterReading.findFirst({
    where: {
      roomId,
      status: { in: ["verified", "billed"] },
      readingAt: { lte: readingAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ readingAt: "desc" }, { createdAt: "desc" }],
    select: { currentReading: true },
  });
}

export async function saveMeterReading(input: {
  roomId: string;
  contractId?: string | null;
  tenantId?: string | null;
  readingAt: Date;
  currentReading: number;
  photoUrl?: string | null;
  notes?: string | null;
  source: "tenant" | "staff" | "admin";
  autoVerify: boolean;
  userId: string;
  isBaseline?: boolean;
}): Promise<{ id: string; usageKwh: number; amount: number }> {
  if (!Number.isFinite(input.currentReading) || input.currentReading < 0) {
    throw new Error("Angka meter tidak valid");
  }

  const room = await prisma.room.findUnique({
    where: { id: input.roomId },
    include: { property: true },
  });
  if (!room) throw new Error("Kamar tidak ditemukan");

  const contract = input.contractId
    ? await prisma.contract.findUnique({
        where: { id: input.contractId },
        select: { id: true, electricityStartReading: true, startDate: true },
      })
    : null;

  const { periodStart, periodEnd } = meterPeriod(input.readingAt);
  const isBaseline = input.isBaseline === true;

  if (!isBaseline) {
    const duplicate = await prisma.meterReading.findFirst({
      where: {
        roomId: room.id,
        periodStart,
        status: { in: ["pending", "verified", "billed"] },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error("Sudah ada pembacaan meter untuk kamar dan periode ini");
    }
  }

  const last = await findLastVerifiedReading(room.id, input.readingAt);
  const hasStartReading = contract?.electricityStartReading != null;
  // Kontrak lama yang belum punya angka awal: pembacaan pertama dianggap baseline
  // agar tidak menagih pemakaian dari 0.
  const autoBaseline = !isBaseline && !last && !hasStartReading;
  const effectiveBaseline = isBaseline || autoBaseline;

  const previous = effectiveBaseline
    ? input.currentReading
    : last?.currentReading ?? contract?.electricityStartReading ?? 0;

  if (!effectiveBaseline && input.currentReading < previous) {
    throw new Error(
      `Angka meter tidak boleh lebih kecil dari pembacaan terakhir (${previous} kWh). Jika meter diganti, gunakan Baseline baru.`,
    );
  }

  const usageKwh = effectiveBaseline ? 0 : roundKwh(input.currentReading - previous);
  const amount = effectiveBaseline ? 0 : meterAmount(usageKwh, room.property.electricityTariff);
  const notes = autoBaseline
    ? [input.notes, "Baseline awal otomatis dari pembacaan pertama"].filter(Boolean).join(" | ")
    : input.notes;

  const reading = await prisma.meterReading.create({
    data: {
      roomId: room.id,
      contractId: input.contractId ?? null,
      tenantId: input.tenantId ?? null,
      periodStart,
      periodEnd,
      readingAt: input.readingAt,
      previousReading: previous,
      currentReading: input.currentReading,
      usageKwh,
      tariffPerKwh: room.property.electricityTariff,
      amount,
      photoUrl: input.photoUrl ?? null,
      source: input.source,
      status: effectiveBaseline || input.autoVerify ? "verified" : "pending",
      isBaseline: effectiveBaseline,
      notes: notes || null,
      verifiedById: effectiveBaseline || input.autoVerify ? input.userId : null,
      verifiedAt: effectiveBaseline || input.autoVerify ? new Date() : null,
    },
  });

  return { id: reading.id, usageKwh, amount };
}

export async function verifyMeterReading(
  readingId: string,
  userId: string,
  correctedReading?: number,
): Promise<{ usageKwh: number; amount: number }> {
  const reading = await prisma.meterReading.findUnique({
    where: { id: readingId },
    include: {
      room: { include: { property: true } },
      contract: { select: { electricityStartReading: true } },
    },
  });
  if (!reading) throw new Error("Pembacaan meter tidak ditemukan");
  if (reading.status !== "pending") {
    throw new Error("Hanya pembacaan berstatus pending yang dapat diverifikasi");
  }

  const current = correctedReading ?? reading.currentReading;
  if (!Number.isFinite(current) || current < 0) throw new Error("Angka meter tidak valid");

  const last = await findLastVerifiedReading(reading.roomId, reading.readingAt, reading.id);
  const hasStartReading = reading.contract?.electricityStartReading != null;
  const autoBaseline = !last && !hasStartReading;
  const effectiveBaseline = reading.isBaseline || autoBaseline;
  const previous = effectiveBaseline
    ? current
    : last?.currentReading ?? reading.contract?.electricityStartReading ?? 0;

  if (!effectiveBaseline && current < previous) {
    throw new Error(`Angka meter tidak boleh lebih kecil dari pembacaan terakhir (${previous} kWh)`);
  }

  const usageKwh = effectiveBaseline ? 0 : roundKwh(current - previous);
  const amount = effectiveBaseline ? 0 : meterAmount(usageKwh, reading.tariffPerKwh);
  const notes = autoBaseline
    ? [reading.notes, "Baseline awal otomatis dari pembacaan pertama"].filter(Boolean).join(" | ")
    : reading.notes;

  await prisma.meterReading.update({
    where: { id: readingId },
    data: {
      currentReading: current,
      previousReading: previous,
      usageKwh,
      amount,
      isBaseline: effectiveBaseline,
      notes: notes || null,
      status: "verified",
      verifiedById: userId,
      verifiedAt: new Date(),
      rejectionReason: null,
    },
  });

  return { usageKwh, amount };
}

export async function updateMeterReading(input: {
  readingId: string;
  currentReading: number;
  readingAt: Date;
  notes?: string | null;
}): Promise<{ usageKwh: number; amount: number }> {
  const reading = await prisma.meterReading.findUnique({
    where: { id: input.readingId },
    include: {
      room: { include: { property: true } },
      contract: { select: { electricityStartReading: true } },
    },
  });
  if (!reading) throw new Error("Pembacaan meter tidak ditemukan");
  if (reading.status !== "pending") {
    throw new Error("Hanya pembacaan berstatus pending yang dapat diedit");
  }
  if (!Number.isFinite(input.currentReading) || input.currentReading < 0) {
    throw new Error("Angka meter tidak valid");
  }

  const { periodStart, periodEnd } = meterPeriod(input.readingAt);
  const duplicate = await prisma.meterReading.findFirst({
    where: {
      roomId: reading.roomId,
      periodStart,
      status: { in: ["pending", "verified", "billed"] },
      id: { not: reading.id },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error("Sudah ada pembacaan meter untuk kamar dan periode ini");
  }

  const last = await findLastVerifiedReading(reading.roomId, input.readingAt, reading.id);
  const hasStartReading = reading.contract?.electricityStartReading != null;
  const effectiveBaseline = reading.isBaseline || (!last && !hasStartReading);
  const previous = effectiveBaseline
    ? input.currentReading
    : last?.currentReading ?? reading.contract?.electricityStartReading ?? 0;

  if (!effectiveBaseline && input.currentReading < previous) {
    throw new Error(
      `Angka meter tidak boleh lebih kecil dari pembacaan terakhir (${previous} kWh).`,
    );
  }

  const usageKwh = effectiveBaseline ? 0 : roundKwh(input.currentReading - previous);
  const amount = effectiveBaseline ? 0 : meterAmount(usageKwh, reading.tariffPerKwh);

  await prisma.meterReading.update({
    where: { id: reading.id },
    data: {
      periodStart,
      periodEnd,
      readingAt: input.readingAt,
      previousReading: previous,
      currentReading: input.currentReading,
      usageKwh,
      amount,
      isBaseline: effectiveBaseline,
      notes: input.notes || null,
    },
  });

  return { usageKwh, amount };
}

export async function deleteMeterReading(readingId: string): Promise<void> {
  const reading = await prisma.meterReading.findUnique({
    where: { id: readingId },
    include: { invoiceItem: { select: { id: true } } },
  });
  if (!reading) throw new Error("Pembacaan meter tidak ditemukan");
  if (reading.status === "verified" || reading.status === "billed") {
    throw new Error(
      "Pembacaan terverifikasi tidak dapat dihapus. Hapus item listrik dari tagihan terlebih dahulu.",
    );
  }
  if (reading.invoiceItem) {
    throw new Error("Pembacaan sudah terhubung ke tagihan dan tidak dapat dihapus");
  }

  await prisma.meterReading.delete({ where: { id: readingId } });
}

export async function rejectMeterReading(
  readingId: string,
  reason: string,
  userId: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 5) throw new Error("Alasan penolakan minimal 5 karakter");
  if (trimmed.length > 300) throw new Error("Alasan penolakan maksimal 300 karakter");

  const reading = await prisma.meterReading.findUnique({ where: { id: readingId } });
  if (!reading) throw new Error("Pembacaan meter tidak ditemukan");
  if (reading.status !== "pending") throw new Error("Hanya pembacaan pending yang dapat ditolak");

  await prisma.meterReading.update({
    where: { id: readingId },
    data: {
      status: "rejected",
      rejectionReason: trimmed,
      verifiedById: userId,
      verifiedAt: new Date(),
    },
  });
}
