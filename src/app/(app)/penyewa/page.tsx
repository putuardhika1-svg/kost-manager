import Link from "next/link";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tenantScopeWhere } from "@/lib/scope";
import { dateID, rupiah } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader } from "@/components/ui";
import { createTenantAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; q?: string }>;
}) {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const params = await searchParams;
  const q = (params.q ?? "").trim();

  const tenants = await prisma.tenant.findMany({
    where: {
      ...tenantScopeWhere(scope),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      contracts: {
        include: { room: { include: { property: true } } },
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="Penyewa" subtitle="Data penyewa beserta kontrak aktif dan riwayatnya." />
      <Flash error={params.err} ok={params.ok} />

      <Card
        title={`Daftar penyewa (${tenants.length})`}
        actions={
          <form method="get" className="row" style={{ gap: 6 }}>
            <input name="q" defaultValue={q} placeholder="Cari nama / telepon" style={{ width: 220 }} />
            <button className="btn btn-sm" type="submit">
              Cari
            </button>
          </form>
        }
        tight
      >
        {tenants.length === 0 ? (
          <Empty
            title="Belum ada penyewa"
            description="Tambahkan penyewa baru melalui formulir di bawah."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Telepon</th>
                  <th>Kontrak aktif</th>
                  <th className="num">Sewa / bulan</th>
                  <th>Berakhir</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => {
                  const active = tenant.contracts.find((contract) => contract.status === "active");
                  return (
                    <tr key={tenant.id}>
                      <td>
                        <Link href={`/penyewa/${tenant.id}`}>{tenant.name}</Link>
                        {tenant.email ? <div className="small muted">{tenant.email}</div> : null}
                      </td>
                      <td className="mono">{tenant.phone}</td>
                      <td>
                        {active ? (
                          <span>
                            {active.room.property.name} · {active.room.number}
                          </span>
                        ) : (
                          <span className="muted">Tidak ada</span>
                        )}
                      </td>
                      <td className="num">{active ? rupiah(active.rentAmount) : "-"}</td>
                      <td>{active ? dateID(active.endDate) : "-"}</td>
                      <td className="right">
                        <Link className="btn btn-sm" href={`/penyewa/${tenant.id}`}>
                          Detail
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

      <Card title="Tambah penyewa">
        <form action={createTenantAction}>
          <div className="form-grid">
            <Field label="Nama lengkap">
              <input name="name" required placeholder="Rizky Pratama" />
            </Field>
            <Field label="Nomor telepon" hint="Contoh: 081234567890">
              <input name="phone" required placeholder="081234567890" />
            </Field>
            <Field label="Email (opsional)">
              <input name="email" type="email" placeholder="rizky@email.com" />
            </Field>
            <Field label="Nomor KTP (opsional)">
              <input name="idNumber" placeholder="3273xxxxxxxxxxxx" />
            </Field>
            <Field label="Kontak darurat (opsional)">
              <input name="emergencyContact" placeholder="Ibu Sari - 0812xxxx" />
            </Field>
            <Field label="Alamat asal (opsional)">
              <input name="addressOrigin" placeholder="Cimahi, Jawa Barat" />
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Simpan penyewa
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
