import Link from "next/link";
import { notFound } from "next/navigation";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rupiah } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { ROOM_STATUS } from "@/lib/constants";
import { updatePropertyAction } from "../actions";

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
