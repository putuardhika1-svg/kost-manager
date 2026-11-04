"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie, getSession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveUpload } from "@/lib/upload";
import { logAudit } from "@/lib/audit";

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logAudit({ userId: session.sub, action: "auth.logout", entity: "User", entityId: session.sub });
  }
  await clearSessionCookie();
  redirect("/login");
}

async function redirectWithFlash(kind: "err" | "ok", message: string): Promise<never> {
  const referer = (await headers()).get("referer");
  let target = "/dashboard";
  if (referer) {
    try {
      const url = new URL(referer);
      target = `${url.pathname}${url.search}`;
    } catch {
      // referer tidak valid, kembali ke dashboard
    }
  }
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}${kind}=${encodeURIComponent(message)}`);
}

export async function updateAvatarAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  let error: string | null = null;

  try {
    const avatarUrl = await saveUpload(formData.get("avatar"), "avatar");
    if (!avatarUrl) throw new Error("Pilih foto profil terlebih dahulu");
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    await logAudit({
      userId: user.id,
      action: "user.avatar.update",
      entity: "User",
      entityId: user.id,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal mengunggah foto profil";
  }

  if (error) await redirectWithFlash("err", error);
  revalidatePath("/", "layout");
  await redirectWithFlash("ok", "Foto profil diperbarui");
}

export async function removeAvatarAction(): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  await logAudit({
    userId: user.id,
    action: "user.avatar.remove",
    entity: "User",
    entityId: user.id,
  });
  revalidatePath("/", "layout");
  await redirectWithFlash("ok", "Foto profil dihapus");
}
