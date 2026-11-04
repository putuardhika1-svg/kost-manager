"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { tenantSchema, tenantStatusSchema, firstError } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function createTenantAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);

  const parsed = tenantSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    idNumber: String(formData.get("idNumber") ?? "").trim(),
    emergencyContact: String(formData.get("emergencyContact") ?? "").trim(),
    addressOrigin: String(formData.get("addressOrigin") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect(`/penyewa?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const existing = await prisma.tenant.findFirst({
    where: { phone: data.phone },
    select: { id: true, name: true },
  });

  if (existing) {
    redirect(
      `/penyewa?err=${encodeURIComponent(`Nomor telepon sudah terdaftar untuk ${existing.name}`)}`,
    );
  }

  let error: string | null = null;
  try {
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        idNumber: data.idNumber || null,
        emergencyContact: data.emergencyContact || null,
        addressOrigin: data.addressOrigin || null,
      },
    });
    await logAudit({
      userId: user.id,
      action: "tenant.create",
      entity: "Tenant",
      entityId: tenant.id,
      payload: { name: tenant.name },
    });
  } catch {
    error = "Gagal menambah penyewa.";
  }

  if (error) redirect(`/penyewa?err=${encodeURIComponent(error)}`);
  revalidatePath("/penyewa");
  redirect("/penyewa?ok=Penyewa+berhasil+ditambahkan");
}

export async function updateTenantAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const id = String(formData.get("id") ?? "");

  const existingTenant = id
    ? await prisma.tenant.findUnique({
        where: { id },
        include: {
          contracts: { select: { room: { select: { propertyId: true } } } },
        },
      })
    : null;
  if (!existingTenant) redirect("/penyewa?err=Penyewa+tidak+ditemukan");
  if (scope !== null) {
    const allowed =
      existingTenant.contracts.length === 0 ||
      existingTenant.contracts.some((contract) => scope.includes(contract.room.propertyId));
    if (!allowed) redirect("/penyewa?err=Akses+ditolak");
  }

  const parsed = tenantSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    idNumber: String(formData.get("idNumber") ?? "").trim(),
    emergencyContact: String(formData.get("emergencyContact") ?? "").trim(),
    addressOrigin: String(formData.get("addressOrigin") ?? "").trim(),
  });

  if (!id) redirect("/penyewa?err=ID+penyewa+tidak+valid");
  if (!parsed.success) {
    redirect(`/penyewa/${id}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const phoneUsed = await prisma.tenant.findFirst({
    where: { phone: data.phone, NOT: { id } },
    select: { name: true },
  });
  if (phoneUsed) {
    redirect(
      `/penyewa/${id}?err=${encodeURIComponent(`Nomor telepon sudah terdaftar untuk ${phoneUsed.name}`)}`,
    );
  }

  let error: string | null = null;
  try {
    await prisma.tenant.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        idNumber: data.idNumber || null,
        emergencyContact: data.emergencyContact || null,
        addressOrigin: data.addressOrigin || null,
      },
    });
    await logAudit({
      userId: user.id,
      action: "tenant.update",
      entity: "Tenant",
      entityId: id,
      payload: data,
    });
  } catch {
    error = "Gagal memperbarui penyewa. Nomor telepon mungkin sudah dipakai.";
  }

  if (error) redirect(`/penyewa/${id}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/penyewa/${id}`);
  redirect(`/penyewa/${id}?ok=Perubahan+disimpan`);
}

export async function setTenantStatusAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/penyewa?err=ID+penyewa+tidak+valid");

  const parsed = tenantStatusSchema.safeParse({
    status: String(formData.get("status") ?? "aktif"),
  });
  if (!parsed.success) {
    redirect(`/penyewa/${id}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { contracts: { select: { room: { select: { propertyId: true } } } } },
  });
  if (!tenant) redirect("/penyewa?err=Penyewa+tidak+ditemukan");
  if (scope !== null) {
    const allowed =
      tenant.contracts.length === 0 ||
      tenant.contracts.some((contract) => scope.includes(contract.room.propertyId));
    if (!allowed) redirect("/penyewa?err=Akses+ditolak");
  }

  await prisma.tenant.update({ where: { id }, data: { status: parsed.data.status } });
  await logAudit({
    userId: user.id,
    action: "tenant.status",
    entity: "Tenant",
    entityId: id,
    payload: { from: tenant.status, to: parsed.data.status },
  });

  revalidatePath(`/penyewa/${id}`);
  revalidatePath("/penyewa");
  redirect(`/penyewa/${id}?ok=Status+penyewa+diperbarui`);
}

export async function deleteTenantAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/penyewa?err=ID+penyewa+tidak+valid");

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      contracts: { select: { id: true, room: { select: { propertyId: true } } } },
    },
  });
  if (!tenant) redirect("/penyewa?err=Penyewa+tidak+ditemukan");
  if (scope !== null) {
    const allowed =
      tenant.contracts.length === 0 ||
      tenant.contracts.some((contract) => scope.includes(contract.room.propertyId));
    if (!allowed) redirect("/penyewa?err=Akses+ditolak");
  }
  if (tenant.contracts.length > 0) {
    redirect(
      `/penyewa/${id}?err=${encodeURIComponent(
        "Penyewa memiliki riwayat kontrak. Nonaktifkan penyewa agar riwayat tetap utuh.",
      )}`,
    );
  }

  let error: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenance.updateMany({ where: { tenantId: id }, data: { tenantId: null } });
      await tx.meterReading.updateMany({ where: { tenantId: id }, data: { tenantId: null } });
      await tx.notificationLog.updateMany({ where: { tenantId: id }, data: { tenantId: null } });
      await tx.tenant.delete({ where: { id } });
    });
    await logAudit({
      userId: user.id,
      action: "tenant.delete",
      entity: "Tenant",
      entityId: id,
      payload: { name: tenant.name, phone: tenant.phone },
    });
  } catch {
    error = "Gagal menghapus penyewa. Pastikan tidak ada data terkait.";
  }

  if (error) redirect(`/penyewa/${id}?err=${encodeURIComponent(error)}`);
  revalidatePath("/penyewa");
  redirect("/penyewa?ok=Penyewa+dihapus");
}
