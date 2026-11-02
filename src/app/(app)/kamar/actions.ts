"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { roomSchema, firstError } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function createRoomAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);

  const parsed = roomSchema.safeParse({
    propertyId: String(formData.get("propertyId") ?? ""),
    number: String(formData.get("number") ?? "").trim(),
    floor: formData.get("floor") ?? 1,
    type: String(formData.get("type") ?? "").trim(),
    monthlyPrice: formData.get("monthlyPrice") ?? 0,
    status: String(formData.get("status") ?? "kosong"),
    facilities: String(formData.get("facilities") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect(`/kamar?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const data = parsed.data;
  const back = `/kamar?propertyId=${data.propertyId}`;

  if (scope !== null && !scope.includes(data.propertyId)) {
    redirect(`/kamar?err=${encodeURIComponent("Anda tidak memiliki akses ke properti tersebut")}`);
  }
  if (data.status === "terisi") {
    redirect(`/kamar?err=${encodeURIComponent("Status terisi hanya dapat diset melalui kontrak aktif")}`);
  }

  let error: string | null = null;
  try {
    const room = await prisma.room.create({
      data: {
        propertyId: data.propertyId,
        number: data.number,
        floor: data.floor,
        type: data.type || null,
        monthlyPrice: data.monthlyPrice,
        status: data.status,
        facilities: data.facilities
          ? JSON.stringify(
              data.facilities
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            )
          : null,
      },
    });
    await logAudit({
      userId: user.id,
      action: "room.create",
      entity: "Room",
      entityId: room.id,
      payload: { number: room.number, propertyId: room.propertyId },
    });
  } catch {
    error = "Gagal menambah kamar. Nomor kamar mungkin sudah dipakai di properti ini.";
  }

  if (error) redirect(`${back}&err=${encodeURIComponent(error)}`);
  revalidatePath("/kamar");
  redirect(`${back}&ok=Kamar+berhasil+ditambahkan`);
}

export async function changeRoomStatusAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const roomId = String(formData.get("roomId") ?? "");
  const status = String(formData.get("status") ?? "");

  const allowed = ["kosong", "booked", "perbaikan", "nonaktif", "terisi"];
  if (!allowed.includes(status)) {
    redirect(`/kamar?err=${encodeURIComponent("Status kamar tidak valid")}`);
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { contracts: { where: { status: "active" } } },
  });
  if (!room) redirect("/kamar?err=Kamar+tidak+ditemukan");
  if (scope !== null && !scope.includes(room.propertyId)) {
    redirect("/kamar?err=Akses+ditolak");
  }

  const hasActiveContract = room.contracts.length > 0;
  if (status === "terisi" && !hasActiveContract) {
    redirect(
      `/kamar?err=${encodeURIComponent("Status terisi hanya dapat diset melalui kontrak aktif")}`,
    );
  }
  if (hasActiveContract && status !== "terisi") {
    redirect(
      `/kamar?err=${encodeURIComponent("Akhiri kontrak aktif terlebih dahulu sebelum mengubah status kamar")}`,
    );
  }

  await prisma.room.update({ where: { id: room.id }, data: { status } });
  await logAudit({
    userId: user.id,
    action: "room.status",
    entity: "Room",
    entityId: room.id,
    payload: { from: room.status, to: status },
  });

  revalidatePath("/kamar");
  redirect(`/kamar?ok=Status+kamar+${encodeURIComponent(room.number)}+diperbarui`);
}
