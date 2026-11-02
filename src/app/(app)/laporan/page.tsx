import Link from "next/link";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  contractScopeWhere,
  invoiceScopeWhere,
  paymentScopeWhere,
  propertyScopeWhere,
  roomScopeWhere,
} from "@/lib/scope";
import { dateID, monthLabel, percent, rupiah } from "@/lib/format";
import { currentYearMonth, monthEndUTC, monthStartUTC, startOfTodayUTC } from "@/lib/dates";
import { INVOICE_STATUS } from "@/lib/constants";
import { markOverdue } from "@/lib/billing";
import { Card, Empty, Field, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function parsePeriod(value: string | undefined): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return currentYearMonth();
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return currentYearMonth();
  return { year, month };
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; propertyId?: string; err?: string; ok?: string }>;
}) {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const params = await searchParams;

  await markOverdue();
  const { year, month } = parsePeriod(params.period);

  const selectedProperty =
    params.propertyId && (scope === null || scope.includes(params.propertyId))
      ? params.propertyId
      : null;
  const effectiveScope = selectedProperty ? [selectedProperty] : scope;

  const periodStart = monthStartUTC(year, month);
  const periodEnd = monthEndUTC(year, month);
  const today = startOfTodayUTC();

  const [properties, payments, periodInvoices, arrears, trendContracts, roomCount] =
    await Promise.all([
      prisma.property.findMany({
        where: propertyScopeWhere(scope),
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.payment.findMany({
        where: {
          status: "verified",
          paidAt: { gte: periodStart, lte: periodEnd },
          ...paymentScopeWhere(effectiveScope),
        },
        select: {
          amount: true,
          invoice: {
            select: {
              contract: {
                select: { room: { select: { property: { select: { id: true, name: true } } } } },
              },
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: {
          ...invoiceScopeWhere(effectiveScope),
          periodStart: { gte: periodStart, lte: periodEnd },
        },
        select: { status: true, total: true, paidTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          ...invoiceScopeWhere(effectiveScope),
          status: { in: ["unpaid", "overdue"] },
        },
        include: {
          contract: {
            include: { tenant: true, room: { include: { property: true } } },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.contract.findMany({
        where: {
          ...contractScopeWhere(effectiveScope),
          status: { in: ["active", "ended"] },
          startDate: { lte: periodEnd },
          endDate: { gte: monthStartUTC(shiftMonth(year, month, -11).year, shiftMonth(year, month, -11).month) },
        },
        select: { roomId: true, startDate: true, endDate: true },
      }),
      prisma.room.count({
        where: { ...roomScopeWhere(effectiveScope), status: { not: "nonaktif" } },
      }),
    ]);

  const revenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const revenueByProperty = new Map<string, { name: string; amount: number }>();
  for (const payment of payments) {
    const property = payment.invoice.contract.room.property;
    const entry = revenueByProperty.get(property.id) ?? { name: property.name, amount: 0 };
    entry.amount += payment.amount;
    revenueByProperty.set(property.id, entry);
  }

  const activePeriodInvoices = periodInvoices.filter((invoice) => invoice.status !== "void");
  const billed = activePeriodInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const collected = activePeriodInvoices.reduce((sum, invoice) => sum + invoice.paidTotal, 0);
  const outstanding = activePeriodInvoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.total - invoice.paidTotal),
    0,
  );

  const buckets = { d1: 0, d8: 0, d30: 0, total: 0, count: 0 };
  for (const invoice of arrears) {
    const amount = Math.max(0, invoice.total - invoice.paidTotal);
    if (amount <= 0) continue;
    const days = Math.floor((today.getTime() - invoice.dueDate.getTime()) / DAY_MS);
    buckets.total += amount;
    buckets.count += 1;
    if (days <= 7) buckets.d1 += amount;
    else if (days <= 30) buckets.d8 += amount;
    else buckets.d30 += amount;
  }

  const trendMonths = Array.from({ length: 12 }, (_, index) => {
    const shifted = shiftMonth(year, month, index - 11);
    const start = monthStartUTC(shifted.year, shifted.month);
    const end = monthEndUTC(shifted.year, shifted.month);
    const occupied = new Set(
      trendContracts
        .filter((contract) => contract.startDate <= end && contract.endDate >= start)
        .map((contract) => contract.roomId),
    ).size;
    return { ...shifted, occupied, occupancy: roomCount ? Math.round((occupied / roomCount) * 100) : 0 };
  });

  const periodValue = `${year}-${String(month).padStart(2, "0")}`;
  const query = new URLSearchParams({ period: periodValue });
  if (selectedProperty) query.set("propertyId", selectedProperty);

  return (
    <>
      <PageHeader
        title="Laporan"
        subtitle="Pendapatan, tunggakan, dan okupansi berdasarkan data aktual."
        actions={
          <a className="btn btn-sm btn-primary" href={`/laporan/export?${query.toString()}`}>
            Ekspor CSV
          </a>
        }
      />
      <Flash error={params.err} ok={params.ok} />

      <Card title="Filter" tight>
        <div className="card-body">
          <form className="filters" method="get">
            <Field label="Periode">
              <input type="month" name="period" defaultValue={periodValue} />
            </Field>
            <Field label="Properti">
              <select name="propertyId" defaultValue={selectedProperty ?? ""}>
                <option value="">Semua properti</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn" type="submit">
              Terapkan
            </button>
            <Link className="btn btn-sm" href="/laporan">
              Reset
            </Link>
          </form>
        </div>
      </Card>

      <div className="stat-grid">
        <Stat
          label={`Pendapatan ${monthLabel(month)} ${year}`}
          value={rupiah(revenue)}
          hint="Pembayaran terverifikasi pada periode"
        />
        <Stat label="Total tagihan" value={rupiah(billed)} hint={`${activePeriodInvoices.length} tagihan aktif`} />
        <Stat label="Sudah dibayar" value={rupiah(collected)} hint={percent(collected, billed)} />
        <Stat label="Belum dibayar" value={rupiah(outstanding)} hint="Termasuk tunggakan" />
      </div>

      <div className="grid-2">
        <Card title="Pendapatan per properti" tight>
          {revenueByProperty.size === 0 ? (
            <Empty title="Belum ada pendapatan" description="Tidak ada pembayaran terverifikasi pada periode ini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Properti</th>
                    <th className="num">Pendapatan</th>
                    <th className="num">Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...revenueByProperty.values()]
                    .sort((a, b) => b.amount - a.amount)
                    .map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td className="num">{rupiah(row.amount)}</td>
                        <td className="num">{percent(row.amount, revenue)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Aging tunggakan" description={`${buckets.count} tagihan menunggak`} tight>
          <div className="card-body">
            <div className="grid-3">
              <Stat label="1–7 hari" value={rupiah(buckets.d1)} />
              <Stat label="8–30 hari" value={rupiah(buckets.d8)} />
              <Stat label=">30 hari" value={rupiah(buckets.d30)} />
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Total tunggakan: <strong>{rupiah(buckets.total)}</strong>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Tunggakan terlama" tight>
        {arrears.length === 0 ? (
          <Empty title="Semua tagihan lancar 🎉" description="Tidak ada tunggakan saat ini." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No. tagihan</th>
                  <th>Penyewa</th>
                  <th>Kamar</th>
                  <th>Jatuh tempo</th>
                  <th className="num">Umur</th>
                  <th className="num">Sisa</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {arrears.slice(0, 15).map((invoice) => {
                  const days = Math.max(
                    0,
                    Math.floor((today.getTime() - invoice.dueDate.getTime()) / DAY_MS),
                  );
                  return (
                    <tr key={invoice.id}>
                      <td className="mono">
                        <Link href={`/tagihan/${invoice.id}`}>{invoice.invoiceNo}</Link>
                      </td>
                      <td>{invoice.contract.tenant.name}</td>
                      <td>
                        {invoice.contract.room.property.name} · {invoice.contract.room.number}
                      </td>
                      <td>{dateID(invoice.dueDate)}</td>
                      <td className="num">{days} hari</td>
                      <td className="num">{rupiah(invoice.total - invoice.paidTotal)}</td>
                      <td>
                        <StatusBadge map={INVOICE_STATUS} value={invoice.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Tren okupansi 12 bulan" description={`Basis ${roomCount} kamar aktif`} tight>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bulan</th>
                <th className="num">Kamar terisi</th>
                <th className="num">Okupansi</th>
                <th>Bar</th>
              </tr>
            </thead>
            <tbody>
              {trendMonths.map((row) => (
                <tr key={`${row.year}-${row.month}`}>
                  <td>
                    {monthLabel(row.month)} {row.year}
                  </td>
                  <td className="num">
                    {row.occupied} / {roomCount}
                  </td>
                  <td className="num">{row.occupancy}%</td>
                  <td>
                    <div style={{ background: "#eef0f3", borderRadius: 999, height: 8, minWidth: 120 }}>
                      <div
                        style={{
                          width: `${row.occupancy}%`,
                          background: "#1f6feb",
                          height: 8,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
