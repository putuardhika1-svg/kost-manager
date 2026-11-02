"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole, requireUser } from "@/lib/auth";
import { firstError, maintenanceSchema, maintenanceUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notify";

export async function createMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const isTenant = user.role === "tenant";
  if (!["owner", "admin", "staff", "tenant"].includes(user.role)) {
    redirect("/dashboard?err=Akses+ditolak");
  }

  const parsed = maintenanceSchema.safeParse({
    roomId: String(formData.get("roomId") ?? ""),
    tenantId: String(formData.get("tenantId") ?? ""),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: String(formData.get("category") ?? "umum"),
    priority: String(formData.get("priority") ?? "sedang"),
  });
  if (!parsed.success) {
    redirect(`/maintenance?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const room = await prisma.room.findUnique({
    where: { id: data.roomId },
    include: { property: true },
  });
  if (!room) redirect("/maintenance?err=Kamar+tidak+ditemukan");

  let tenantId: string | null = data.tenantId || null;

  if (isTenant) {
    if (!user.tenant) {
      redirect("/dashboard?err=Akun+belum+terhubung+ke+data+penyewa");
    }
    const activeContract = await prisma.contract.findFirst({
      where: { tenantId: user.tenant.id, roomId: room.id, status: "active" },
      select: { id: true },
    });
    if (!activeContract) {
      redirect(`/maintenance?err=${encodeURIComponent("Anda hanya dapat melaporkan kamar yang sedang disewa")}`);
    }
    tenantId = user.tenant.id;
  } else {
    const scope = await propertyScope(user);
    if (scope !== null && !scope.includes(room.propertyId)) {
      redirect("/maintenance?err=Akses+ditolak");
    }
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
      if (!tenant) redirect("/maintenance?err=Penyewa+tidak+ditemukan");
    }
  }

  let ticketId: string | null = null;
  let error: string | null = null;
  try {
    const ticket = await prisma.maintenance.create({
      data: {
        roomId: room.id,
        tenantId,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        status: "baru",
      },
    });
    ticketId = ticket.id;

    if (data.priority === "tinggi") {
      await sendNotification({
        templateKey: "N-12",
        tenantId: null,
        variables: {
          kamar: `${room.property.name} · ${room.number}`,
          judul: data.title,
        },
      });
    }

    await logAudit({
      userId: user.id,
      action: "maintenance.create",
      entity: "Maintenance",
      entityId: ticket.id,
      payload: { roomId: room.id, priority: data.priority, title: data.title },
    });
  } catch {
    error = "Gagal membuat tiket perbaikan.";
  }

  if (error) redirect(`/maintenance?err=${encodeURIComponent(error)}`);
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  redirect(`/maintenance?ok=Tiket+perbaikan+dibuat${ticketId ? `&id=${ticketId}` : ""}`);
}

export async function updateMaintenanceAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin", "staff"]);
  const scope = await propertyScope(user);
  const ticketId = String(formData.get("ticketId") ?? "");

  const parsed = maintenanceUpdateSchema.safeParse({
    status: String(formData.get("status") ?? "baru"),
    priority: String(formData.get("priority") ?? "sedang"),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    cost: formData.get("cost") ?? 0,
  });
  if (!parsed.success) {
    redirect(`/maintenance?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const ticket = await prisma.maintenance.findUnique({
    where: { id: ticketId },
    include: { room: true },
  });
  if (!ticket) redirect("/maintenance?err=Tiket+tidak+ditemukan");
  if (scope !== null && !scope.includes(ticket.room.propertyId)) {
    redirect("/maintenance?err=Akses+ditolak");
  }

  const data = parsed.data;
  const closed = data.status === "selesai" || data.status === "ditutup";

  await prisma.maintenance.update({
    where: { id: ticketId },
    data: {
      status: data.status,
      priority: data.priority,
      assignedTo: data.assignedTo || null,
      cost: data.cost,
      closedAt: closed ? ticket.closedAt ?? new Date() : null,
    },
  });

  await logAudit({
    userId: user.id,
    action: "maintenance.update",
    entity: "Maintenance",
    entityId: ticketId,
    payload: { from: ticket.status, to: data.status, priority: data.priority, cost: data.cost },
  });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  redirect("/maintenance?ok=Tiket+diperbarui");
}
