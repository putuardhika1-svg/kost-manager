import { NextResponse } from "next/server";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invoiceScopeWhere } from "@/lib/scope";
import { currentYearMonth, monthEndUTC, monthStartUTC } from "@/lib/dates";

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function iso(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);

  const url = new URL(request.url);
  const match = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get("period") ?? "");
  const fallback = currentYearMonth();
  const year = match ? Number(match[1]) : fallback.year;
  const month = match ? Number(match[2]) : fallback.month;
  const period = `${year}-${String(month).padStart(2, "0")}`;

  const propertyId = url.searchParams.get("propertyId");
  const effectiveScope =
    propertyId && (scope === null || scope.includes(propertyId)) ? [propertyId] : scope;

  const invoices = await prisma.invoice.findMany({
    where: {
      ...invoiceScopeWhere(effectiveScope),
      periodStart: { gte: monthStartUTC(year, month), lte: monthEndUTC(year, month) },
    },
    include: {
      contract: { include: { tenant: true, room: { include: { property: true } } } },
      payments: {
        where: { status: "verified" },
        orderBy: { paidAt: "desc" },
        take: 1,
        select: { paidAt: true },
      },
    },
    orderBy: { invoiceNo: "asc" },
  });

  const header = [
    "no_tagihan",
    "properti",
    "kamar",
    "penyewa",
    "telepon",
    "periode_mulai",
    "jatuh_tempo",
    "total",
    "dibayar",
    "sisa",
    "status",
    "tanggal_bayar",
  ];

  const rows = invoices.map((invoice) => [
    invoice.invoiceNo,
    invoice.contract.room.property.name,
    invoice.contract.room.number,
    invoice.contract.tenant.name,
    invoice.contract.tenant.phone,
    iso(invoice.periodStart),
    iso(invoice.dueDate),
    invoice.total,
    invoice.paidTotal,
    Math.max(0, invoice.total - invoice.paidTotal),
    invoice.status,
    iso(invoice.payments[0]?.paidAt),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tagihan-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
