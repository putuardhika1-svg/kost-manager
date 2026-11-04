"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import {
  propertySchema,
  propertyBillingSchema,
  paymentChannelSchema,
  firstError,
} from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { saveUpload } from "@/lib/upload";

export async function createPropertyAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const parsed = propertySchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect(`/properti?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  let error: string | null = null;

  try {
    const property = await prisma.property.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        address: data.address,
        city: data.city,
        notes: data.notes || null,
      },
    });

    if (user.role !== "owner") {
      await prisma.userProperty.create({
        data: { userId: user.id, propertyId: property.id },
      });
    }

    await logAudit({
      userId: user.id,
      action: "property.create",
      entity: "Property",
      entityId: property.id,
      payload: { name: property.name, code: property.code },
    });
  } catch {
    error = "Gagal menambah properti. Pastikan kode properti belum dipakai.";
  }

  if (error) redirect(`/properti?err=${encodeURIComponent(error)}`);
  revalidatePath("/properti");
  redirect("/properti?ok=Properti+berhasil+ditambahkan");
}

export async function updatePropertyAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const id = String(formData.get("id") ?? "");
  if (id && scope !== null && !scope.includes(id)) {
    redirect("/properti?err=Akses+ditolak");
  }
  const parsed = propertySchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });

  if (!id) redirect("/properti?err=ID+properti+tidak+valid");
  if (!parsed.success) {
    redirect(`/properti/${id}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  let error: string | null = null;

  try {
    await prisma.property.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        address: data.address,
        city: data.city,
        notes: data.notes || null,
      },
    });
    await logAudit({
      userId: user.id,
      action: "property.update",
      entity: "Property",
      entityId: id,
      payload: data,
    });
  } catch {
    error = "Gagal memperbarui properti.";
  }

  if (error) redirect(`/properti/${id}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/properti/${id}`);
  revalidatePath("/properti");
  redirect(`/properti/${id}?ok=Perubahan+disimpan`);
}

async function guardProperty(propertyId: string): Promise<string | null> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  if (scope !== null && !scope.includes(propertyId)) {
    redirect("/properti?err=Akses+ditolak");
  }
  return user.id;
}

