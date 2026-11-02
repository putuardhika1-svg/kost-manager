import Link from "next/link";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { dateID, rupiah } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/constants";
import { Card, Empty, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";

export async function TenantInvoices({
  user,
  status,
  flash,
}: {
  user: CurrentUser;
  status: string;
  flash: { err?: string; ok?: string };
}) {
  if (!user.tenant) {
    return (
      <>
        <PageHeader title="Tagihan saya" subtitle="Akun belum terhubung dengan data penyewa." />
        <Flash error={flash.err} ok={flash.ok} />
        <Card title="Akun belum terhubung">
          <p className="small muted" style={{ margin: 0 }}>
            Hubungi owner/admin untuk menghubungkan akun <strong>{user.email}</strong> dengan data
            penyewa Anda.
          </p>
        </Card>
      </>
    );
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      contract: { tenantId: user.tenant.id },
      ...(status === "all" ? {} : { status }),
    },
    include: { contract: { include: { room: { include: { property: true } } } } },
    orderBy: { periodStart: "desc" },
    take: 100,
  });

  const active = invoices.filter(
    (invoice) => invoice.status === "unpaid" || invoice.status === "overdue",
  );
  const outstanding = active.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.total - invoice.paidTotal),
    0,
  );
  const paid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.paidTotal, 0);

  const tabs = [
    { key: "all", label: "Semua" },
    { key: "unpaid", label: "Belum bayar" },
    { key: "overdue", label: "Tunggakan" },
    { key: "paid", label: "Lunas" },
  ];

  return (
    <>
      <PageHeader
        title="Tagihan saya"
        subtitle={`${user.tenant.name} · ${user.tenant.phone}`}
        actions={
          <Link className="btn btn-sm" href="/maintenance">
            Lapor perbaikan
          </Link>
        }
      />
      <Flash error={flash.err} ok={flash.ok} />

      <div className="stat-grid">
        <Stat label="Total tunggakan" value={rupiah(outstanding)} hint={`${active.length} tagihan aktif`} />
        <Stat label="Total dibayar" value={rupiah(paid)} hint="Pembayaran terverifikasi" />
        <Stat label="Jumlah tagihan" value={invoices.length} hint="Sesuai filter" />
      </div>

      <Card
        title={`Daftar tagihan (${invoices.length})`}
        actions={
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                className={`btn btn-sm${status === tab.key ? " btn-primary" : ""}`}
                href={`/tagihan?status=${tab.key}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        }
        tight
      >
        {invoices.length === 0 ? (
          <Empty title="Belum ada tagihan" description="Tagihan yang diterbitkan admin akan muncul di sini." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No. tagihan</th>
                  <th>Kamar</th>
                  <th>Periode</th>
                  <th>Jatuh tempo</th>
                  <th className="num">Total</th>
                  <th className="num">Sisa</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="mono">
                      <Link href={`/tagihan/${invoice.id}`}>{invoice.invoiceNo}</Link>
                    </td>
                    <td>
                      {invoice.contract.room.property.name} · {invoice.contract.room.number}
                    </td>
                    <td>{dateID(invoice.periodStart)}</td>
                    <td>{dateID(invoice.dueDate)}</td>
                    <td className="num">{rupiah(invoice.total)}</td>
                    <td className="num">{rupiah(Math.max(0, invoice.total - invoice.paidTotal))}</td>
                    <td>
                      <StatusBadge map={INVOICE_STATUS} value={invoice.status} />
                    </td>
                    <td className="right">
                      <Link className="btn btn-sm" href={`/tagihan/${invoice.id}`}>
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
