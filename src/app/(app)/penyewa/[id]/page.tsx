import Link from "next/link";
import { notFound } from "next/navigation";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateID, rupiah } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { INVOICE_STATUS } from "@/lib/constants";
import { ConfirmForm } from "@/components/confirm-form";
import {
  deleteTenantAction,
  setTenantStatusAction,
  updateTenantAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const { id } = await params;
  const flash = await searchParams;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      contracts: {
        include: {
          room: { include: { property: true } },
          invoices: { orderBy: { periodStart: "desc" }, take: 12 },
        },
        orderBy: { startDate: "desc" },
      },
      notifications: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!tenant) notFound();

  if (scope !== null) {
    const allowed = tenant.contracts.some((contract) => scope.includes(contract.room.propertyId));
    if (!allowed) notFound();
  }

  const active = tenant.contracts.find((contract) => contract.status === "active");
  const unpaid = tenant.contracts
    .flatMap((contract) => contract.invoices)
    .filter((invoice) => invoice.status === "unpaid" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + (invoice.total - invoice.paidTotal), 0);

  return (
    <>
      <PageHeader
        title={tenant.name}
        subtitle={`${tenant.phone}${tenant.email ? " · " + tenant.email : ""}`}
        actions={
          <>
            <Link className="btn btn-sm" href="/penyewa">
              Kembali
            </Link>
            {active ? (
              <Link className="btn btn-sm" href="/tagihan">
                Tagihan
              </Link>
            ) : null}
          </>
        }
      />

      <Flash error={flash.err} ok={flash.ok} />

      <div className="grid-2">
        <Card title="Informasi penyewa" tight>
          <div className="card-body">
            <dl className="kv">
              <dt>Nama</dt>
              <dd>{tenant.name}</dd>
              <dt>Telepon</dt>
              <dd className="mono">{tenant.phone}</dd>
              <dt>Email</dt>
              <dd>{tenant.email ?? "-"}</dd>
              <dt>No. KTP</dt>
              <dd className="mono">{tenant.idNumber ?? "-"}</dd>
              <dt>Kontak darurat</dt>
              <dd>{tenant.emergencyContact ?? "-"}</dd>
              <dt>Alamat asal</dt>
              <dd>{tenant.addressOrigin ?? "-"}</dd>
              <dt>Status</dt>
              <dd>{tenant.status}</dd>
              <dt>Total tunggakan</dt>
              <dd>{rupiah(unpaid)}</dd>
            </dl>
          </div>
        </Card>

        <Card title="Ubah data penyewa">
          <form action={updateTenantAction}>
            <input type="hidden" name="id" value={tenant.id} />
            <div className="form-grid">
              <Field label="Nama">
                <input name="name" defaultValue={tenant.name} required />
              </Field>
              <Field label="Telepon">
                <input name="phone" defaultValue={tenant.phone} required />
              </Field>
              <Field label="Email">
                <input name="email" type="email" defaultValue={tenant.email ?? ""} />
              </Field>
              <Field label="No. KTP">
                <input name="idNumber" defaultValue={tenant.idNumber ?? ""} />
              </Field>
              <Field label="Kontak darurat">
                <input name="emergencyContact" defaultValue={tenant.emergencyContact ?? ""} />
              </Field>
              <Field label="Alamat asal">
                <input name="addressOrigin" defaultValue={tenant.addressOrigin ?? ""} />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Simpan perubahan
              </button>
            </div>
          </form>
        </Card>
      </div>

      <Card
        title="Pengaturan penyewa"
        description="Nonaktifkan penyewa untuk menandai tidak aktif tanpa menghapus riwayat. Hapus permanen hanya tersedia bila belum memiliki kontrak."
      >
        <div className="grid-2">
          <form action={setTenantStatusAction}>
            <input type="hidden" name="id" value={tenant.id} />
            <div className="form-grid">
              <Field label="Status penyewa" hint="Penyewa nonaktif tidak dapat dibuatkan kontrak baru.">
                <select name="status" defaultValue={tenant.status}>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Simpan status
              </button>
            </div>
          </form>

          <div>
            <ConfirmForm
              action={deleteTenantAction}
              confirmMessage={`Hapus penyewa ${tenant.name}? Tindakan ini tidak dapat dibatalkan.`}
            >
              <input type="hidden" name="id" value={tenant.id} />
              <button className="btn btn-danger" type="submit" disabled={tenant.contracts.length > 0}>
                Hapus penyewa
              </button>
            </ConfirmForm>
            {tenant.contracts.length > 0 ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Penyewa sudah memiliki riwayat kontrak, gunakan status nonaktif.
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card title="Riwayat kontrak" tight>
        {tenant.contracts.length === 0 ? (
          <Empty title="Belum ada kontrak" description="Buat kontrak melalui menu Kontrak." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kamar</th>
                  <th>Mulai</th>
                  <th>Berakhir</th>
                  <th className="num">Sewa</th>
                  <th className="num">Deposit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenant.contracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>
                      {contract.room.property.name} · {contract.room.number}
                    </td>
                    <td>{dateID(contract.startDate)}</td>
                    <td>{dateID(contract.endDate)}</td>
                    <td className="num">{rupiah(contract.rentAmount)}</td>
                    <td className="num">{rupiah(contract.deposit)}</td>
                    <td>
                      <StatusBadge
                        map={{
                          pending: { label: "Menunggu persetujuan", tone: "amber" },
                          active: { label: "Aktif", tone: "green" },
                          ended: { label: "Selesai", tone: "gray" },
                          cancelled: { label: "Ditolak / dibatalkan", tone: "red" },
                        }}
                        value={contract.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Tagihan terakhir" tight>
          {tenant.contracts.every((contract) => contract.invoices.length === 0) ? (
            <Empty title="Belum ada tagihan" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No. tagihan</th>
                    <th>Periode</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.contracts.flatMap((contract) =>
                    contract.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="mono">
                          <Link href={`/tagihan/${invoice.id}`}>{invoice.invoiceNo}</Link>
                        </td>
                        <td>{dateID(invoice.periodStart)}</td>
                        <td className="num">{rupiah(invoice.total)}</td>
                        <td>
                          <StatusBadge map={INVOICE_STATUS} value={invoice.status} />
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Riwayat notifikasi" tight>
          {tenant.notifications.length === 0 ? (
            <Empty title="Belum ada notifikasi" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Kanal</th>
                    <th>Status</th>
                    <th>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.notifications.map((log) => (
                    <tr key={log.id}>
                      <td className="mono">{log.templateKey}</td>
                      <td>{log.channel}</td>
                      <td>{log.status}</td>
                      <td>{dateID(log.sentAt ?? log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
