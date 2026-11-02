import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { logAudit } from "./audit";
import { sendNotification } from "./notify";
import { monthLabel, todayUTC } from "./format";
import { startOfTodayUTC } from "./dates";

const DAY_MS = 86_400_000;

export type GenerateResult = {
  contracts: number;
  created: number;
  skipped: number;
  total: number;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function nextInvoiceSequence(prefix: string): Promise<number> {
  const rows = await prisma.invoice.findMany({
    where: { invoiceNo: { startsWith: prefix } },
    select: { invoiceNo: true },
  });
  let max = 0;
  for (const row of rows) {
    const value = Number(row.invoiceNo.slice(prefix.length));
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
}

/** Prorata sewa berdasarkan hari yang benar-benar ditempati pada periode. */
function proratedRent(
  rentAmount: number,
  startDate: Date,
  endDate: Date,
  periodStart: Date,
  periodEnd: Date,
  daysInMonth: number,
): number {
  const from = Math.max(startDate.getTime(), periodStart.getTime());
  const to = Math.min(endDate.getTime(), periodEnd.getTime());
  if (to < from) return 0;
  const fromDay = new Date(from).getUTCDate();
  const toDay = new Date(to).getUTCDate();
  const billableDays = toDay - fromDay + 1;
  if (billableDays >= daysInMonth) return rentAmount;
  return Math.max(0, Math.round((rentAmount * billableDays) / daysInMonth));
}

/**
 * Membuat draft tagihan untuk semua kontrak aktif pada periode tertentu.
 * Melewati kontrak yang sudah memiliki tagihan pada periode yang sama.
 */
export async function generateInvoices(opts: {
  year: number;
  month: number;
  propertyId?: string | null;
  userId?: string | null;
}): Promise<GenerateResult> {
  const { year, month } = opts;
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const contracts = await prisma.contract.findMany({
    where: {
      status: "active",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
      ...(opts.propertyId ? { room: { propertyId: opts.propertyId } } : {}),
    },
    include: { room: { include: { property: true } }, tenant: true },
    orderBy: { room: { number: "asc" } },
  });

  const existing = contracts.length
    ? await prisma.invoice.findMany({
        where: { contractId: { in: contracts.map((contract) => contract.id) }, periodStart },
        select: { contractId: true },
      })
    : [];
  const existingContractIds = new Set(existing.map((invoice) => invoice.contractId));

  let created = 0;
  let skipped = 0;
  let total = 0;

  for (const contract of contracts) {
    if (existingContractIds.has(contract.id)) {
      skipped += 1;
      continue;
    }

    const rent = proratedRent(
      contract.rentAmount,
      contract.startDate,
      contract.endDate,
      periodStart,
      periodEnd,
      daysInMonth,
    );
    if (rent <= 0) {
      skipped += 1;
      continue;
    }

    const yyyymm = `${year}${String(month).padStart(2, "0")}`;
    const prefix = `INV/${contract.room.property.code}/${yyyymm}/`;
    const dueDate = new Date(Date.UTC(year, month - 1, Math.min(contract.billingDay, daysInMonth)));

    let saved = false;
    for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
      const seq = await nextInvoiceSequence(prefix);
      const invoiceNo = `${prefix}${String(seq).padStart(3, "0")}`;
      try {
        await prisma.invoice.create({
          data: {
            contractId: contract.id,
            invoiceNo,
            periodStart,
            periodEnd,
            dueDate,
            subtotal: rent,
            additionalTotal: 0,
            total: rent,
            status: "draft",
            source: "auto",
            items: {
              create: [
                {
                  description: `Sewa kamar ${contract.room.number} - ${monthLabel(month)} ${year}`,
                  type: "rent",
                  amount: rent,
                },
              ],
            },
          },
        });
        saved = true;
        created += 1;
        total += rent;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const duplicate = await prisma.invoice.findFirst({
          where: { contractId: contract.id, periodStart },
          select: { id: true },
        });
        if (duplicate) {
          skipped += 1;
          saved = true;
          break;
        }
      }
    }

    if (!saved) {
      throw new Error(`Gagal membuat nomor tagihan unik untuk kamar ${contract.room.number}`);
    }
  }

  await logAudit({
    userId: opts.userId,
    action: "invoice.generate",
    entity: "Invoice",
    payload: { year, month, propertyId: opts.propertyId ?? null, created, skipped, total },
  });

  return { contracts: contracts.length, created, skipped, total };
}

/** Menghitung ulang subtotal, total, paidTotal, dan status tagihan. */
export async function recomputeInvoice(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      payments: { where: { status: "verified" } },
    },
  });
  if (!invoice) return;

  const subtotal = invoice.items
    .filter((item) => item.type === "rent")
    .reduce((sum, item) => sum + item.amount, 0);
  const additionalTotal = invoice.items
    .filter((item) => item.type !== "rent")
    .reduce((sum, item) => sum + item.amount, 0);
  const total = subtotal + additionalTotal;
  const paidTotal = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);

  let status = invoice.status;
  if (invoice.status !== "void" && invoice.status !== "draft") {
    if (total > 0 && paidTotal >= total) status = "paid";
    else if (invoice.dueDate.getTime() < todayUTC().getTime()) status = "overdue";
    else status = "unpaid";
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { subtotal, additionalTotal, total, paidTotal, status },
  });
}

