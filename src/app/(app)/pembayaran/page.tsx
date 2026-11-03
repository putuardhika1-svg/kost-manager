import Link from "next/link";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentScopeWhere } from "@/lib/scope";
import { dateID, rupiah } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_STATUS } from "@/lib/constants";
import { Card, Empty, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { rejectPaymentAction, verifyPaymentAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaymentInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; status?: string }>;
}) {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const params = await searchParams;
  const statusFilter = params.status ?? "pending";

  const [payments, summary] = await Promise.all([
    prisma.payment.findMany({
      where: {
        ...paymentScopeWhere(scope),
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
      },
      include: {
        invoice: { include: { contract: { include: { tenant: true, room: { include: { property: true } } } } } },
        channel: { select: { label: true } },
        verifiedBy: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 200,
    }),
    prisma.payment.groupBy({
      by: ["status"],
      where: paymentScopeWhere(scope),
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const countOf = (status: string) =>
    summary.find((row) => row.status === status)?._count._all ?? 0;
  const sumOf = (status: string) => summary.find((row) => row.status === status)?._sum.amount ?? 0;

  const tabs = [
    { key: "pending", label: `Menunggu (${countOf("pending")})` },
    { key: "verified", label: `Terverifikasi (${countOf("verified")})` },
    { key: "rejected", label: `Ditolak (${countOf("rejected")})` },
    { key: "all", label: "Semua" },
  ];

  return (
    <>
      <PageHeader
        title="Verifikasi pembayaran"
        subtitle="Periksa bukti transfer yang dikirim penyewa sebelum dinyatakan sah."
      />
      <Flash error={params.err} ok={params.ok} />

      <div className="stat-grid">
        <Stat label="Menunggu verifikasi" value={countOf("pending")} hint={rupiah(sumOf("pending"))} />
        <Stat label="Terverifikasi" value={countOf("verified")} hint={rupiah(sumOf("verified"))} />
        <Stat label="Ditolak" value={countOf("rejected")} hint={rupiah(sumOf("rejected"))} />
      </div>

      <Card
        title={`Antrean pembayaran (${payments.length})`}
        actions={
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                className={`btn btn-sm${statusFilter === tab.key ? " btn-primary" : ""}`}
                href={`/pembayaran?status=${tab.key}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        }
        tight
      >
        {payments.length === 0 ? (
          <Empty
            title="Tidak ada pembayaran"
            description="Pembayaran transfer dari penyewa akan muncul di sini untuk diverifikasi."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Penyewa</th>
                  <th>Tagihan</th>
                  <th>Metode</th>
                  <th>Kanal</th>
                  <th className="num">Nominal</th>
                  <th>Bukti</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{dateID(payment.paidAt)}</td>
                    <td>
                      {payment.invoice.contract.tenant.name}
                      <div className="small muted">
                        {payment.invoice.contract.room.property.name} · Kamar{" "}
                        {payment.invoice.contract.room.number}
                      </div>
                    </td>
                    <td>
                      <Link href={`/tagihan/${payment.invoiceId}`}>{payment.invoice.invoiceNo}</Link>
                    </td>
                    <td>{PAYMENT_METHODS[payment.method] ?? payment.method}</td>
                    <td className="small">{payment.channel?.label ?? "-"}</td>
                    <td className="num">{rupiah(payment.amount)}</td>
                    <td>
                      {payment.proofUrl ? (
                        <a className="small" href={payment.proofUrl} target="_blank" rel="noreferrer">
                          Lihat bukti
                        </a>
                      ) : (
                        <span className="small muted">-</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge map={PAYMENT_STATUS} value={payment.status} />
                      {payment.verifiedBy ? (
                        <div className="small muted">oleh {payment.verifiedBy.name}</div>
                      ) : null}
                      {payment.rejectionReason ? (
                        <div className="small muted">{payment.rejectionReason}</div>
                      ) : null}
                    </td>
                    <td className="right">
                      {payment.status === "pending" ? (
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <form action={verifyPaymentAction}>
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <button className="btn btn-sm btn-primary" type="submit">
                              Verifikasi
                            </button>
                          </form>
                          <details>
                            <summary className="btn btn-sm btn-danger" style={{ cursor: "pointer" }}>
                              Tolak
                            </summary>
                            <form
                              action={rejectPaymentAction}
                              style={{ marginTop: 8, minWidth: 220, textAlign: "left" }}
                            >
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <div className="field" style={{ marginBottom: 8 }}>
                                <label className="small">Alasan penolakan</label>
                                <input name="reason" required placeholder="Bukti tidak jelas, nominal kurang" />
                              </div>
                              <button className="btn btn-sm btn-danger" type="submit">
                                Kirim penolakan
                              </button>
                            </form>
                          </details>
                        </div>
                      ) : (
                        <span className="small muted">-</span>
                      )}
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
