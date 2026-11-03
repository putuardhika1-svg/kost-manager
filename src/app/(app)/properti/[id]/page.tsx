import Link from "next/link";
import { notFound } from "next/navigation";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupiah } from "@/lib/format";
import { Badge, Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { ROOM_STATUS } from "@/lib/constants";
import {
  createPaymentChannelAction,
  togglePaymentChannelAction,
  updatePropertyAction,
  updatePropertyBillingAction,
} from "../actions";

const CHANNEL_TYPES: Record<string, { label: string; tone: "green" | "red" | "amber" | "blue" | "gray" }> = {
  bank: { label: "Transfer bank", tone: "blue" },
  qris: { label: "QRIS", tone: "green" },
  cash: { label: "Tunai", tone: "amber" },
};

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
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

  if (scope !== null && !scope.includes(id)) notFound();

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      rooms: {
        include: {
          contracts: { where: { status: "active" }, include: { tenant: true } },
        },
        orderBy: { number: "asc" },
      },
      paymentChannels: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!property) notFound();

  const occupied = property.rooms.filter((room) => room.status === "terisi").length;
  const potentialRevenue = property.rooms
    .filter((room) => room.status === "terisi")
    .reduce((sum, room) => sum + room.monthlyPrice, 0);

  return (
    <>
      <PageHeader
        title={property.name}
        subtitle={`${property.address}, ${property.city}`}
        actions={
          <>
            <Link className="btn btn-sm" href="/properti">
              Kembali
            </Link>
            <Link className="btn btn-sm btn-primary" href={`/kamar?propertyId=${property.id}`}>
              Kelola kamar
            </Link>
          </>
        }
      />

      <Flash error={flash.err} ok={flash.ok} />

      <div className="grid-2">
        <Card title="Informasi properti" tight>
          <div className="card-body">
            <dl className="kv">
              <dt>Kode</dt>
              <dd className="mono">{property.code}</dd>
              <dt>Alamat</dt>
              <dd>{property.address}</dd>
              <dt>Kota</dt>
              <dd>{property.city}</dd>
              <dt>Jumlah kamar</dt>
              <dd>{property.rooms.length}</dd>
              <dt>Kamar terisi</dt>
              <dd>{occupied}</dd>
              <dt>Potensi pendapatan</dt>
              <dd>{rupiah(potentialRevenue)} / bulan</dd>
              <dt>Tarif listrik</dt>
              <dd>{rupiah(property.electricityTariff)} / kWh</dd>
              <dt>Syarat meter</dt>
              <dd>{property.requireMeterReading ? "Wajib sebelum terbit" : "Tidak wajib"}</dd>
              <dt>Syarat profil</dt>
              <dd>{property.requireTenantProfile ? "Wajib lengkap" : "Tidak wajib"}</dd>
              <dt>Catatan</dt>
              <dd>{property.notes ?? "-"}</dd>
            </dl>
          </div>
        </Card>

        <Card title="Ubah informasi">
          <form action={updatePropertyAction}>
            <input type="hidden" name="id" value={property.id} />
            <div className="form-grid">
              <Field label="Nama properti">
                <input name="name" defaultValue={property.name} required />
              </Field>
              <Field label="Kode">
                <input name="code" defaultValue={property.code} required maxLength={12} />
              </Field>
              <Field label="Alamat" full>
                <input name="address" defaultValue={property.address} required />
              </Field>
              <Field label="Kota">
                <input name="city" defaultValue={property.city} required />
              </Field>
              <Field label="Catatan">
                <input name="notes" defaultValue={property.notes ?? ""} />
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
        title="Listrik & syarat tagihan"
        description="Pembacaan meter listrik diverifikasi sebelum tagihan dapat diterbitkan."
      >
        <form action={updatePropertyBillingAction}>
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="form-grid">
            <Field label="Tarif listrik (Rp/kWh)">
              <input
                name="electricityTariff"
                type="number"
                min={0}
                required
                defaultValue={property.electricityTariff}
              />
            </Field>
            <Field label="Syarat tagihan" hint="Berlaku untuk invoice berikutnya">
              <label className="row small" style={{ paddingTop: 8 }}>
                <input
                  type="checkbox"
                  name="requireMeterReading"
                  defaultChecked={property.requireMeterReading}
                  style={{ width: "auto" }}
                />
                Wajib pembacaan meter listrik
              </label>
              <label className="row small" style={{ paddingTop: 6 }}>
                <input
                  type="checkbox"
                  name="requireTenantProfile"
                  defaultChecked={property.requireTenantProfile}
                  style={{ width: "auto" }}
                />
                Wajib profil penyewa lengkap
              </label>
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Simpan pengaturan listrik
            </button>
          </div>
        </form>
      </Card>

      <Card
        title={`Metode pembayaran (${property.paymentChannels.length})`}
        description="Tampil ke penyewa pada detail tagihan. QRIS berupa gambar statis."
        tight
      >
        {property.paymentChannels.length === 0 ? (
          <Empty title="Belum ada metode pembayaran" description="Tambahkan rekening, QRIS, atau instruksi tunai di bawah." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipe</th>
                  <th>Label</th>
                  <th>Detail</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {property.paymentChannels.map((channel) => (
                  <tr key={channel.id}>
                    <td>
                      <Badge tone={CHANNEL_TYPES[channel.type]?.tone ?? "gray"}>
                        {CHANNEL_TYPES[channel.type]?.label ?? channel.type}
                      </Badge>
                    </td>
                    <td>{channel.label}</td>
                    <td className="small">
                      {channel.type === "bank" ? (
                        <>
                          {channel.bankName} · {channel.accountNumber}
                          <div className="muted">{channel.accountHolder}</div>
                        </>
                      ) : channel.type === "qris" ? (
                        channel.qrisUrl ? (
                          <a href={channel.qrisUrl} target="_blank" rel="noreferrer">
                            Lihat QRIS
                          </a>
                        ) : (
                          "-"
                        )
                      ) : (
                        channel.instructions ?? "-"
                      )}
                    </td>
                    <td>
                      <Badge tone={channel.isActive ? "green" : "gray"}>
                        {channel.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </td>
                    <td className="right">
                      <form action={togglePaymentChannelAction}>
                        <input type="hidden" name="channelId" value={channel.id} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <button className="btn btn-sm" type="submit">
                          {channel.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card-body" style={{ borderTop: "1px solid var(--line)" }}>
          <form action={createPaymentChannelAction}>
            <input type="hidden" name="propertyId" value={property.id} />
            <div className="form-grid">
              <Field label="Tipe">
                <select name="type" defaultValue="bank">
                  <option value="bank">Transfer bank</option>
                  <option value="qris">QRIS</option>
                  <option value="cash">Tunai</option>
                </select>
              </Field>
              <Field label="Label" hint="Contoh: BCA a.n. Budi / QRIS Kost Mawar">
                <input name="label" required maxLength={80} />
              </Field>
              <Field label="Nama bank (untuk transfer)">
                <input name="bankName" maxLength={80} placeholder="BCA" />
              </Field>
              <Field label="Nomor rekening">
                <input name="accountNumber" maxLength={60} placeholder="1234567890" />
              </Field>
              <Field label="Atas nama">
                <input name="accountHolder" maxLength={100} placeholder="Budi Santoso" />
              </Field>
              <Field label="Gambar QRIS" hint="Wajib untuk tipe QRIS, maks. 4 MB">
                <input name="qris" type="file" accept="image/jpeg,image/png,image/webp" />
              </Field>
              <Field label="Instruksi" full>
                <input name="instructions" maxLength={500} placeholder="Bayar tunai di kantor, Senin–Sabtu 08.00–17.00" />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Tambah metode
              </button>
            </div>
          </form>
        </div>
      </Card>

      <Card title="Daftar kamar" tight>
        {property.rooms.length === 0 ? (
          <Empty title="Belum ada kamar" description="Tambahkan kamar melalui menu Kamar." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nomor</th>
                  <th className="num">Lantai</th>
                  <th>Tipe</th>
                  <th className="num">Harga</th>
                  <th>Status</th>
                  <th>Penyewa aktif</th>
                </tr>
              </thead>
              <tbody>
                {property.rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="mono">{room.number}</td>
                    <td className="num">{room.floor}</td>
                    <td>{room.type ?? "-"}</td>
                    <td className="num">{rupiah(room.monthlyPrice)}</td>
                    <td>
                      <StatusBadge map={ROOM_STATUS} value={room.status} />
                    </td>
                    <td>{room.contracts[0]?.tenant.name ?? "-"}</td>
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