export async function updatePropertyBillingAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect("/properti?err=ID+properti+tidak+valid");
  const userId = await guardProperty(propertyId);

  const parsed = propertyBillingSchema.safeParse({
    electricityTariff: formData.get("electricityTariff") ?? 0,
    requireMeterReading: formData.get("requireMeterReading") === "on",
    requireTenantProfile: formData.get("requireTenantProfile") === "on",
  });
  if (!parsed.success) {
    redirect(`/properti/${propertyId}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  await prisma.property.update({
    where: { id: propertyId },
    data: {
      electricityTariff: parsed.data.electricityTariff,
      requireMeterReading: parsed.data.requireMeterReading,
      requireTenantProfile: parsed.data.requireTenantProfile,
    },
  });

  await logAudit({
    userId,
    action: "property.billing.update",
    entity: "Property",
    entityId: propertyId,
    payload: parsed.data,
  });

  revalidatePath(`/properti/${propertyId}`);
  redirect(`/properti/${propertyId}?ok=Pengaturan+listrik+disimpan`);
}

export async function createPaymentChannelAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect("/properti?err=ID+properti+tidak+valid");
  const userId = await guardProperty(propertyId);

  const parsed = paymentChannelSchema.safeParse({
    type: String(formData.get("type") ?? "bank"),
    label: String(formData.get("label") ?? "").trim(),
    bankName: String(formData.get("bankName") ?? "").trim(),
    accountNumber: String(formData.get("accountNumber") ?? "").trim(),
    accountHolder: String(formData.get("accountHolder") ?? "").trim(),
    instructions: String(formData.get("instructions") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/properti/${propertyId}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  if (data.type === "bank" && (!data.bankName || !data.accountNumber || !data.accountHolder)) {
    redirect(
      `/properti/${propertyId}?err=${encodeURIComponent("Nama bank, nomor rekening, dan atas nama wajib diisi")}`,
    );
  }
  if (data.type === "qris" && !formData.get("qris")) {
    redirect(`/properti/${propertyId}?err=${encodeURIComponent("Unggah gambar QRIS")}`);
  }

  let error: string | null = null;
  try {
    const qrisUrl = data.type === "qris" ? await saveUpload(formData.get("qris"), "qris") : null;
    const count = await prisma.paymentChannel.count({ where: { propertyId } });
    const channel = await prisma.paymentChannel.create({
      data: {
        propertyId,
        type: data.type,
        label: data.label,
        bankName: data.bankName || null,
        accountNumber: data.accountNumber || null,
        accountHolder: data.accountHolder || null,
        qrisUrl,
        instructions: data.instructions || null,
        sortOrder: count,
      },
    });

    await logAudit({
      userId,
      action: "payment.channel.create",
      entity: "PaymentChannel",
      entityId: channel.id,
      payload: { propertyId, type: data.type, label: data.label },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menambah metode pembayaran";
  }

  if (error) redirect(`/properti/${propertyId}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/properti/${propertyId}`);
  revalidatePath("/tagihan");
  redirect(`/properti/${propertyId}?ok=Metode+pembayaran+ditambahkan`);
}

export async function deletePropertyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/properti?err=ID+properti+tidak+valid");
  const userId = await guardProperty(id);

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      rooms: {
        select: {
          number: true,
          contracts: { select: { id: true } },
          maintenance: { select: { id: true } },
        },
      },
    },
  });
  if (!property) redirect("/properti?err=Properti+tidak+ditemukan");

  const blocked = property.rooms.find(
    (room) => room.contracts.length > 0 || room.maintenance.length > 0,
  );
  if (blocked) {
    redirect(
      `/properti/${id}?err=${encodeURIComponent(
        "Properti masih memiliki kontrak atau tiket perbaikan. Nonaktifkan kamar dan selesaikan data terkait terlebih dahulu.",
      )}`,
    );
  }

  let error: string | null = null;
  try {
    await prisma.property.delete({ where: { id } });
    await logAudit({
      userId,
      action: "property.delete",
      entity: "Property",
      entityId: id,
      payload: { name: property.name, code: property.code },
    });
  } catch {
    error = "Gagal menghapus properti. Pastikan tidak ada data terkait.";
  }

  if (error) redirect(`/properti/${id}?err=${encodeURIComponent(error)}`);
  revalidatePath("/properti");
  revalidatePath("/dashboard");
  redirect("/properti?ok=Properti+dihapus");
}

export async function updatePaymentChannelAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  if (!propertyId || !channelId) redirect("/properti?err=Data+tidak+valid");
  const userId = await guardProperty(propertyId);

  const channel = await prisma.paymentChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.propertyId !== propertyId) {
    redirect(`/properti/${propertyId}?err=Metode+pembayaran+tidak+ditemukan`);
  }

  const parsed = paymentChannelSchema.safeParse({
    type: String(formData.get("type") ?? "bank"),
    label: String(formData.get("label") ?? "").trim(),
    bankName: String(formData.get("bankName") ?? "").trim(),
    accountNumber: String(formData.get("accountNumber") ?? "").trim(),
    accountHolder: String(formData.get("accountHolder") ?? "").trim(),
    instructions: String(formData.get("instructions") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/properti/${propertyId}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  if (data.type === "bank" && (!data.bankName || !data.accountNumber || !data.accountHolder)) {
    redirect(
      `/properti/${propertyId}?err=${encodeURIComponent("Nama bank, nomor rekening, dan atas nama wajib diisi")}`,
    );
  }

  let error: string | null = null;
  try {
    const uploadedQris = data.type === "qris" ? await saveUpload(formData.get("qris"), "qris") : null;
    if (data.type === "qris" && !uploadedQris && !channel.qrisUrl) {
      throw new Error("Unggah gambar QRIS");
    }

    await prisma.paymentChannel.update({
      where: { id: channelId },
      data: {
        type: data.type,
        label: data.label,
        bankName: data.type === "bank" ? data.bankName || null : null,
        accountNumber: data.type === "bank" ? data.accountNumber || null : null,
        accountHolder: data.type === "bank" ? data.accountHolder || null : null,
        qrisUrl: data.type === "qris" ? uploadedQris ?? channel.qrisUrl : null,
        instructions: data.instructions || null,
      },
    });

    await logAudit({
      userId,
      action: "payment.channel.update",
      entity: "PaymentChannel",
      entityId: channelId,
      payload: { propertyId, type: data.type, label: data.label },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal memperbarui metode pembayaran";
  }

  if (error) redirect(`/properti/${propertyId}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/properti/${propertyId}`);
  redirect(`/properti/${propertyId}?ok=Metode+pembayaran+diperbarui`);
}

export async function deletePaymentChannelAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get("propertyId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  if (!propertyId || !channelId) redirect("/properti?err=Data+tidak+valid");
  const userId = await guardProperty(propertyId);

  const channel = await prisma.paymentChannel.findUnique({
    where: { id: channelId },
    include: { _count: { select: { payments: true } } },
  });
  if (!channel || channel.propertyId !== propertyId) {
    redirect(`/properti/${propertyId}?err=Metode+pembayaran+tidak+ditemukan`);
  }
  if (channel._count.payments > 0) {
    redirect(
      `/properti/${propertyId}?err=${encodeURIComponent(
        "Metode pembayaran sudah dipakai pada pembayaran. Nonaktifkan saja agar riwayat tetap utuh.",
      )}`,
    );
  }

  let error: string | null = null;
  try {
    await prisma.paymentChannel.delete({ where: { id: channelId } });
    await logAudit({
      userId,
      action: "payment.channel.delete",
      entity: "PaymentChannel",
      entityId: channelId,
      payload: { propertyId, label: channel.label },
    });
  } catch {
    error = "Gagal menghapus metode pembayaran.";
  }

  if (error) redirect(`/properti/${propertyId}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/properti/${propertyId}`);
  redirect(`/properti/${propertyId}?ok=Metode+pembayaran+dihapus`);
}

export async function togglePaymentChannelAction(formData: FormData): Promise<void> {
  const channelId = String(formData.get("channelId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!channelId || !propertyId) redirect("/properti?err=Data+tidak+valid");
  const userId = await guardProperty(propertyId);

  const channel = await prisma.paymentChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.propertyId !== propertyId) {
    redirect(`/properti/${propertyId}?err=Metode+pembayaran+tidak+ditemukan`);
  }

  await prisma.paymentChannel.update({
    where: { id: channelId },
    data: { isActive: !channel.isActive },
  });

  await logAudit({
    userId,
    action: "payment.channel.toggle",
    entity: "PaymentChannel",
    entityId: channelId,
    payload: { isActive: !channel.isActive },
  });

  revalidatePath(`/properti/${propertyId}`);
  redirect(`/properti/${propertyId}?ok=Status+metode+pembayaran+diubah`);
}
