import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { propertyScope, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateID, dateTimeID, inputDate, rupiah } from "@/lib/format";
import {
  INVOICE_STATUS,
  ITEM_TYPES,
  NOTIFICATION_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} from "@/lib/constants";
import { Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import {
  addItemAction,
  publishInvoiceAction,
  recordPaymentAction,
  removeItemAction,
  sendReminderAction,
  tenantUploadProofAction,
  voidInvoiceAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const flash = await searchParams;

  const isTenant = user.role === "tenant";
  const canManage = user.role === "owner" || user.role === "admin";
  const canView = canManage || user.role === "staff";

  if (!isTenant && !canView) {
    redirect("/dashboard?err=Akses+ditolak");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      contract: { include: { tenant: true, room: { include: { property: true } } } },
      items: true,
      payments: {
        orderBy: { paidAt: "desc" },
        include: { verifiedBy: { select: { name: true } } },
      },
      notifications: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!invoice) notFound();

  if (isTenant) {
    if (!user.tenant || invoice.contract.tenantId !== user.tenant.id) {
      redirect("/tagihan?err=Akses+ditolak");
    }
  } else {
    const scope = await propertyScope(user);
    const propertyId = invoice.contract.room.propertyId;
    if (scope !== null && !scope.includes(propertyId)) {
      redirect("/tagihan?err=Akses+ditolak");
    }
  }

  const outstanding = Math.max(0, invoice.total - invoice.paidTotal);
  const pendingTotal = invoice.payments
    .filter((payment) => payment.status === "pending")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const availableToPay = Math.max(0, outstanding - pendingTotal);
  const canEdit = canManage && invoice.status !== "paid" && invoice.status !== "void";
  const canPay =
    canManage &&
    invoice.status !== "void" &&
    invoice.status !== "draft" &&
    availableToPay > 0;
  const canTenantPay =
    isTenant &&
    availableToPay > 0 &&
    invoice.status !== "draft" &&
    invoice.status !== "void" &&
    invoice.status !== "paid";

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <Link className="small" href="/tagihan">
          ← Kembali ke daftar tagihan
        </Link>
        <div className="row" style={{ gap: 8 }}>
          {canManage && invoice.status === "draft" ? (
            <form action={publishInvoiceAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button className="btn btn-sm btn-primary" type="submit">
                Terbitkan tagihan
              </button>
            </form>
          ) : null}
          {canManage && (invoice.status === "unpaid" || invoice.status === "overdue") ? (
            <form action={sendReminderAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button className="btn btn-sm" type="submit">
                Kirim pengingat
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <PageHeader
        title={invoice.invoiceNo}
        subtitle={`Periode ${dateID(invoice.periodStart)} — ${dateID(invoice.periodEnd)}`}
        actions={<StatusBadge map={INVOICE_STATUS} value={invoice.status} />}
      />
      <Flash error={flash.err} ok={flash.ok} />

      <div className="grid-2">
        <Card title="Informasi tagihan">
          <dl className="kv">
            <dt>Penyewa</dt>
            <dd>
              {isTenant ? (
                invoice.contract.tenant.name
              ) : (
                <Link href={`/penyewa/${invoice.contract.tenantId}`}>
                  {invoice.contract.tenant.name}
                </Link>
              )}
              <div className="small muted">{invoice.contract.tenant.phone}</div>
            </dd>
            <dt>Kamar</dt>
            <dd>
              {invoice.contract.room.property.name} · Kamar {invoice.contract.room.number}
            </dd>
            <dt>Tanggal terbit</dt>
            <dd>{invoice.status === "draft" ? "Belum diterbitkan" : dateID(invoice.issueDate)}</dd>
            <dt>Jatuh tempo</dt>
            <dd>{dateID(invoice.dueDate)}</dd>
            <dt>Subtotal sewa</dt>
            <dd>{rupiah(invoice.subtotal)}</dd>
            <dt>Biaya tambahan</dt>
            <dd>{rupiah(invoice.additionalTotal)}</dd>
            <dt>Total</dt>
            <dd>
              <strong>{rupiah(invoice.total)}</strong>
            </dd>
            <dt>Sudah dibayar</dt>
            <dd>{rupiah(invoice.paidTotal)}</dd>
            <dt>Sisa</dt>
            <dd>
              <strong>{rupiah(outstanding)}</strong>
              {pendingTotal > 0 ? (
                <div className="small muted">Menunggu verifikasi: {rupiah(pendingTotal)}</div>
              ) : null}
            </dd>
            {invoice.voidReason ? (
              <>
                <dt>Alasan batal</dt>
                <dd>{invoice.voidReason}</dd>
              </>
            ) : null}
          </dl>
        </Card>

        <Card title={`Pembayaran (${invoice.payments.length})`} tight>
          {invoice.payments.length === 0 ? (
            <Empty title="Belum ada pembayaran" description="Catat pembayaran melalui formulir di bawah." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Metode</th>
                    <th className="num">Nominal</th>
                    <th>Status</th>
                    <th>Bukti</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {dateID(payment.paidAt)}
                        {payment.verifiedBy ? (
                          <div className="small muted">oleh {payment.verifiedBy.name}</div>
                        ) : null}
                      </td>
                      <td>{PAYMENT_METHODS[payment.method] ?? payment.method}</td>
                      <td className="num">{rupiah(payment.amount)}</td>
                      <td>
                        <StatusBadge map={PAYMENT_STATUS} value={payment.status} />
                        {payment.rejectionReason ? (
                          <div className="small muted">{payment.rejectionReason}</div>
                        ) : null}
                      </td>
                      <td>
                        {payment.proofUrl ? (
                          <a className="small" href={payment.proofUrl} target="_blank" rel="noreferrer">
                            Lihat
                          </a>
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
      </div>

      <Card
        title={`Rincian tagihan (${invoice.items.length})`}
        description="Item sewa tidak dapat dihapus; item lain dapat disesuaikan selama tagihan belum lunas."
        tight
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Deskripsi</th>
                <th>Jenis</th>
                <th className="num">Nominal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{ITEM_TYPES[item.type] ?? item.type}</td>
                  <td className="num">{rupiah(item.amount)}</td>
                  <td className="right">
                    {canEdit && item.type !== "rent" ? (
                      <form action={removeItemAction}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <button className="btn btn-sm btn-danger" type="submit">
                          Hapus
                        </button>
                      </form>
                    ) : (
                      <span className="small muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canTenantPay ? (
        <Card
          title="Kirim bukti pembayaran"
          description="Unggah bukti transfer; admin akan memverifikasi pembayaran Anda."
        >
          <form action={tenantUploadProofAction} encType="multipart/form-data">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div className="form-grid">
              <Field label="Nominal transfer (Rp)">
                    <input name="amount" type="number" min={1} defaultValue={availableToPay} required />
              </Field>
              <Field label="Tanggal bayar">
                <input name="paidAt" type="date" defaultValue={inputDate(new Date())} />
              </Field>
              <Field label="Bukti transfer (JPG/PNG/WEBP/PDF)" hint="Maks. 4 MB" full>
                <input
                  name="proof"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                />
              </Field>
              <Field label="Catatan" full>
                <input name="notes" placeholder="Opsional" maxLength={500} />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Kirim bukti
              </button>
              {pendingTotal > 0 ? (
                <span className="small muted">Menunggu verifikasi: {rupiah(pendingTotal)}</span>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      {canEdit ? (
        <div className="grid-2">
          <Card title="Tambah biaya">
            <form action={addItemAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <div className="form-grid">
                <Field label="Deskripsi" full>
                  <input name="description" required placeholder="Listrik tambahan, denda keterlambatan, dll." />
                </Field>
                <Field label="Jenis">
                  <select name="type" defaultValue="utility">
                    <option value="utility">Utilitas</option>
                    <option value="penalty">Denda</option>
                    <option value="other">Lainnya</option>
                  </select>
                </Field>
                <Field label="Nominal (Rp)">
                  <input name="amount" type="number" min={1} required placeholder="50000" />
                </Field>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">
                  Tambah item
                </button>
              </div>
            </form>
          </Card>

          <Card title="Catat pembayaran">
            {canPay ? (
              <form action={recordPaymentAction} encType="multipart/form-data">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="form-grid">
                  <Field label="Metode">
                    <select name="method" defaultValue="transfer">
                      <option value="transfer">Transfer</option>
                      <option value="cash">Tunai</option>
                    </select>
                  </Field>
                  <Field label="Nominal (Rp)">
                <input name="amount" type="number" min={1} defaultValue={availableToPay} required />
                  </Field>
                  <Field label="Tanggal bayar">
                    <input name="paidAt" type="date" defaultValue={inputDate(new Date())} />
                  </Field>
                  <Field label="Bukti (JPG/PNG/PDF)" hint="Maks. 4 MB, opsional untuk tunai">
                    <input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
                  </Field>
                  <Field label="Catatan" full>
                    <input name="notes" placeholder="Opsional" />
                  </Field>
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit">
                    Simpan pembayaran
                  </button>
                  <span className="small muted">
                    Tunai otomatis terverifikasi; transfer masuk antrean verifikasi.
                  </span>
                </div>
              </form>
            ) : (
              <Empty
                title={invoice.status === "draft" ? "Tagihan masih draft" : "Tagihan sudah lunas"}
                description={
                  invoice.status === "draft"
                    ? "Terbitkan tagihan terlebih dahulu sebelum mencatat pembayaran."
                    : "Tidak ada sisa tagihan yang perlu dibayar."
                }
              />
            )}
          </Card>
        </div>
      ) : null}

      {canManage && invoice.status !== "paid" && invoice.status !== "void" ? (
        <Card title="Batalkan tagihan">
          <form action={voidInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div className="form-grid">
              <Field label="Alasan pembatalan" hint="Minimal 5 karakter" full>
                <input name="reason" required placeholder="Salah input periode, penyewa pindah, dll." />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" type="submit">
                Batalkan tagihan
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {!isTenant ? (
      <Card title="Riwayat notifikasi" tight>
        {invoice.notifications.length === 0 ? (
          <Empty title="Belum ada notifikasi" description="Notifikasi tercatat otomatis saat tagihan diterbitkan atau diingatkan." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Template</th>
                  <th>Kanal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoice.notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td>{dateTimeID(notification.createdAt)}</td>
                    <td>{notification.templateKey}</td>
                    <td>{notification.channel === "whatsapp" ? "WhatsApp" : "Email"}</td>
                    <td>
                      <StatusBadge map={NOTIFICATION_STATUS} value={notification.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      ) : null}
    </>
  );
}
