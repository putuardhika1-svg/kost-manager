"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { firstError, meterReadingSchema, reasonSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { saveUpload } from "@/lib/upload";
import { rejectMeterReading, saveMeterReading, verifyMeterReading } from "@/lib/meter";
import { attachMeterReadingToInvoice } from "@/lib/billing";

async function guardRoom(roomId: string): Promise<{ userId: string; propertyId: string; role: string }> {
  const user = await requireRole(["owner", "admin", "staff"]);
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { propertyId: true },
  });
  if (!room) redirect("/meter?err=Kamar+tidak+ditemukan");
  const scope = await propertyScope(user);
  if (scope !== null && !scope.includes(room.propertyId)) {
    redirect("/meter?err=Akses+ditolak");
  }
  return { userId: user.id, propertyId: room.propertyId, role: user.role };
}

async function guardReading(readingId: string): Promise<{ userId: string; role: string }> {
  const user = await requireRole(["owner", "admin", "staff"]);
  const reading = await prisma.meterReading.findUnique({
    where: { id: readingId },
    select: { room: { select: { propertyId: true } } },
  });
  if (!reading) redirect("/meter?err=Pembacaan+tidak+ditemukan");
  const scope = await propertyScope(user);
  if (scope !== null && !scope.includes(reading.room.propertyId)) {
    redirect("/meter?err=Akses+ditolak");
  }
  return { userId: user.id, role: user.role };
}

