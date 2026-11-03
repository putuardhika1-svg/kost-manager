import Link from "next/link";
import { requireUser, propertyScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markOverdue } from "@/lib/billing";
import {
  invoiceScopeWhere,
  maintenanceScopeWhere,
  paymentScopeWhere,
  propertyScopeWhere,
  roomScopeWhere,
} from "@/lib/scope";
import { dateID, monthLabel, percent, rupiah } from "@/lib/format";
import { startOfTodayUTC, addDays, monthStartUTC } from "@/lib/dates";
import { Card, Empty, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { INVOICE_STATUS, ROOM_STATUS } from "@/lib/constants";
import { TenantDashboard } from "./tenant-dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (user.role === "tenant") {
    return <TenantDashboard user={user} flash={params} />;
  }

  const scope = await propertyScope(user);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = monthStartUTC(year, month);
  const today = startOfTodayUTC();

  const [, rooms, properties, revenue, arrears, dueSoon, overdueTop, recentPayments, openTickets] =
    await Promise.all([
      markOverdue(),
      prisma.room.findMany({
        where: { ...roomScopeWhere(scope), status: { not: "nonaktif" } },
        select: { status: true },
      }),
      prisma.property.count({ where: propertyScopeWhere(scope) }),
      prisma.payment.aggregate({
        where: { status: "verified", paidAt: { gte: monthStart }, ...paymentScopeWhere(scope) },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ["unpaid", "overdue"] }, ...invoiceScopeWhere(scope) },
        _sum: { total: true, paidTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          status: { in: ["unpaid", "overdue"] },
          dueDate: { gte: today, lte: addDays(today, 7) },
          ...invoiceScopeWhere(scope),
        },
        include: { contract: { include: { tenant: true, room: true } } },
        orderBy: { dueDate: "asc" },
        take: 6,
      }),
      prisma.invoice.findMany({
        where: { status: "overdue", ...invoiceScopeWhere(scope) },
        include: { contract: { include: { tenant: true, room: true } } },
        orderBy: { dueDate: "asc" },
        take: 6,
      }),
      prisma.payment.findMany({
        where: { status: "verified", ...paymentScopeWhere(scope) },
        include: { invoice: { include: { contract: { include: { tenant: true, room: true } } } } },
        orderBy: { verifiedAt: "desc" },
        take: 5,
      }),
      prisma.maintenance.count({
        where: { status: { in: ["baru", "diproses"] }, ...maintenanceScopeWhere(scope) },
      }),
    ]);

  const totalRooms = rooms.length;
  const occupied = rooms.filter((room) => room.status === "terisi").length;
  const occupancy = totalRooms ? Math.round((occupied / totalRooms) * 100) : 0;
  const outstanding = (arrears._sum.total ?? 0) - (arrears._sum.paidTotal ?? 0);

  return (
    <>
      <PageHeader
        title={`Dashboard — ${monthLabel(month)} ${year}`}
        subtitle="Ringkasan operasional kost Anda hari ini."
        actions={
          <>
            <Link className="btn btn-sm" href="/tagihan">
              Lihat tagihan
            </Link>
            <Link className="btn btn-sm btn-primary" href="/pembayaran">
              Verifikasi pembayaran
            </Link>
          </>
        }
      />

      <Flash error={params.err} ok={params.ok} />

      <div className="stat-grid">
        <Stat
          label="Okupansi"
          value={`${occupancy}%`}
          hint={`${occupied} dari ${totalRooms} kamar aktif · ${properties} properti`}
        />
        <Stat
          label={`Pendapatan ${monthLabel(month)}`}
          value={rupiah(revenue._sum.amount ?? 0)}
          hint="Pembayaran terverifikasi bulan ini"
        />
        <Stat
          label="Total tunggakan"
          value={rupiah(outstanding)}
          hint={`${overdueTop.length ? "Ada tunggakan lewat jatuh tempo" : "Tidak ada tunggakan"}`}
        />
        <Stat
          label="Jatuh tempo 7 hari"
          value={dueSoon.length}
          hint={`${openTickets} tiket perbaikan terbuka`}
        />
      </div>

      <div className="grid-2">
        <Card
          title="Tagihan akan jatuh tempo"
          description="7 hari ke depan"
          actions={<Link className="btn btn-sm" href="/tagihan">Semua</Link>}
          tight
        >
          {dueSoon.length === 0 ? (
            <Empty title="Tidak ada tagihan jatuh tempo" description="Semua tagihan dalam 7 hari ke depan sudah beres." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Penyewa</th>
                    <th>Kamar</th>
                    <th className="num">Sisa</th>
                    <th>Jatuh tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {dueSoon.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/tagihan/${invoice.id}`}>{invoice.contract.tenant.name}</Link>
                      </td>
                      <td>{invoice.contract.room.number}</td>
                      <td className="num">{rupiah(invoice.total - invoice.paidTotal)}</td>
                      <td>{dateID(invoice.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Tunggakan terlama"
          description="Melewati jatuh tempo"
          actions={<Link className="btn btn-sm" href="/laporan?tab=arrears">Laporan</Link>}
          tight
        >
          {overdueTop.length === 0 ? (
            <Empty title="Semua tagihan lancar 🎉" description="Tidak ada tunggakan saat ini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Penyewa</th>
                    <th>Kamar</th>
                    <th className="num">Tunggakan</th>
                    <th>Sejak</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueTop.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link href={`/tagihan/${invoice.id}`}>{invoice.contract.tenant.name}</Link>
                      </td>
                      <td>{invoice.contract.room.number}</td>
                      <td className="num">{rupiah(invoice.total - invoice.paidTotal)}</td>
                      <td>{dateID(invoice.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Status kamar" description="Distribusi seluruh kamar aktif" tight>
          <div className="card-body">
            <div className="row" style={{ gap: 18 }}>
              {Object.entries(ROOM_STATUS).map(([key, meta]) => {
                const count = rooms.filter((room) => room.status === key).length;
                if (!count) return null;
                return (
                  <div key={key} className="stack" style={{ gap: 2 }}>
                    <span className="muted small">{meta.label}</span>
                    <span style={{ fontWeight: 700, fontSize: 18 }}>{count}</span>
                    <span className="small muted">{percent(count, totalRooms)}</span>
                  </div>
                );
              })}
              {totalRooms === 0 ? <Empty title="Belum ada kamar" description="Tambahkan properti dan kamar terlebih dahulu." /> : null}
            </div>
          </div>
        </Card>

        <Card title="Pembayaran terverifikasi terbaru" tight>
          {recentPayments.length === 0 ? (
            <Empty title="Belum ada pembayaran" description="Pembayaran yang diverifikasi akan muncul di sini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Penyewa</th>
                    <th>Kamar</th>
                    <th className="num">Nominal</th>
                    <th>Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link href={`/tagihan/${payment.invoiceId}`}>
                          {payment.invoice.contract.tenant.name}
                        </Link>
                      </td>
                      <td>{payment.invoice.contract.room.number}</td>
                      <td className="num">{rupiah(payment.amount)}</td>
                      <td>{dateID(payment.verifiedAt ?? payment.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Status tagihan bulan ini" tight>
        {dueSoon.length === 0 && overdueTop.length === 0 ? (
          <Empty title="Belum ada tagihan aktif" description="Buat tagihan melalui menu Tagihan." />
        ) : (
          <div className="card-body">
            <div className="row">
              {Object.entries(INVOICE_STATUS).map(([key, meta]) => (
                <StatusBadge key={key} map={{ [key]: meta }} value={key} />
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              Gunakan menu <Link href="/tagihan">Tagihan</Link> untuk membuat tagihan massal, menambah item,
              dan memverifikasi pembayaran.
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