export async function publishInvoice(invoiceId: string, userId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      contract: { include: { tenant: true, room: { include: { property: true } } } },
    },
  });
  if (!invoice) throw new Error("Tagihan tidak ditemukan");
  if (invoice.status !== "draft") throw new Error("Hanya tagihan berstatus draft yang dapat diterbitkan");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "unpaid", issueDate: new Date() },
  });

  await sendNotification({
    templateKey: "N-01",
    invoiceId: invoice.id,
    tenantId: invoice.contract.tenantId,
    variables: {
      nama: invoice.contract.tenant.name,
      kamar: invoice.contract.room.number,
      periode:
        monthLabel(invoice.periodStart.getUTCMonth() + 1) +
        " " +
        invoice.periodStart.getUTCFullYear(),
      jumlah: "Rp " + new Intl.NumberFormat("id-ID").format(invoice.total),
      jatuh_tempo: invoice.dueDate.toISOString().slice(0, 10),
      link: `${process.env.APP_URL ?? "http://localhost:3000"}/tagihan/${invoice.id}`,
    },
  });

  await logAudit({
    userId,
    action: "invoice.publish",
    entity: "Invoice",
    entityId: invoiceId,
    payload: { invoiceNo: invoice.invoiceNo, total: invoice.total },
  });
}

export async function voidInvoice(
  invoiceId: string,
  reason: string,
  userId: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { where: { status: { in: ["pending", "verified"] } }, select: { id: true } } },
  });
  if (!invoice) throw new Error("Tagihan tidak ditemukan");
  if (invoice.status === "paid") throw new Error("Tagihan lunas tidak dapat dibatalkan");
  if (invoice.status === "void") throw new Error("Tagihan sudah dibatalkan");
  if (invoice.payments.length > 0) {
    throw new Error("Tolak atau selesaikan pembayaran pada tagihan ini terlebih dahulu");
  }
  if (reason.trim().length < 5) throw new Error("Alasan pembatalan minimal 5 karakter");
  if (reason.trim().length > 300) throw new Error("Alasan pembatalan maksimal 300 karakter");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "void", voidReason: reason.trim() },
  });

  await logAudit({
    userId,
    action: "invoice.void",
    entity: "Invoice",
    entityId: invoiceId,
    payload: { invoiceNo: invoice.invoiceNo, reason },
  });
}

export async function addInvoiceItem(
  input: { invoiceId: string; description: string; type: string; amount: number },
  userId: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) throw new Error("Tagihan tidak ditemukan");
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new Error("Item tidak dapat ditambahkan pada tagihan lunas/dibatalkan");
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Nominal item harus lebih dari 0");
  }

  await prisma.invoiceItem.create({
    data: {
      invoiceId: input.invoiceId,
      description: input.description.trim(),
      type: input.type,
      amount: input.amount,
    },
  });
  await recomputeInvoice(input.invoiceId);

  await logAudit({
    userId,
    action: "invoice.item.add",
    entity: "Invoice",
    entityId: input.invoiceId,
    payload: input,
  });
}

export async function removeInvoiceItem(itemId: string, userId: string): Promise<void> {
  const item = await prisma.invoiceItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("Item tidak ditemukan");
  if (item.type === "rent") throw new Error("Item sewa tidak dapat dihapus");

  const invoice = await prisma.invoice.findUnique({ where: { id: item.invoiceId } });
  if (!invoice) throw new Error("Tagihan tidak ditemukan");
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new Error("Item tidak dapat dihapus dari tagihan lunas/dibatalkan");
  }

  await prisma.invoiceItem.delete({ where: { id: itemId } });
  await recomputeInvoice(item.invoiceId);

  await logAudit({
    userId,
    action: "invoice.item.remove",
    entity: "Invoice",
    entityId: item.invoiceId,
    payload: { itemId },
  });
}

