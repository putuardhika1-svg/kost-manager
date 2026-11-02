"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { rejectPayment, verifyPayment } from "@/lib/billing";

async function guardPayment(paymentId: string): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  if (scope === null) return;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      invoice: { select: { contract: { select: { room: { select: { propertyId: true } } } } } },
    },
  });
  const propertyId = payment?.invoice.contract.room.propertyId;
  if (!propertyId || !scope.includes(propertyId)) {
    redirect("/pembayaran?err=Akses+ditolak");
  }
}

export async function verifyPaymentAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("paymentId") ?? "");
  await guardPayment(paymentId);

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await verifyPayment(paymentId, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal memverifikasi pembayaran";
  }

  if (error) redirect(`/pembayaran?err=${encodeURIComponent(error)}`);
  revalidatePath("/pembayaran");
  revalidatePath("/tagihan");
  revalidatePath("/dashboard");
  redirect("/pembayaran?ok=Pembayaran+diverifikasi");
}

export async function rejectPaymentAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("paymentId") ?? "");
  await guardPayment(paymentId);
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) {
    redirect(`/pembayaran?err=${encodeURIComponent("Alasan penolakan minimal 5 karakter")}`);
  }

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await rejectPayment(paymentId, reason, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menolak pembayaran";
  }

  if (error) redirect(`/pembayaran?err=${encodeURIComponent(error)}`);
  revalidatePath("/pembayaran");
  revalidatePath("/tagihan");
  redirect("/pembayaran?ok=Pembayaran+ditolak");
}
