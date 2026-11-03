import Link from "next/link";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { dateID, monthLabel, rupiah } from "@/lib/format";
import { startOfTodayUTC, addDays } from "@/lib/dates";
import { Card, Empty, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { INVOICE_STATUS, MAINT_STATUS } from "@/lib/constants";

export async function TenantDashboard({
  user,
  flash,
}: {
  user: CurrentUser;
  flash: { err?: string; ok?: string };
}) {
  if (!user.tenant) {
    return (
      <>
        <PageHeader title="Dashboard penyewa" subtitle="Akun Anda belum terhubung dengan data penyewa." />
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

  const tenant = user.tenant;
  const today = startOfTodayUTC();

  const [invoices, openTickets, lastReading, pendingReading, latestRegistration, activeContracts] =
    await Promise.all([
    prisma.invoice.findMany({
      where: { contract: { tenantId: tenant.id } },
      include: { contract: { include: { room: { include: { property: true } } } } },
      orderBy: { periodStart: "desc" },
      take: 12,
    }),
    prisma.maintenance.findMany({
      where: { tenantId: tenant.id, status: { in: ["baru", "diproses"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.meterReading.findFirst({
      where: { tenantId: tenant.id, status: { in: ["verified", "billed"] } },
      include: { room: { include: { property: true } } },
      orderBy: [{ readingAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.meterReading.findFirst({
      where: { tenantId: tenant.id, status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contract.findFirst({
      where: { tenantId: tenant.id, status: { in: ["pending", "cancelled"] } },
      orderBy: { createdAt: "desc" },
      include: { room: { include: { property: true } } },
    }),
    prisma.contract.count({ where: { tenantId: tenant.id, status: "active" } }),
  ]);

  const activeInvoices = invoices.filter(
    (invoice) => invoice.status === "unpaid" || invoice.status === "overdue",
  );
  const outstanding = activeInvoices.reduce(
    (sum, invoice) => sum + Math.max(0, invoice.total - invoice.paidTotal),
    0,
  );
  const dueSoon = activeInvoices.filter(
    (invoice) => invoice.dueDate <= addDays(today, 7) && invoice.dueDate >= today,
  );
  const now = new Date();

  return (
    <>
      <PageHeader
        title={`Halo, ${tenant.name}`}
        subtitle={`${monthLabel(now.getUTCMonth() + 1)} ${now.getUTCFullYear()} · ${tenant.phone}`}
        actions={
          <Link className="btn btn-sm btn-primary" href="/tagihan">
            Lihat tagihan
          </Link>
        }
      />
      <Flash error={flash.err} ok={flash.ok} />

      {activeContracts === 0 && latestRegistration ? (
        latestRegistration.status === "pending" ? (
          <Card title="Pendaftaran menunggu persetujuan owner">
            <p style={{ margin: 0 }}>
              Kamar <strong>{latestRegistration.room.number}</strong> di{" "}
              <strong>{latestRegistration.room.property.name}</strong> · mulai{" "}
              {dateID(latestRegistration.startDate)} ·{" "}
              {rupiah(latestRegistration.rentAmount)}/bulan.
            </p>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Owner akan memverifikasi pendaftaran Anda. Tagihan dan menu meter aktif setelah
              kontrak disetujui.
            </p>
          </Card>
        ) : (
          <Card title="Pendaftaran kamar ditolak">
            <p style={{ margin: 0 }}>
              Pendaftaran kamar <strong>{latestRegistration.room.number}</strong> di{" "}
              <strong>{latestRegistration.room.property.name}</strong> belum disetujui.
            </p>
            {latestRegistration.notes ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Catatan owner: {latestRegistration.notes}
              </p>
            ) : null}
            <p className="small muted" style={{ marginBottom: 0 }}>
              Silakan hubungi owner/admin untuk memilih kamar lain.
            </p>
          </Card>
        )
      ) : null}

      <div className="stat-grid">
        <Stat label="Total tunggakan" value={rupiah(outstanding)} hint="Tagihan belum lunas" />
        <Stat label="Tagihan aktif" value={activeInvoices.length} hint="Belum dibayar / tunggakan" />
        <Stat label="Jatuh tempo 7 hari" value={dueSoon.length} hint="Segera lakukan pembayaran" />
        <Stat label="Tiket perbaikan" value={openTickets.length} hint="Sedang diproses" />
      </div>

      <Card
        title="Meter listrik"
        actions={
          <Link className="btn btn-sm btn-primary" href="/meter">
            {pendingReading ? "Lihat pengajuan" : "Isi meter"}
          </Link>
        }
      >
        <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="small muted">Pembacaan terakhir</div>
            <div style={{ fontWeight: 600, fontSize: 20 }}>
              {lastReading ? `${lastReading.currentReading} kWh` : "Belum ada"}
            </div>
            {lastReading ? (
              <div className="small muted">
                {lastReading.room.property.name} · {dateID(lastReading.readingAt)}
              </div>
            ) : null}
          </div>
          <div>
            <div className="small muted">Status pengajuan</div>
            <div style={{ fontWeight: 600 }}>
              {pendingReading ? "Menunggu verifikasi admin" : "Belum ada"}
            </div>
          </div>
          <div>
            <div className="small muted">Tarif</div>
            <div style={{ fontWeight: 600 }}>
              {lastReading
                ? `${rupiah(lastReading.room.property.electricityTariff)}/kWh`
                : "Lihat detail kamar"}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Tagihan terbaru" tight>
        {invoices.length === 0 ? (
          <Empty title="Belum ada tagihan" description="Tagihan akan muncul setelah diterbitkan admin." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No. tagihan</th>
                  <th>Kamar</th>
                  <th>Periode</th>
                  <th className="num">Total</th>
                  <th className="num">Sisa</th>
                  <th>Jatuh tempo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link href={`/tagihan/${invoice.id}`}>{invoice.invoiceNo}</Link>
                    </td>
                    <td>
                      {invoice.contract.room.property.name} · {invoice.contract.room.number}
                    </td>
                    <td>{dateID(invoice.periodStart)}</td>
                    <td className="num">{rupiah(invoice.total)}</td>
                    <td className="num">{rupiah(invoice.total - invoice.paidTotal)}</td>
                    <td>{dateID(invoice.dueDate)}</td>
                    <td>
                      <StatusBadge map={INVOICE_STATUS} value={invoice.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Tiket perbaikan terbuka"
        actions={
          <Link className="btn btn-sm" href="/maintenance">
            Buat tiket
          </Link>
        }
        tight
      >
        {openTickets.length === 0 ? (
          <Empty title="Tidak ada tiket terbuka" description="Laporkan kerusakan melalui menu Perbaikan." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Masalah</th>
                  <th>Prioritas</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {openTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{dateID(ticket.createdAt)}</td>
                    <td>{ticket.title}</td>
                    <td>{ticket.priority}</td>
                    <td>
                      <StatusBadge map={MAINT_STATUS} value={ticket.status} />
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
