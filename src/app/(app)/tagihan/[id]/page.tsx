import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { propertyScope, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateID, dateTimeID, inputDate, rupiah } from "@/lib/format";
import {
  INVOICE_STATUS,
  ITEM_TYPES,
  NOTIFICATION_STATUS,
  PAYMENT_CHANNEL_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} from "@/lib/constants";
import { Badge, Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { RequirementList } from "@/components/requirements";
import { getInvoiceRequirements } from "@/lib/requirements";
import { ConfirmForm } from "@/components/confirm-form";
import { PhotoInput } from "@/components/photo-input";
import {
  addItemAction,
  deleteInvoiceAction,
  publishInvoiceAction,
  recordPaymentAction,
  removeItemAction,
  sendReminderAction,
  tenantUploadProofAction,
  updateInvoiceDueDateAction,
  updateItemAction,
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
      items: { include: { meterReading: { select: { id: true, photoUrl: true } } } },
      payments: {
        orderBy: { paidAt: "desc" },
        include: {
          verifiedBy: { select: { name: true } },
          channel: { select: { label: true, type: true } },
        },
      },
      notifications: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!invoice) notFound();

  const propertyId = invoice.contract.room.propertyId;

  if (isTenant) {
    if (!user.tenant || invoice.contract.tenantId !== user.tenant.id) {
      redirect("/tagihan?err=Akses+ditolak");
    }
  } else {
    const scope = await propertyScope(user);
    if (scope !== null && !scope.includes(propertyId)) {
      redirect("/tagihan?err=Akses+ditolak");
    }
  }

  const [requirements, channels] = await Promise.all([
    getInvoiceRequirements(invoice.id),
    prisma.paymentChannel.findMany({
      where: { propertyId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const transferChannels = channels.filter((channel) => channel.type !== "cash");
  const cashChannels = channels.filter((channel) => channel.type === "cash");

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

      {requirements ? (
        <Card
          title="Syarat penerbitan tagihan"
          description={
            invoice.status === "draft"
              ? "Tagihan belum dapat dibayar sampai syarat berikut lengkap dan admin menerbitkan tagihan."
              : "Checklist kelengkapan saat tagihan diterbitkan."
          }
        >
          <RequirementList items={requirements.items} waived={requirements.waived} />
          {canManage && invoice.status === "draft" ? (
            requirements.complete ? (
              <form action={publishInvoiceAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button className="btn btn-primary" type="submit">
                  Terbitkan tagihan
                </button>
              </form>
            ) : (
              <details style={{ marginTop: 12 }}>
                <summary className="small" style={{ cursor: "pointer" }}>
                  Terbitkan dengan override (alasan wajib)
                </summary>
                <form action={publishInvoiceAction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <input type="hidden" name="force" value="1" />
                  <div className="form-grid">
                    <Field label="Alasan override" full>
                      <input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={300}
                        placeholder="Contoh: meter sudah dicek manual, foto menyusul"
                      />
                    </Field>
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-danger" type="submit">
                      Terbitkan tanpa syarat lengkap
                    </button>
                  </div>
                </form>
              </details>
            )
          ) : null}
          {isTenant && invoice.status === "draft" ? (
            <p className="small muted" style={{ marginBottom: 0 }}>
              Lengkapi pembacaan meter listrik, lalu tunggu admin menerbitkan tagihan.
              {requirements.items.some((item) => item.key === "meter" && !item.ok) ? (
                <>
                  {" "}
                  <Link href="/meter">Isi meter sekarang →</Link>
                </>
              ) : null}
            </p>
          ) : null}
        </Card>
      ) : null}

      {canEdit ? (
        <Card
          title="Pengaturan tagihan"
          description="Ubah tanggal jatuh tempo. Status tagihan dihitung ulang otomatis."
        >
          <form action={updateInvoiceDueDateAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div className="form-grid">
              <Field label="Jatuh tempo">
                <input name="dueDate" type="date" required defaultValue={inputDate(invoice.dueDate)} />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Simpan jatuh tempo
              </button>
            </div>
          </form>
        </Card>
      ) : null}

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
                    <th>Kanal</th>
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
                      <td className="small">{payment.channel?.label ?? "-"}</td>
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
                  <td>
                    {item.description}
                    {item.meterReading?.photoUrl ? (
                      <div className="small">
                        <a href={item.meterReading.photoUrl} target="_blank" rel="noreferrer">
                          Lihat foto meter
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td>{ITEM_TYPES[item.type] ?? item.type}</td>
                  <td className="num">{rupiah(item.amount)}</td>
                  <td className="right">
                    {canEdit && item.type !== "rent" ? (
                      <>
                        {!item.meterReadingId ? (
                          <details style={{ marginBottom: 6 }}>
                            <summary className="btn btn-sm" style={{ cursor: "pointer" }}>
                              Edit
                            </summary>
                            <form
                              action={updateItemAction}
                              style={{ marginTop: 8, minWidth: 240, textAlign: "left" }}
                            >
                              <input type="hidden" name="itemId" value={item.id} />
                              <input type="hidden" name="invoiceId" value={invoice.id} />
                              <div className="field" style={{ marginBottom: 6 }}>
                                <label className="small">Deskripsi</label>
                                <input
                                  name="description"
                                  defaultValue={item.description}
                                  required
                                  minLength={2}
                                />
                              </div>
                              <div className="field" style={{ marginBottom: 6 }}>
                                <label className="small">Jenis</label>
                                <select name="type" defaultValue={item.type}>
                                  <option value="utility">Utilitas</option>
                                  <option value="penalty">Denda</option>
                                  <option value="other">Lainnya</option>
                                </select>
                              </div>
                              <div className="field" style={{ marginBottom: 8 }}>
                                <label className="small">Nominal (Rp)</label>
                                <input
                                  name="amount"
                                  type="number"
                                  min={1}
                                  required
                                  defaultValue={item.amount}
                                />
                              </div>
                              <button className="btn btn-sm btn-primary" type="submit">
                                Simpan item
                              </button>
                            </form>
                          </details>
                        ) : null}
                        <ConfirmForm
                          action={removeItemAction}
                          confirmMessage={`Hapus item "${item.description}" dari tagihan?`}
                        >
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <button className="btn btn-sm btn-danger" type="submit">
                            Hapus
                          </button>
                        </ConfirmForm>
                      </>
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

      {invoice.status !== "draft" && invoice.status !== "void" ? (
        <Card
          title="Metode pembayaran"
          description="Gunakan salah satu metode berikut, lalu kirim bukti pembayaran."
          tight
        >
          {channels.length === 0 ? (
            <Empty
              title="Belum ada metode pembayaran"
              description="Hubungi admin untuk informasi rekening, QRIS, atau pembayaran tunai."
            />
          ) : (
            <div className="grid-3">
              {channels.map((channel) => (
                <div key={channel.id} className="card" style={{ margin: 0 }}>
                  <div className="card-body">
                    <Badge tone={PAYMENT_CHANNEL_TYPES[channel.type]?.tone ?? "gray"}>
                      {PAYMENT_CHANNEL_TYPES[channel.type]?.label ?? channel.type}
                    </Badge>
                    <div style={{ fontWeight: 600, marginTop: 8 }}>{channel.label}</div>
                    {channel.type === "bank" ? (
                      <dl className="kv" style={{ marginTop: 8 }}>
                        <dt>Bank</dt>
                        <dd>{channel.bankName}</dd>
                        <dt>No. rekening</dt>
                        <dd className="mono">{channel.accountNumber}</dd>
                        <dt>Atas nama</dt>
                        <dd>{channel.accountHolder}</dd>
                      </dl>
                    ) : null}
                    {channel.type === "qris" && channel.qrisUrl ? (
                      <a href={channel.qrisUrl} target="_blank" rel="noreferrer">
                        <img
                          src={channel.qrisUrl}
                          alt={`QRIS ${channel.label}`}
                          style={{ maxWidth: "100%", marginTop: 8, borderRadius: 8 }}
                        />
                      </a>
                    ) : null}
                    {channel.instructions ? (
                      <div className="small muted" style={{ marginTop: 8 }}>
                        {channel.instructions}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          {cashChannels.length > 0 ? (
            <p className="small muted">
              Pembayaran tunai dicatat oleh admin setelah uang diterima.
            </p>
          ) : null}
        </Card>
      ) : null}

      {canTenantPay && transferChannels.length > 0 ? (
        <Card
          title="Kirim bukti pembayaran"
          description="Pilih rekening/QRIS yang dipakai, lalu unggah bukti. Admin akan memverifikasi."
        >
          <form action={tenantUploadProofAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <div className="form-grid">
              <Field label="Metode pembayaran" full>
                <select name="channelId" required defaultValue={transferChannels[0]?.id ?? ""}>
                  {transferChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.label} — {PAYMENT_CHANNEL_TYPES[channel.type]?.label ?? channel.type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nominal transfer (Rp)">
                    <input name="amount" type="number" min={1} defaultValue={availableToPay} required />
              </Field>
              <Field label="Tanggal bayar">
                <input name="paidAt" type="date" defaultValue={inputDate(new Date())} />
              </Field>
              <Field label="Bukti transfer (JPG/PNG/WEBP/PDF)" hint="Maks. 4 MB" full>
                <PhotoInput
                  name="proof"
                  required
                  allowPdf
                  hint="Foto langsung dari kamera, atau pilih file/PDF."
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
              <form action={recordPaymentAction}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="form-grid">
                  <Field label="Kanal (opsional)" hint="Jika dipilih, metode mengikuti kanal.">
                    <select name="channelId" defaultValue="">
                      <option value="">Manual / tanpa kanal</option>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.label} — {PAYMENT_CHANNEL_TYPES[channel.type]?.label ?? channel.type}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Metode">
                    <select name="method" defaultValue="transfer">
                      <option value="transfer">Transfer</option>
                      <option value="qris">QRIS</option>
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
                    <PhotoInput name="proof" allowPdf />
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

      {canManage && (invoice.status === "draft" || invoice.status === "void") ? (
        <Card
          title="Hapus tagihan"
          description="Hapus permanen tagihan draft/dibatalkan beserta rinciannya. Tagihan yang memiliki pembayaran tidak dapat dihapus."
        >
          <ConfirmForm
            action={deleteInvoiceAction}
            confirmMessage={`Hapus tagihan ${invoice.invoiceNo}? Tindakan ini tidak dapat dibatalkan.`}
          >
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button className="btn btn-danger" type="submit">
              Hapus tagihan
            </button>
          </ConfirmForm>
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
