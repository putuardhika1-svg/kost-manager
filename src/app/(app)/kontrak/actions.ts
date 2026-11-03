"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { contractSchema, firstError, reasonSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { logAudit } from "@/lib/audit";
import { sendContractExpiryReminder } from "@/lib/billing";

export async function createContractAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);

  const parsed = contractSchema.safeParse({
    tenantId: String(formData.get("tenantId") ?? ""),
    roomId: String(formData.get("roomId") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    rentAmount: formData.get("rentAmount") ?? 0,
    deposit: formData.get("deposit") ?? 0,
    billingDay: formData.get("billingDay") ?? 1,
    electricityStartReading: formData.get("electricityStartReading") ?? 0,
    notes: String(formData.get("notes") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect(`/kontrak?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const startDate = parseDateInput(data.startDate);
  const endDate = parseDateInput(data.endDate);
  if (!startDate || !endDate) {
    redirect(`/kontrak?err=${encodeURIComponent("Format tanggal tidak valid")}`);
  }

  const [room, tenant] = await Promise.all([
    prisma.room.findUnique({ where: { id: data.roomId } }),
    prisma.tenant.findUnique({ where: { id: data.tenantId }, select: { id: true, status: true } }),
  ]);
  if (!room) redirect("/kontrak?err=Kamar+tidak+ditemukan");
  if (!tenant) redirect("/kontrak?err=Penyewa+tidak+ditemukan");
  if (tenant.status !== "aktif") {
    redirect(`/kontrak?err=${encodeURIComponent("Penyewa tidak aktif")}`);
  }
  if (scope !== null && !scope.includes(room.propertyId)) {
    redirect("/kontrak?err=Akses+ditolak");
  }
  if (room.status === "nonaktif" || room.status === "perbaikan") {
    redirect(`/kontrak?err=${encodeURIComponent("Kamar sedang nonaktif/diperbaikan")}`);
  }
  if (room.status === "booked") {
    redirect(
      `/kontrak?err=${encodeURIComponent("Kamar sedang dalam proses pendaftaran penyewa")}`,
    );
  }

  const conflict = await prisma.contract.findFirst({
    where: {
      roomId: data.roomId,
      status: { in: ["active", "pending"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  if (conflict) {
    redirect(
      `/kontrak?err=${encodeURIComponent("Kamar masih memiliki kontrak aktif pada periode tersebut")}`,
    );
  }

  let error: string | null = null;
  let contractId: string | null = null;
  try {
    contractId = await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          tenantId: data.tenantId,
          roomId: data.roomId,
          startDate,
          endDate,
          rentAmount: data.rentAmount,
          deposit: data.deposit,
          billingDay: data.billingDay,
          electricityStartReading: data.electricityStartReading ?? 0,
          notes: data.notes || null,
        },
      });
      await tx.room.update({ where: { id: data.roomId }, data: { status: "terisi" } });
      return contract.id;
    });
  } catch {
    error = "Gagal membuat kontrak. Periksa kembali data yang diisi.";
  }

  if (error || !contractId) {
    redirect(`/kontrak?err=${encodeURIComponent(error ?? "Gagal membuat kontrak")}`);
  }

  await logAudit({
    userId: user.id,
    action: "contract.create",
    entity: "Contract",
    entityId: contractId,
    payload: { roomId: data.roomId, tenantId: data.tenantId, rentAmount: data.rentAmount },
  });

  revalidatePath("/kontrak");
  revalidatePath("/kamar");
  redirect("/kontrak?ok=Kontrak+berhasil+dibuat");
}

export async function endContractAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const contractId = String(formData.get("contractId") ?? "");
  const rawDeduction = Number(formData.get("deduction") ?? 0);
  const deduction = Number.isFinite(rawDeduction) ? Math.max(0, Math.floor(rawDeduction)) : 0;
  const roomStatusAfter = String(formData.get("roomStatusAfter") ?? "kosong");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { room: true, tenant: true },
  });
  if (!contract) redirect("/kontrak?err=Kontrak+tidak+ditemukan");
  if (scope !== null && !scope.includes(contract.room.propertyId)) {
    redirect("/kontrak?err=Akses+ditolak");
  }
  if (contract.status !== "active") {
    redirect("/kontrak?err=Kontrak+tidak+aktif");
  }
  if (deduction > contract.deposit) {
    redirect(
      `/kontrak?err=${encodeURIComponent("Potongan deposit tidak boleh melebihi nilai deposit")}`,
    );
  }
  if (!["kosong", "perbaikan"].includes(roomStatusAfter)) {
    redirect("/kontrak?err=Status+kamar+tidak+valid");
  }

  const depositReturned = contract.deposit - deduction;

  let error: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: "ended",
          endedAt: new Date(),
          depositDeduction: deduction,
          depositReturned,
        },
      });
      await tx.room.update({ where: { id: contract.roomId }, data: { status: roomStatusAfter } });
    });
  } catch {
    error = "Gagal mengakhiri kontrak.";
  }

  if (error) redirect(`/kontrak?err=${encodeURIComponent(error)}`);

  await logAudit({
    userId: user.id,
    action: "contract.end",
    entity: "Contract",
    entityId: contractId,
    payload: { deduction, depositReturned, roomStatusAfter },
  });

  revalidatePath("/kontrak");
  revalidatePath("/kamar");
  redirect(`/kontrak?ok=Kontrak+${encodeURIComponent(contract.tenant.name)}+telah+diakhiri`);
}

export async function sendContractReminderAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const contractId = String(formData.get("contractId") ?? "");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { room: true },
  });
  if (!contract) redirect("/kontrak?err=Kontrak+tidak+ditemukan");
  if (scope !== null && !scope.includes(contract.room.propertyId)) {
    redirect("/kontrak?err=Akses+ditolak");
  }

  let error: string | null = null;
  try {
    await sendContractExpiryReminder(contractId, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal mengirim pengingat";
  }

  if (error) redirect(`/kontrak?err=${encodeURIComponent(error)}`);
  revalidatePath("/kontrak");
  redirect("/kontrak?ok=Pengingat+masa+sewa+dikirim");
}

export async function approveRegistrationAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const contractId = String(formData.get("contractId") ?? "");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { room: true, tenant: true },
  });
  if (!contract) redirect("/kontrak?status=pending&err=Kontrak+tidak+ditemukan");
  if (scope !== null && !scope.includes(contract.room.propertyId)) {
    redirect("/kontrak?status=pending&err=Akses+ditolak");
  }
  if (contract.status !== "pending") {
    redirect("/kontrak?status=pending&err=Pendaftaran+sudah+diproses");
  }

  const parsed = contractSchema.safeParse({
    tenantId: contract.tenantId,
    roomId: contract.roomId,
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    rentAmount: formData.get("rentAmount") ?? 0,
    deposit: formData.get("deposit") ?? 0,
    billingDay: formData.get("billingDay") ?? 1,
    electricityStartReading: formData.get("electricityStartReading") ?? 0,
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/kontrak?status=pending&err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const startDate = parseDateInput(data.startDate);
  const endDate = parseDateInput(data.endDate);
  if (!startDate || !endDate) {
    redirect(`/kontrak?status=pending&err=${encodeURIComponent("Format tanggal tidak valid")}`);
  }

  const conflict = await prisma.contract.findFirst({
    where: {
      roomId: contract.roomId,
      status: "active",
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  });
  if (conflict) {
    redirect(
      `/kontrak?status=pending&err=${encodeURIComponent("Kamar sudah memiliki kontrak aktif pada periode tersebut")}`,
    );
  }

  let error: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.room.updateMany({
        where: { id: contract.roomId, status: { in: ["booked", "kosong"] } },
        data: { status: "terisi" },
      });
      if (claimed.count !== 1) {
        throw new Error("Kamar tidak tersedia untuk disetujui");
      }
      await tx.contract.update({
        where: { id: contractId },
        data: {
          startDate,
          endDate,
          rentAmount: data.rentAmount,
          deposit: data.deposit,
          billingDay: data.billingDay,
          electricityStartReading: data.electricityStartReading ?? 0,
          notes: data.notes || "Pendaftaran disetujui owner",
          status: "active",
        },
      });
      await tx.tenant.update({
        where: { id: contract.tenantId },
        data: { status: "aktif" },
      });
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menyetujui pendaftaran";
  }

  if (error) redirect(`/kontrak?status=pending&err=${encodeURIComponent(error)}`);

  await logAudit({
    userId: user.id,
    action: "contract.approve",
    entity: "Contract",
    entityId: contractId,
    payload: {
      roomId: contract.roomId,
      tenantId: contract.tenantId,
      rentAmount: data.rentAmount,
      deposit: data.deposit,
    },
  });

  revalidatePath("/kontrak");
  revalidatePath("/kamar");
  revalidatePath("/dashboard");
  revalidatePath("/penyewa");
  redirect(
    `/kontrak?status=active&ok=${encodeURIComponent(
      `Pendaftaran ${contract.tenant.name} disetujui. Kamar ${contract.room.number} aktif.`,
    )}`,
  );
}

export async function rejectRegistrationAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const contractId = String(formData.get("contractId") ?? "");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { room: true, tenant: true },
  });
  if (!contract) redirect("/kontrak?status=pending&err=Kontrak+tidak+ditemukan");
  if (scope !== null && !scope.includes(contract.room.propertyId)) {
    redirect("/kontrak?status=pending&err=Akses+ditolak");
  }
  if (contract.status !== "pending") {
    redirect("/kontrak?status=pending&err=Pendaftaran+sudah+diproses");
  }

  const parsedReason = reasonSchema.safeParse(String(formData.get("reason") ?? "").trim());
  if (!parsedReason.success) {
    redirect(`/kontrak?status=pending&err=${encodeURIComponent(firstError(parsedReason.error))}`);
  }

  const reason = parsedReason.data;
  let error: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: "cancelled",
          endedAt: new Date(),
          notes: `${contract.notes ? `${contract.notes} | ` : ""}Ditolak owner: ${reason}`,
        },
      });
      await tx.room.updateMany({
        where: { id: contract.roomId, status: "booked" },
        data: { status: "kosong" },
      });
    });
  } catch {
    error = "Gagal menolak pendaftaran";
  }

  if (error) redirect(`/kontrak?status=pending&err=${encodeURIComponent(error)}`);

  await logAudit({
    userId: user.id,
    action: "contract.reject",
    entity: "Contract",
    entityId: contractId,
    payload: { roomId: contract.roomId, tenantId: contract.tenantId, reason },
  });

  revalidatePath("/kontrak");
  revalidatePath("/kamar");
  revalidatePath("/daftar");
  redirect(`/kontrak?status=pending&ok=${encodeURIComponent("Pendaftaran ditolak")}`);
}