export type RecordPaymentInput = {
  invoiceId: string;
  method: string;
  amount: number;
  paidAt: Date;
  proofUrl?: string | null;
  notes?: string | null;
  byTenant?: boolean;
};

export async function recordPayment(
  input: RecordPaymentInput,
  userId: string,
): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Nominal pembayaran harus lebih dari 0");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      contract: { include: { tenant: true, room: true } },
      payments: {
        where: { status: { in: ["pending", "verified"] } },
        select: { amount: true },
      },
    },
  });
  if (!invoice) throw new Error("Tagihan tidak ditemukan");
  if (invoice.status === "draft") throw new Error("Terbitkan tagihan terlebih dahulu sebelum mencatat pembayaran");
  if (invoice.status === "void") throw new Error("Tagihan dibatalkan, pembayaran tidak dapat dicatat");
  if (invoice.status === "paid") throw new Error("Tagihan sudah lunas");

  const committed = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = invoice.total - committed;
  if (outstanding <= 0) throw new Error("Tidak ada sisa tagihan yang perlu dibayar");
  if (input.amount > outstanding) {
    throw new Error(
      `Nominal melebihi sisa tagihan (${new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(outstanding)})`,
    );
  }

  const isCash = input.method === "cash" && !input.byTenant;

  await prisma.payment.create({
    data: {
      invoiceId: input.invoiceId,
      method: input.method,
      amount: input.amount,
      paidAt: input.paidAt,
      proofUrl: input.proofUrl ?? null,
      status: isCash ? "verified" : "pending",
      verifiedById: isCash ? userId : null,
      verifiedAt: isCash ? new Date() : null,
      notes: input.notes ?? null,
    },
  });

  await recomputeInvoice(input.invoiceId);

  if (!isCash) {
    await sendNotification({
      templateKey: "N-07",
      invoiceId: invoice.id,
      tenantId: invoice.contract.tenantId,
      variables: {
        nama: invoice.contract.tenant.name,
        kamar: invoice.contract.room.number,
        jumlah: "Rp " + new Intl.NumberFormat("id-ID").format(input.amount),
      },
    });
  }

  await logAudit({
    userId,
    action: input.byTenant ? "payment.upload" : "payment.record",
    entity: "Payment",
    entityId: invoice.id,
    payload: { invoiceNo: invoice.invoiceNo, ...input, paidAt: input.paidAt.toISOString() },
  });
}

export async function verifyPayment(paymentId: string, userId: string): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        include: { contract: { include: { tenant: true, room: true } } },
      },
    },
  });
  if (!payment) throw new Error("Pembayaran tidak ditemukan");
  if (payment.status === "verified") throw new Error("Pembayaran sudah diverifikasi");
  if (payment.status !== "pending") throw new Error("Hanya pembayaran berstatus pending yang dapat diverifikasi");
  if (payment.invoice.status === "void") throw new Error("Tagihan sudah dibatalkan");

  const outstanding = payment.invoice.total - payment.invoice.paidTotal;
  if (payment.amount > outstanding) {
    throw new Error("Nominal pembayaran melebihi sisa tagihan; tolak atau sesuaikan terlebih dahulu");
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "verified", verifiedById: userId, verifiedAt: new Date(), rejectionReason: null },
  });
  await recomputeInvoice(payment.invoiceId);

  await sendNotification({
    templateKey: "N-08",
    invoiceId: payment.invoiceId,
    tenantId: payment.invoice.contract.tenantId,
    variables: {
      nama: payment.invoice.contract.tenant.name,
      kamar: payment.invoice.contract.room.number,
      jumlah: "Rp " + new Intl.NumberFormat("id-ID").format(payment.amount),
    },
  });

  await logAudit({
    userId,
    action: "payment.verify",
    entity: "Payment",
    entityId: paymentId,
    payload: { invoiceId: payment.invoiceId, amount: payment.amount },
  });
}

