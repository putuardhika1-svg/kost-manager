import Link from "next/link";
import { redirect } from "next/navigation";
import { propertyScope, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invoiceScopeWhere, propertyScopeWhere } from "@/lib/scope";
import { dateID, monthLabel, rupiah } from "@/lib/format";
import { currentYearMonth, monthEndUTC, monthStartUTC } from "@/lib/dates";
import { INVOICE_STATUS } from "@/lib/constants";
import { markOverdue } from "@/lib/billing";
import { Card, Empty, Field, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { generateInvoicesAction, publishInvoiceAction } from "./actions";
import { TenantInvoices } from "./tenant-invoices";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; period?: string; status?: string; propertyId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (user.role === "tenant") {
    return <TenantInvoices user={user} status={params.status ?? "all"} flash={params} />;
  }

  if (!["owner", "admin", "staff"].includes(user.role)) {
    redirect("/dashboard?err=Akses+ditolak");
  }

  await markOverdue();

  const scope = await propertyScope(user);
  const canManage = user.role === "owner" || user.role === "admin";

  const ym = currentYearMonth();
  const rawPeriod = params.period ?? "";
  const period = /^\d{4}-\d{2}$/.test(rawPeriod)
    ? rawPeriod
    : `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  const statusFilter = params.status ?? "all";
  const propertyIds = params.propertyId
    ? scope === null || scope.includes(params.propertyId)
      ? [params.propertyId]
      : scope
    : scope;

  const [invoices, properties] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...invoiceScopeWhere(propertyIds),
        periodStart: { gte: monthStartUTC(year, month), lte: monthEndUTC(year, month) },
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
      },
      include: {
        contract: { include: { tenant: true, room: { include: { property: true } } } },
      },
      orderBy: [{ invoiceNo: "asc" }],
    }),
    prisma.property.findMany({
      where: propertyScopeWhere(scope),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const active = invoices.filter((invoice) => invoice.status !== "void");
  const totalBilled = active.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalPaid = active.reduce((sum, invoice) => sum + invoice.paidTotal, 0);
  const outstanding = active.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.total - invoice.paidTotal),
    0,
  );
  const drafts = invoices.filter((invoice) => invoice.status === "draft").length;

  const statusTabs = [
    { key: "all", label: "Semua" },
    { key: "draft", label: "Draft" },
    { key: "unpaid", label: "Belum bayar" },
    { key: "overdue", label: "Tunggakan" },
    { key: "paid", label: "Lunas" },
    { key: "void", label: "Dibatalkan" },
  ];

  return (
    <>
      <PageHeader
        title="Tagihan sewa"
        subtitle="Buat tagihan bulanan, terbitkan, dan catat pembayaran penyewa."
      />
      <Flash error={params.err} ok={params.ok} />

      <div className="stat-grid">
        <Stat label={`Total tagihan ${monthLabel(month)} ${year}`} value={rupiah(totalBilled)} hint={`${active.length} tagihan aktif`} />
        <Stat label="Sudah dibayar" value={rupiah(totalPaid)} hint="Pembayaran terverifikasi" />
        <Stat label="Belum dibayar" value={rupiah(outstanding)} hint="Termasuk tunggakan" />
        <Stat label="Draft" value={drafts} hint="Belum diterbitkan" />
      </div>

      <Card
        title={`Daftar tagihan (${invoices.length})`}
        actions={
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {statusTabs.map((tab) => (
              <Link
                key={tab.key}
                className={`btn btn-sm${statusFilter === tab.key ? " btn-primary" : ""}`}
                href={`/tagihan?period=${period}&status=${tab.key}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        }
        tight
      >
        {invoices.length === 0 ? (
          <Empty
            title="Belum ada tagihan pada periode ini"
            description="Gunakan formulir di bawah untuk membuat tagihan massal dari kontrak aktif."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No. tagihan</th>
                  <th>Penyewa / kamar</th>
                  <th>Periode</th>
                  <th>Jatuh tempo</th>
                  <th className="num">Total</th>
                  <th className="num">Dibayar</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/tagihan/${invoice.id}`}>{invoice.invoiceNo}</Link>
                    </td>
                    <td>
                      {invoice.contract.tenant.name}
                      <div className="small muted">
                        {invoice.contract.room.property.name} · Kamar {invoice.contract.room.number}
                      </div>
                    </td>
                    <td>{dateID(invoice.periodStart)}</td>
                    <td>{dateID(invoice.dueDate)}</td>
                    <td className="num">{rupiah(invoice.total)}</td>
                    <td className="num">{rupiah(invoice.paidTotal)}</td>
                    <td>
                      <StatusBadge map={INVOICE_STATUS} value={invoice.status} />
                    </td>
                    <td className="right">
                      {canManage && invoice.status === "draft" ? (
                        <form action={publishInvoiceAction}>
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <button className="btn btn-sm btn-primary" type="submit">
                            Terbitkan
                          </button>
                        </form>
                      ) : (
                        <Link className="btn btn-sm" href={`/tagihan/${invoice.id}`}>
                          Detail
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canManage ? (
      <Card
        title="Buat tagihan massal"
        description="Tagihan dibuat berstatus draft dari semua kontrak aktif pada periode yang dipilih."
      >
        <form action={generateInvoicesAction}>
          <div className="form-grid">
            <Field label="Bulan">
              <select name="month" defaultValue={month}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {monthLabel(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tahun">
              <input name="year" type="number" min={2020} max={2100} defaultValue={year} />
            </Field>
            <Field label="Properti">
              <select name="propertyId" defaultValue={params.propertyId ?? ""}>
                {scope === null ? <option value="">Semua properti</option> : null}
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Generate tagihan
            </button>
            <span className="small muted">
              Tagihan dengan periode sama tidak akan diduplikasi.
            </span>
          </div>
        </form>
      </Card>
      ) : null}
    </>
  );
}
