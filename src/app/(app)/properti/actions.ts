"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { propertySchema, firstError } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

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