export async function rejectPayment(
  paymentId: string,
  reason: string,
  userId: string,
): Promise<void> {
  if (reason.trim().length < 5) throw new Error("Alasan penolakan minimal 5 karakter");
  if (reason.trim().length > 300) throw new Error("Alasan penolakan maksimal 300 karakter");
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { contract: { include: { tenant: true, room: true } } } } },
  });
  if (!payment) throw new Error("Pembayaran tidak ditemukan");
  if (payment.status === "verified") throw new Error("Pembayaran terverifikasi tidak dapat ditolak");
  if (payment.status !== "pending") throw new Error("Hanya pembayaran berstatus pending yang dapat ditolak");

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "rejected", rejectionReason: reason.trim(), verifiedById: userId, verifiedAt: new Date() },
  });
  await recomputeInvoice(payment.invoiceId);

  await sendNotification({
    templateKey: "N-09",
    invoiceId: payment.invoiceId,
    tenantId: payment.invoice.contract.tenantId,
    variables: {
      nama: payment.invoice.contract.tenant.name,
      kamar: payment.invoice.contract.room.number,
      jumlah: "Rp " + new Intl.NumberFormat("id-ID").format(payment.amount),
      alasan: reason.trim(),
    },
  });

  await logAudit({
    userId,
    action: "payment.reject",
    entity: "Payment",
    entityId: paymentId,
    payload: { invoiceId: payment.invoiceId, reason },
  });
}

/** Menandai tagihan yang melewati jatuh tempo menjadi `overdue`. */
export async function markOverdue(): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: { status: "unpaid", dueDate: { lt: todayUTC() } },
    data: { status: "overdue" },
  });
  return result.count;
}

export function reminderTemplateFor(dueDate: Date): string {
  const days = Math.round((todayUTC().getTime() - dueDate.getTime()) / DAY_MS);
  if (days < 0 && days >= -3) return "N-02";
  if (days === 0) return "N-03";
  if (days >= 1 && days < 3) return "N-04";
  if (days >= 3 && days < 7) return "N-05";
  return "N-06";
}

const REMINDER_TEMPLATES = ["N-02", "N-03", "N-04", "N-05", "N-06"];

export async function sendReminder(invoiceId: string, userId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { contract: { include: { tenant: true, room: true } } },
  });
  if (!invoice) throw new Error("Tagihan tidak ditemukan");
  if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "draft") {
    throw new Error("Pengingat hanya untuk tagihan aktif (belum bayar/tunggakan)");
  }

  const sentToday = await prisma.notificationLog.findFirst({
    where: {
      invoiceId,
      templateKey: { in: REMINDER_TEMPLATES },
      createdAt: { gte: startOfTodayUTC() },
    },
    select: { id: true },
  });
  if (sentToday) throw new Error("Pengingat untuk tagihan ini sudah dikirim hari ini");

  await sendNotification({
    templateKey: reminderTemplateFor(invoice.dueDate),
    invoiceId: invoice.id,
    tenantId: invoice.contract.tenantId,
    variables: {
      nama: invoice.contract.tenant.name,
      kamar: invoice.contract.room.number,
      jumlah: "Rp " + new Intl.NumberFormat("id-ID").format(invoice.total - invoice.paidTotal),
      jatuh_tempo: invoice.dueDate.toISOString().slice(0, 10),
      link: `${process.env.APP_URL ?? "http://localhost:3000"}/tagihan/${invoice.id}`,
    },
  });

  await logAudit({
    userId,
    action: "invoice.reminder",
    entity: "Invoice",
    entityId: invoiceId,
    payload: { invoiceNo: invoice.invoiceNo },
  });
}

/** Mengirim pengingat berakhirnya kontrak (N-10 / N-11). */
export async function sendContractExpiryReminder(
  contractId: string,
  userId: string,
): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { tenant: true, room: true },
  });
  if (!contract) throw new Error("Kontrak tidak ditemukan");
  if (contract.status !== "active") throw new Error("Kontrak tidak aktif");

  const daysLeft = Math.ceil((contract.endDate.getTime() - todayUTC().getTime()) / DAY_MS);
  if (daysLeft < 0) throw new Error("Kontrak sudah melewati tanggal berakhir");
  if (daysLeft > 30) throw new Error("Pengingat hanya untuk kontrak yang berakhir dalam 30 hari");

  const templateKey = daysLeft <= 7 ? "N-11" : "N-10";

  await sendNotification({
    templateKey,
    tenantId: contract.tenantId,
    variables: {
      nama: contract.tenant.name,
      kamar: contract.room.number,
      jatuh_tempo: contract.endDate.toISOString().slice(0, 10),
    },
  });

  await logAudit({
    userId,
    action: "contract.reminder",
    entity: "Contract",
    entityId: contractId,
    payload: { templateKey, daysLeft },
  });
}
