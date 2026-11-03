import "server-only";
import { prisma } from "./db";

export type RequirementItem = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  adminOnly?: boolean;
};

export type InvoiceRequirements = {
  invoiceId: string;
  items: RequirementItem[];
  complete: boolean;
  waived: boolean;
};

/**
 * Syarat yang harus lengkap sebelum invoice draft boleh diterbitkan.
 * Kanal pembayaran adalah syarat sisi admin; sisanya bisa dilengkapi penyewa.
 */
export async function getInvoiceRequirements(
  invoiceId: string,
): Promise<InvoiceRequirements | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      contract: { include: { tenant: true, room: { include: { property: true } } } },
    },
  });
  if (!invoice) return null;

  const property = invoice.contract.room.property;
  const items: RequirementItem[] = [];

  if (property.requireMeterReading) {
    const reading = await prisma.meterReading.findFirst({
      where: {
        contractId: invoice.contractId,
        periodStart: invoice.periodStart,
        status: { in: ["verified", "billed"] },
      },
      orderBy: [{ readingAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, photoUrl: true, isBaseline: true },
    });
    items.push({
      key: "meter",
      label: "Pembacaan meter listrik",
      ok: Boolean(reading),
      detail: reading
        ? reading.isBaseline
          ? "Baseline meter sudah diset admin"
          : "Sudah diverifikasi admin"
        : "Penyewa belum mengirim angka + foto, atau admin belum memverifikasi",
    });
  }

  if (property.requireTenantProfile) {
    const tenant = invoice.contract.tenant;
    const missing: string[] = [];
    if (!tenant.phone) missing.push("telepon");
    if (!tenant.idNumber) missing.push("nomor KTP");
    if (!tenant.emergencyContact) missing.push("kontak darurat");
    if (!tenant.addressOrigin) missing.push("alamat asal");
    items.push({
      key: "profile",
      label: "Profil penyewa lengkap",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? "Data penyewa lengkap"
          : `Belum diisi: ${missing.join(", ")}`,
    });
  }

  const activeChannels = await prisma.paymentChannel.count({
    where: { propertyId: property.id, isActive: true },
  });
  items.push({
    key: "channel",
    label: "Metode pembayaran aktif",
    ok: activeChannels > 0,
    detail:
      activeChannels > 0
        ? `${activeChannels} metode tersedia`
        : "Admin belum mengatur rekening, QRIS, atau tunai",
    adminOnly: true,
  });

  return {
    invoiceId,
    items,
    complete: items.every((item) => item.ok),
    waived: Boolean(invoice.requirementsWaivedReason),
  };
}