export async function tenantSubmitMeterReadingAction(formData: FormData): Promise<void> {
  const user = await requireRole(["tenant"]);
  if (!user.tenant) {
    redirect("/dashboard?err=Akun+belum+terhubung+ke+data+penyewa");
  }

  const contract = await prisma.contract.findFirst({
    where: { tenantId: user.tenant.id, status: "active" },
    include: { room: true },
    orderBy: { startDate: "desc" },
  });
  if (!contract) redirect("/meter?err=Tidak+ada+kontrak+aktif");

  const parsed = meterReadingSchema.safeParse({
    currentReading: formData.get("currentReading") ?? "",
    readingAt: String(formData.get("readingAt") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/meter?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const readingAt = parseDateInput(parsed.data.readingAt) ?? new Date();
  let error: string | null = null;
  try {
    const photoUrl = await saveUpload(formData.get("photo"), "meter");
    if (!photoUrl) throw new Error("Unggah foto meter listrik");
    await saveMeterReading({
      roomId: contract.roomId,
      contractId: contract.id,
      tenantId: user.tenant.id,
      readingAt,
      currentReading: parsed.data.currentReading,
      photoUrl,
      notes: parsed.data.notes || null,
      source: "tenant",
      autoVerify: false,
      userId: user.id,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menyimpan pembacaan meter";
  }

  if (error) redirect(`/meter?err=${encodeURIComponent(error)}`);
  revalidatePath("/meter");
  revalidatePath("/dashboard");
  redirect("/meter?ok=Pembacaan+meter+dikirim,+menunggu+verifikasi+admin");
}

export async function recordMeterReadingAction(formData: FormData): Promise<void> {
  const roomId = String(formData.get("roomId") ?? "");
  const guard = await guardRoom(roomId);
  if (guard.role === "staff") {
    // staff boleh mencatat, verifikasi oleh admin/owner
  }

  const parsed = meterReadingSchema.safeParse({
    currentReading: formData.get("currentReading") ?? "",
    readingAt: String(formData.get("readingAt") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/meter?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const contract = await prisma.contract.findFirst({
    where: { roomId, status: "active" },
    orderBy: { startDate: "desc" },
    select: { id: true, tenantId: true, electricityStartReading: true },
  });
  const readingAt = parseDateInput(parsed.data.readingAt) ?? new Date();
  const autoVerify = guard.role === "owner" || guard.role === "admin";

  let error: string | null = null;
  let attachedInvoiceId: string | null = null;
  try {
    const photoUrl = await saveUpload(formData.get("photo"), "meter");
    const result = await saveMeterReading({
      roomId,
      contractId: contract?.id ?? null,
      tenantId: contract?.tenantId ?? null,
      readingAt,
      currentReading: parsed.data.currentReading,
      photoUrl,
      notes: parsed.data.notes || null,
      source: guard.role === "staff" ? "staff" : "admin",
      autoVerify,
      userId: guard.userId,
    });
    if (autoVerify) {
      attachedInvoiceId = await attachMeterReadingToInvoice(result.id, guard.userId);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menyimpan pembacaan meter";
  }

  if (error) redirect(`/meter?err=${encodeURIComponent(error)}`);
  revalidatePath("/meter");
  revalidatePath("/tagihan");
  if (attachedInvoiceId) revalidatePath(`/tagihan/${attachedInvoiceId}`);
  redirect(`/meter?ok=Pembacaan+meter+disimpan${autoVerify ? "+dan+diverifikasi" : ""}`);
}

export async function verifyMeterReadingAction(formData: FormData): Promise<void> {
  const readingId = String(formData.get("readingId") ?? "");
  const guard = await guardReading(readingId);
  if (guard.role === "staff") {
    redirect("/meter?err=Hanya+admin/owner+yang+dapat+memverifikasi");
  }

  const raw = String(formData.get("currentReading") ?? "").trim();
  let corrected: number | undefined;
  if (raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      redirect(`/meter?err=${encodeURIComponent("Angka meter koreksi tidak valid")}`);
    }
    corrected = value;
  }

  let error: string | null = null;
  let attachedInvoiceId: string | null = null;
  try {
    await verifyMeterReading(readingId, guard.userId, corrected);
    attachedInvoiceId = await attachMeterReadingToInvoice(readingId, guard.userId);
    await logAudit({
      userId: guard.userId,
      action: "meter.verify",
      entity: "MeterReading",
      entityId: readingId,
      payload: { corrected: corrected ?? null, attachedInvoiceId },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal memverifikasi pembacaan";
  }

  if (error) redirect(`/meter?err=${encodeURIComponent(error)}`);
  revalidatePath("/meter");
  revalidatePath("/tagihan");
  if (attachedInvoiceId) revalidatePath(`/tagihan/${attachedInvoiceId}`);
  redirect("/meter?ok=Pembacaan+meter+diverifikasi");
}

export async function rejectMeterReadingAction(formData: FormData): Promise<void> {
  const readingId = String(formData.get("readingId") ?? "");
  const guard = await guardReading(readingId);
  if (guard.role === "staff") {
    redirect("/meter?err=Hanya+admin/owner+yang+dapat+menolak");
  }

  const parsed = reasonSchema.safeParse(String(formData.get("reason") ?? ""));
  if (!parsed.success) {
    redirect(`/meter?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  let error: string | null = null;
  try {
    await rejectMeterReading(readingId, parsed.data, guard.userId);
    await logAudit({
      userId: guard.userId,
      action: "meter.reject",
      entity: "MeterReading",
      entityId: readingId,
      payload: { reason: parsed.data },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menolak pembacaan";
  }

  if (error) redirect(`/meter?err=${encodeURIComponent(error)}`);
  revalidatePath("/meter");
  redirect("/meter?ok=Pembacaan+meter+ditolak");
}

export async function createBaselineAction(formData: FormData): Promise<void> {
  const roomId = String(formData.get("roomId") ?? "");
  const guard = await guardRoom(roomId);
  if (guard.role === "staff") {
    redirect("/meter?err=Hanya+admin/owner+yang+dapat+menyetel+baseline");
  }

  const parsed = meterReadingSchema.safeParse({
    currentReading: formData.get("currentReading") ?? "",
    readingAt: String(formData.get("readingAt") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/meter?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const readingAt = parseDateInput(parsed.data.readingAt) ?? new Date();
  const contract = await prisma.contract.findFirst({
    where: { roomId, status: "active" },
    orderBy: { startDate: "desc" },
    select: { id: true, tenantId: true },
  });

  let error: string | null = null;
  try {
    await saveMeterReading({
      roomId,
      contractId: contract?.id ?? null,
      tenantId: contract?.tenantId ?? null,
      readingAt,
      currentReading: parsed.data.currentReading,
      photoUrl: null,
      notes: parsed.data.notes || "Baseline meter baru (meter diganti)",
      source: "admin",
      autoVerify: true,
      userId: guard.userId,
      isBaseline: true,
    });
    if (contract) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { electricityStartReading: parsed.data.currentReading },
      });
    }
    await logAudit({
      userId: guard.userId,
      action: "meter.baseline",
      entity: "MeterReading",
      entityId: roomId,
      payload: { roomId, reading: parsed.data.currentReading },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal membuat baseline";
  }

  if (error) redirect(`/meter?err=${encodeURIComponent(error)}`);
  revalidatePath("/meter");
  redirect("/meter?ok=Baseline+meter+baru+disimpan");
}

export async function attachMeterReadingAction(formData: FormData): Promise<void> {
  const readingId = String(formData.get("readingId") ?? "");
  const guard = await guardReading(readingId);
  if (guard.role === "staff") {
    redirect("/meter?err=Akses+ditolak");
  }

  let error: string | null = null;
  let invoiceId: string | null = null;
  try {
    invoiceId = await attachMeterReadingToInvoice(readingId, guard.userId);
    if (!invoiceId) {
      throw new Error(
        "Tidak ada tagihan draft/unpaid untuk periode ini. Buat tagihan terlebih dahulu.",
      );
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menambahkan ke tagihan";
  }

  if (error) redirect(`/meter?err=${encodeURIComponent(error)}`);
  revalidatePath("/meter");
  revalidatePath("/tagihan");
  revalidatePath(`/tagihan/${invoiceId}`);
  redirect("/meter?ok=Pemakaian+listrik+ditambahkan+ke+tagihan");
}
