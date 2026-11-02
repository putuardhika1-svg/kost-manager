import Link from "next/link";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { propertyScopeWhere } from "@/lib/scope";
import { percent } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { createPropertyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const params = await searchParams;

  const properties = await prisma.property.findMany({
    where: propertyScopeWhere(scope),
    include: { rooms: { select: { status: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="Properti" subtitle="Kelola lokasi kost dan kamar di dalamnya." />
      <Flash error={params.err} ok={params.ok} />

      <Card title="Daftar properti" tight>
        {properties.length === 0 ? (
          <Empty
            title="Belum ada properti"
            description="Tambahkan properti pertama Anda pada formulir di bawah."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Kode</th>
                  <th>Kota</th>
                  <th className="num">Kamar</th>
                  <th className="num">Terisi</th>
                  <th className="num">Okupansi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => {
                  const total = property.rooms.length;
                  const occupied = property.rooms.filter((room) => room.status === "terisi").length;
                  return (
                    <tr key={property.id}>
                      <td>
                        <Link href={`/properti/${property.id}`}>{property.name}</Link>
                        <div className="small muted">{property.address}</div>
                      </td>
                      <td className="mono">{property.code}</td>
                      <td>{property.city}</td>
                      <td className="num">{total}</td>
                      <td className="num">{occupied}</td>
                      <td className="num">{percent(occupied, total)}</td>
                      <td className="right">
                        <Link className="btn btn-sm" href={`/kamar?propertyId=${property.id}`}>
                          Kamar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Tambah properti" description="Kode properti dipakai pada nomor tagihan.">
        <form action={createPropertyAction}>
          <div className="form-grid">
            <Field label="Nama properti">
              <input name="name" required placeholder="Kost Melati" />
            </Field>
            <Field label="Kode" hint="Contoh: MLT (huruf/angka, maks. 12)">
              <input name="code" required placeholder="MLT" maxLength={12} />
            </Field>
            <Field label="Alamat" full>
              <input name="address" required placeholder="Jl. Melati No. 10" />
            </Field>
            <Field label="Kota">
              <input name="city" required placeholder="Bandung" />
            </Field>
            <Field label="Catatan (opsional)">
              <input name="notes" placeholder="Kost putri, fasilitas lengkap" />
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Simpan properti
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
