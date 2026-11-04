"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { paymentSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import { recomputeInvoice, rejectPayment, verifyPayment } from "@/lib/billing";
import { logAudit } from "@/lib/audit";

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

export async function updatePaymentAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("paymentId") ?? "");
  await guardPayment(paymentId);

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        include: {
          contract: { select: { room: { select: { propertyId: true } } } },
          payments: {
            where: { status: { in: ["pending", "verified"] }, NOT: { id: paymentId } },
            select: { amount: true },
          },
        },
      },
    },
  });
  if (!payment) redirect("/pembayaran?err=Pembayaran+tidak+ditemukan");
  if (payment.status !== "pending") {
    redirect("/pembayaran?err=Hanya+pembayaran+pending+yang+dapat+diubah");
  }

  const parsed = paymentSchema.safeParse({
    invoiceId: payment.invoiceId,
    method: String(formData.get("method") ?? "transfer"),
    channelId: String(formData.get("channelId") ?? ""),
    amount: formData.get("amount") ?? 0,
    paidAt: String(formData.get("paidAt") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/pembayaran?err=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Data tidak valid")}`);
  }

  const committed = payment.invoice.payments.reduce((sum, row) => sum + row.amount, 0);
  const outstanding = payment.invoice.total - payment.invoice.paidTotal - committed;
  if (parsed.data.amount > outstanding) {
    redirect(
      `/pembayaran?err=${encodeURIComponent(
        "Nominal melebihi sisa tagihan setelah pembayaran lain.",
      )}`,
    );
  }

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    const channelId = parsed.data.channelId || payment.channelId || null;
    let method: string = parsed.data.method;
    if (channelId) {
      const channel = await prisma.paymentChannel.findUnique({
        where: { id: channelId },
        select: { type: true, isActive: true, propertyId: true },
      });
      if (
        !channel ||
        !channel.isActive ||
        channel.propertyId !== payment.invoice.contract.room.propertyId
      ) {
        throw new Error("Metode pembayaran tidak valid/nonaktif");
      }
      method = channel.type === "bank" ? "transfer" : channel.type;
    }
    const paidAt = parseDateInput(parsed.data.paidAt) ?? payment.paidAt;

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        method,
        channelId,
        amount: parsed.data.amount,
        paidAt,
        notes: parsed.data.notes || null,
      },
    });
    await recomputeInvoice(payment.invoiceId);
    await logAudit({
      userId: user.id,
      action: "payment.update",
      entity: "Payment",
      entityId: paymentId,
      payload: {
        invoiceId: payment.invoiceId,
        amount: parsed.data.amount,
        method,
        paidAt: paidAt.toISOString(),
      },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal memperbarui pembayaran";
  }

  if (error) redirect(`/pembayaran?err=${encodeURIComponent(error)}`);
  revalidatePath("/pembayaran");
  revalidatePath("/tagihan");
  redirect("/pembayaran?ok=Pembayaran+diperbarui");
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("paymentId") ?? "");
  await guardPayment(paymentId);

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Pembayaran tidak ditemukan");
    if (payment.status === "verified") {
      throw new Error("Pembayaran terverifikasi tidak dapat dihapus.");
    }

    await prisma.payment.delete({ where: { id: paymentId } });
    await recomputeInvoice(payment.invoiceId);
    await logAudit({
      userId: user.id,
      action: "payment.delete",
      entity: "Payment",
      entityId: paymentId,
      payload: { invoiceId: payment.invoiceId, amount: payment.amount, status: payment.status },
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menghapus pembayaran";
  }

  if (error) redirect(`/pembayaran?err=${encodeURIComponent(error)}`);
  revalidatePath("/pembayaran");
  revalidatePath("/tagihan");
  redirect("/pembayaran?ok=Pembayaran+dihapus");
}
