"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { propertyScope, requireRole } from "@/lib/auth";
import { firstError, generateSchema, invoiceItemSchema, paymentSchema } from "@/lib/validation";
import { parseDateInput } from "@/lib/dates";
import {
  addInvoiceItem,
  generateInvoices,
  publishInvoice,
  recordPayment,
  removeInvoiceItem,
  sendReminder,
  voidInvoice,
} from "@/lib/billing";
import { saveUpload } from "@/lib/upload";

async function invoicePropertyId(invoiceId: string): Promise<string | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { contract: { select: { room: { select: { propertyId: true } } } } },
  });
  return invoice?.contract.room.propertyId ?? null;
}

async function guardManageInvoice(invoiceId: string): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  if (scope === null) return;
  const propertyId = await invoicePropertyId(invoiceId);
  if (!propertyId || !scope.includes(propertyId)) {
    redirect("/tagihan?err=Akses+ditolak");
  }
}

export async function generateInvoicesAction(formData: FormData): Promise<void> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);

  const parsed = generateSchema.safeParse({
    year: formData.get("year") ?? 0,
    month: formData.get("month") ?? 0,
    propertyId: String(formData.get("propertyId") ?? ""),
  });
  if (!parsed.success) {
    redirect(`/tagihan?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  const propertyId = parsed.data.propertyId || null;
  if (propertyId && scope !== null && !scope.includes(propertyId)) {
    redirect("/tagihan?err=Akses+ditolak");
  }
  if (!propertyId && scope !== null) {
    redirect(`/tagihan?err=${encodeURIComponent("Pilih properti terlebih dahulu")}`);
  }

  let error: string | null = null;
  let result: { created: number; skipped: number } = { created: 0, skipped: 0 };
  try {
    result = await generateInvoices({
      year: parsed.data.year,
      month: parsed.data.month,
      propertyId,
      userId: user.id,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal membuat tagihan. Silakan coba lagi.";
  }

  if (error) redirect(`/tagihan?err=${encodeURIComponent(error)}`);

  revalidatePath("/tagihan");
  revalidatePath("/dashboard");
  const period = `${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}`;
  redirect(
    `/tagihan?period=${period}&ok=${encodeURIComponent(
      `${result.created} tagihan dibuat, ${result.skipped} dilewati (sudah ada/tidak memenuhi periode)`,
    )}`,
  );
}

export async function publishInvoiceAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await guardManageInvoice(invoiceId);

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await publishInvoice(invoiceId, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menerbitkan tagihan";
  }

  if (error) redirect(`/tagihan?err=${encodeURIComponent(error)}`);
  revalidatePath("/tagihan");
  redirect("/tagihan?ok=Tagihan+diterbitkan+dan+notifikasi+dikirim");
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await guardManageInvoice(invoiceId);
  const reason = String(formData.get("reason") ?? "").trim();

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await voidInvoice(invoiceId, reason, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal membatalkan tagihan";
  }

  if (error) redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(error)}`);
  revalidatePath("/tagihan");
  redirect(`/tagihan/${invoiceId}?ok=Tagihan+dibatalkan`);
}

export async function addItemAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await guardManageInvoice(invoiceId);

  const parsed = invoiceItemSchema.safeParse({
    description: String(formData.get("description") ?? "").trim(),
    type: String(formData.get("type") ?? "other"),
    amount: formData.get("amount") ?? 0,
  });
  if (!parsed.success) {
    redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await addInvoiceItem({ invoiceId, ...parsed.data }, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menambah item";
  }

  if (error) redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/tagihan/${invoiceId}`);
  redirect(`/tagihan/${invoiceId}?ok=Item+ditambahkan`);
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await guardManageInvoice(invoiceId);

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await removeInvoiceItem(itemId, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal menghapus item";
  }

  if (error) redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/tagihan/${invoiceId}`);
  redirect(`/tagihan/${invoiceId}?ok=Item+dihapus`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await guardManageInvoice(invoiceId);

  const parsed = paymentSchema.safeParse({
    invoiceId,
    method: String(formData.get("method") ?? "transfer"),
    amount: formData.get("amount") ?? 0,
    paidAt: String(formData.get("paidAt") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    const proofUrl = await saveUpload(formData.get("proof"), "bukti");
    const paidAt = parseDateInput(parsed.data.paidAt) ?? new Date();
    await recordPayment(
      {
        invoiceId,
        method: parsed.data.method,
        amount: parsed.data.amount,
        paidAt,
        proofUrl,
        notes: parsed.data.notes || null,
      },
      user.id,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal mencatat pembayaran";
  }

  if (error) redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(error)}`);
  revalidatePath("/tagihan");
  revalidatePath(`/tagihan/${invoiceId}`);
  redirect(`/tagihan/${invoiceId}?ok=Pembayaran+tercatat`);
}

export async function sendReminderAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  await guardManageInvoice(invoiceId);

  let error: string | null = null;
  try {
    const user = await requireRole(["owner", "admin"]);
    await sendReminder(invoiceId, user.id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal mengirim pengingat";
  }

  if (error) redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(error)}`);
  revalidatePath(`/tagihan/${invoiceId}`);
  redirect(`/tagihan/${invoiceId}?ok=Pengingat+dikirim`);
}

/** Penyewa mengunggah bukti transfer untuk tagihannya sendiri. */
export async function tenantUploadProofAction(formData: FormData): Promise<void> {
  const user = await requireRole(["tenant"]);
  if (!user.tenant) {
    redirect("/dashboard?err=Akun+belum+terhubung+ke+data+penyewa");
  }

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, contract: { select: { tenantId: true } } },
  });
  if (!invoice || invoice.contract.tenantId !== user.tenant.id) {
    redirect("/tagihan?err=Akses+ditolak");
  }

  const parsed = paymentSchema.safeParse({
    invoiceId,
    method: "transfer",
    amount: formData.get("amount") ?? 0,
    paidAt: String(formData.get("paidAt") ?? ""),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  if (!parsed.success) {
    redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(firstError(parsed.error))}`);
  }

  let error: string | null = null;
  try {
    const proofUrl = await saveUpload(formData.get("proof"), "bukti");
    if (!proofUrl) throw new Error("Unggah bukti pembayaran (JPG/PNG/WEBP/PDF)");
    const paidAt = parseDateInput(parsed.data.paidAt) ?? new Date();
    await recordPayment(
      {
        invoiceId,
        method: "transfer",
        amount: parsed.data.amount,
        paidAt,
        proofUrl,
        notes: parsed.data.notes || null,
        byTenant: true,
      },
      user.id,
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Gagal mengirim bukti pembayaran";
  }

  if (error) redirect(`/tagihan/${invoiceId}?err=${encodeURIComponent(error)}`);
  revalidatePath("/tagihan");
  revalidatePath(`/tagihan/${invoiceId}`);
  redirect(`/tagihan/${invoiceId}?ok=Bukti+pembayaran+dikirim,+menunggu+verifikasi`);
}
