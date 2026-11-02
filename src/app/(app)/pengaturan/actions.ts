"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import {
  firstError,
  passwordResetSchema,
  userSchema,
  userUpdateSchema,
} from "@/lib/validation";
import { logAudit } from "@/lib/audit";

function propertyIdsFrom(formData: FormData): string[] {
  return formData
    .getAll("propertyIds")
    .map((value) => String(value))
    .filter(Boolean);
}

async function ensureTenantLink(tenantId: string | null, excludeUserId?: string): Promise<void> {
  if (!tenantId) return;
  const linked = await prisma.user.findFirst({
    where: { tenantId, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
    select: { id: true },
  });
  if (linked) {
    redirect(`/pengaturan?err=${encodeURIComponent("Penyewa tersebut sudah terhubung ke akun lain")}`);
  }
}

export async function createUserAction(formData: FormData): Promise<void> {
  const owner = await requireRole(["owner"]);
  const parsed = userSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? "staff"),
    phone: String(formData.get("phone") ?? "").trim(),
    tenantId: String(formData.get("tenantId") ?? ""),
    propertyIds: propertyIdsFrom(formData),
  });
  if (!parsed.success) {
    redirect(`/pengaturan?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const tenantId = data.role === "tenant" ? data.tenantId || null : null;
  if (data.role === "tenant" && !tenantId) {
    redirect(`/pengaturan?err=${encodeURIComponent("Pilih data penyewa untuk peran tenant")}`);
  }
  await ensureTenantLink(tenantId);

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    redirect(`/pengaturan?err=${encodeURIComponent("Email sudah digunakan")}`);
  }

  let error: string | null = null;
  try {
    const passwordHash = await hashPassword(data.password);
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        phone: data.phone || null,
        role: data.role,
        tenantId,
      },
    });

    if (data.role !== "owner" && data.role !== "tenant" && data.propertyIds?.length) {
      await prisma.userProperty.createMany({
        data: data.propertyIds.map((propertyId) => ({ userId: created.id, propertyId })),
      });
    }

    await logAudit({
      userId: owner.id,
      action: "user.create",
      entity: "User",
      entityId: created.id,
      payload: { email: created.email, role: created.role, tenantId },
    });
  } catch {
    error = "Gagal membuat pengguna.";
  }

  if (error) redirect(`/pengaturan?err=${encodeURIComponent(error)}`);
  revalidatePath("/pengaturan");
  redirect("/pengaturan?ok=Pengguna+berhasil+dibuat");
}

export async function updateUserAction(formData: FormData): Promise<void> {
  const owner = await requireRole(["owner"]);
  const userId = String(formData.get("userId") ?? "");
  const parsed = userUpdateSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    role: String(formData.get("role") ?? "staff"),
    phone: String(formData.get("phone") ?? "").trim(),
    isActive: formData.get("isActive") === "on",
    tenantId: String(formData.get("tenantId") ?? ""),
    propertyIds: propertyIdsFrom(formData),
  });
  if (!userId) redirect("/pengaturan?err=ID+pengguna+tidak+valid");
  if (!parsed.success) {
    redirect(`/pengaturan?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) redirect("/pengaturan?err=Pengguna+tidak+ditemukan");

  if (target.id === owner.id && (!parsed.data.isActive || parsed.data.role !== "owner")) {
    redirect(
      `/pengaturan?err=${encodeURIComponent("Tidak dapat menonaktifkan atau mengubah peran akun sendiri")}`,
    );
  }

  if (target.role === "owner" && parsed.data.role !== "owner") {
    const owners = await prisma.user.count({ where: { role: "owner", isActive: true } });
    if (owners <= 1) {
      redirect(`/pengaturan?err=${encodeURIComponent("Minimal harus ada satu owner aktif")}`);
    }
  }

  const data = parsed.data;
  const tenantId = data.role === "tenant" ? data.tenantId || null : null;
  if (data.role === "tenant" && !tenantId) {
    redirect(`/pengaturan?err=${encodeURIComponent("Pilih data penyewa untuk peran tenant")}`);
  }
  await ensureTenantLink(tenantId, userId);

  let error: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          role: data.role,
          phone: data.phone || null,
          isActive: data.isActive,
          tenantId,
        },
      });

      await tx.userProperty.deleteMany({ where: { userId } });
      if (data.role !== "owner" && data.role !== "tenant" && data.propertyIds?.length) {
        await tx.userProperty.createMany({
          data: data.propertyIds.map((propertyId) => ({ userId, propertyId })),
        });
      }
    });

    await logAudit({
      userId: owner.id,
      action: "user.update",
      entity: "User",
      entityId: userId,
      payload: { role: data.role, isActive: data.isActive, tenantId },
    });
  } catch {
    error = "Gagal memperbarui pengguna.";
  }

  if (error) redirect(`/pengaturan?err=${encodeURIComponent(error)}`);
  revalidatePath("/pengaturan");
  redirect("/pengaturan?ok=Pengguna+diperbarui");
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const owner = await requireRole(["owner"]);
  const userId = String(formData.get("userId") ?? "");
  const parsed = passwordResetSchema.safeParse(String(formData.get("password") ?? ""));
  if (!userId) redirect("/pengaturan?err=ID+pengguna+tidak+valid");
  if (!parsed.success) {
    redirect(`/pengaturan?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) redirect("/pengaturan?err=Pengguna+tidak+ditemukan");

  let error: string | null = null;
  try {
    const passwordHash = await hashPassword(parsed.data);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await logAudit({
      userId: owner.id,
      action: "user.password.reset",
      entity: "User",
      entityId: userId,
    });
  } catch {
    error = "Gagal mereset password.";
  }

  if (error) redirect(`/pengaturan?err=${encodeURIComponent(error)}`);
  revalidatePath("/pengaturan");
  redirect("/pengaturan?ok=Password+diperbarui");
}
