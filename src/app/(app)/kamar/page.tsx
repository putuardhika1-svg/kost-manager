import Link from "next/link";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { propertyScopeWhere, roomScopeWhere } from "@/lib/scope";
import { dateID, rupiah } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { ROOM_STATUS } from "@/lib/constants";
import { createRoomAction, changeRoomStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = ["kosong", "booked", "perbaikan", "nonaktif"];

export default async function RoomPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; propertyId?: string; status?: string }>;
}) {
  const user = await requireRole(["owner", "admin", "staff"]);
  const scope = await propertyScope(user);
  const params = await searchParams;

  const [properties, rooms] = await Promise.all([
    prisma.property.findMany({
      where: propertyScopeWhere(scope),
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.room.findMany({
      where: {
        ...roomScopeWhere(scope),
        ...(params.propertyId ? { propertyId: params.propertyId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        property: true,
        contracts: {
          where: { status: "active" },
          include: { tenant: true },
          take: 1,
        },
      },
      orderBy: [{ property: { name: "asc" } }, { number: "asc" }],
    }),
  ]);

  const canEdit = user.role === "owner" || user.role === "admin";

  return (
    <>
      <PageHeader
        title="Kamar"
        subtitle="Grid status kamar, harga sewa, dan penyewa aktif."
        actions={
          <Link className="btn btn-sm" href="/properti">
            Properti
          </Link>
        }
      />
      <Flash error={params.err} ok={params.ok} />

      <Card title="Filter" tight>
        <div className="card-body">
          <form className="filters" method="get">
            <div className="field">
              <label>Properti</label>
              <select name="propertyId" defaultValue={params.propertyId ?? ""}>
                <option value="">Semua properti</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select name="status" defaultValue={params.status ?? ""}>
                <option value="">Semua status</option>
                {Object.entries(ROOM_STATUS).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit">
              Terapkan
            </button>
            <Link className="btn btn-sm" href="/kamar">
              Reset
            </Link>
          </form>
        </div>
      </Card>

      <Card title={`Daftar kamar (${rooms.length})`} tight>
        {rooms.length === 0 ? (
          <Empty
            title="Belum ada kamar"
            description="Tambahkan kamar melalui formulir di bawah atau buat properti terlebih dahulu."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Properti</th>
                  <th>Nomor</th>
                  <th className="num">Lantai</th>
                  <th>Tipe</th>
                  <th className="num">Harga / bulan</th>
                  <th>Status</th>
                  <th>Penyewa</th>
                  {canEdit ? <th>Ubah status</th> : null}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td>
                      <Link href={`/properti/${room.propertyId}`}>{room.property.name}</Link>
                    </td>
                    <td className="mono">{room.number}</td>
                    <td className="num">{room.floor}</td>
                    <td>{room.type ?? "-"}</td>
                    <td className="num">{rupiah(room.monthlyPrice)}</td>
                    <td>
                      <StatusBadge map={ROOM_STATUS} value={room.status} />
                    </td>
                    <td>
                      {room.contracts[0] ? (
                        <span>
                          {room.contracts[0].tenant.name}
                          <span className="small muted"> · s.d. {dateID(room.contracts[0].endDate)}</span>
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    {canEdit ? (
                      <td>
                        <form action={changeRoomStatusAction} className="row" style={{ gap: 6 }}>
                          <input type="hidden" name="roomId" value={room.id} />
                          <select name="status" defaultValue={room.status} style={{ width: 110 }}>
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {ROOM_STATUS[status]?.label ?? status}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-sm" type="submit">
                            Ubah
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canEdit ? (
        <Card title="Tambah kamar">
          <form action={createRoomAction}>
            <div className="form-grid">
              <Field label="Properti">
                <select name="propertyId" required defaultValue={params.propertyId ?? ""}>
                  <option value="">Pilih properti</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nomor kamar">
                <input name="number" required placeholder="A-01" maxLength={10} />
              </Field>
              <Field label="Lantai">
                <input name="floor" type="number" min={0} max={50} defaultValue={1} />
              </Field>
              <Field label="Tipe">
                <input name="type" placeholder="Standar / AC" />
              </Field>
              <Field label="Harga sewa per bulan">
                <input name="monthlyPrice" type="number" min={1} required placeholder="1200000" />
              </Field>
              <Field label="Status awal">
                <select name="status" defaultValue="kosong">
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {ROOM_STATUS[status]?.label ?? status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fasilitas" hint="Pisahkan dengan koma: AC, kasur, lemari" full>
                <input name="facilities" placeholder="AC, kasur, lemari, kamar mandi dalam" />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Simpan kamar
              </button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
