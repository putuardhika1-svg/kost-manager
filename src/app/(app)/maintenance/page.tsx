import Link from "next/link";
import { propertyScope, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { maintenanceScopeWhere, roomScopeWhere, tenantScopeWhere } from "@/lib/scope";
import { dateID, rupiah } from "@/lib/format";
import { MAINT_CATEGORIES, MAINT_STATUS, PRIORITIES } from "@/lib/constants";
import { Card, Empty, Field, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { createMaintenanceAction, updateMaintenanceAction } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  umum: "Umum",
  listrik: "Listrik",
  air: "Air",
  kebersihan: "Kebersihan",
  perabot: "Perabot",
  keamanan: "Keamanan",
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; status?: string; priority?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const isTenant = user.role === "tenant";
  const canManage = user.role === "owner" || user.role === "admin" || user.role === "staff";

  if (!canManage && !isTenant) {
    return (
      <>
        <PageHeader title="Perbaikan" />
        <Card title="Akses ditolak">
          <p className="small muted" style={{ margin: 0 }}>
            Peran Anda tidak memiliki akses ke modul perbaikan.
          </p>
        </Card>
      </>
    );
  }

  if (isTenant && !user.tenant) {
    return (
      <>
        <PageHeader title="Perbaikan" />
        <Flash error={params.err} ok={params.ok} />
        <Card title="Akun belum terhubung">
          <p className="small muted" style={{ margin: 0 }}>
            Hubungi owner/admin untuk menghubungkan akun Anda dengan data penyewa.
          </p>
        </Card>
      </>
    );
  }

  const scope = isTenant ? [] : await propertyScope(user);
  const tenantId = user.tenant?.id ?? null;
  const statusFilter = params.status ?? "all";
  const priorityFilter = params.priority ?? "all";

  const tickets = await prisma.maintenance.findMany({
    where: {
      ...(isTenant && tenantId ? { tenantId } : maintenanceScopeWhere(scope)),
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
      ...(priorityFilter === "all" ? {} : { priority: priorityFilter }),
    },
    include: {
      room: { include: { property: true } },
      tenant: { select: { id: true, name: true, phone: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const roomWhere = isTenant && tenantId
    ? {
        contracts: { some: { tenantId, status: "active" as const } },
      }
    : roomScopeWhere(scope);

  const [rooms, tenants] = await Promise.all([
    prisma.room.findMany({
      where: { ...roomWhere, status: { not: "nonaktif" } },
      include: { property: true },
      orderBy: [{ property: { name: "asc" } }, { number: "asc" }],
    }),
    isTenant
      ? Promise.resolve([])
      : prisma.tenant.findMany({
          where: { ...tenantScopeWhere(scope), status: "aktif" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, phone: true },
        }),
  ]);

  const counts = tickets.reduce<Record<string, number>>((acc, ticket) => {
    acc[ticket.status] = (acc[ticket.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Perbaikan"
        subtitle={
          isTenant
            ? "Laporkan kerusakan kamar dan pantau status penanganannya."
            : "Kelola tiket perbaikan, prioritas, teknisi, dan biaya."
        }
        actions={
          <Link className="btn btn-sm" href="/dashboard">
            Dashboard
          </Link>
        }
      />
      <Flash error={params.err} ok={params.ok} />

      <div className="stat-grid">
        {Object.entries(MAINT_STATUS).map(([key, meta]) => (
          <Stat key={key} label={meta.label} value={counts[key] ?? 0} hint="tiket" />
        ))}
      </div>

      <Card
        title={`Daftar tiket (${tickets.length})`}
        actions={
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {[{ key: "all", label: "Semua" }, ...Object.entries(MAINT_STATUS).map(([key, meta]) => ({ key, label: meta.label }))].map(
              (tab) => (
                <Link
                  key={tab.key}
                  className={`btn btn-sm${statusFilter === tab.key ? " btn-primary" : ""}`}
                  href={`/maintenance?status=${tab.key}`}
                >
                  {tab.label}
                </Link>
              ),
            )}
          </div>
        }
        tight
      >
        {tickets.length === 0 ? (
          <Empty
            title="Belum ada tiket"
            description={isTenant ? "Laporkan kerusakan melalui formulir di bawah." : "Tiket dari penyewa akan muncul di sini."}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kamar</th>
                  <th>Masalah</th>
                  <th>Kategori</th>
                  <th>Prioritas</th>
                  <th>Status</th>
                  <th className="num">Biaya</th>
                  {canManage ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{dateID(ticket.createdAt)}</td>
                    <td>
                      {ticket.room.property.name} · {ticket.room.number}
                      <div className="small muted">{ticket.tenant?.name ?? "-"}</div>
                    </td>
                    <td>
                      {ticket.title}
                      <div className="small muted">{ticket.description}</div>
                      {ticket.assignedTo ? (
                        <div className="small muted">Teknisi: {ticket.assignedTo}</div>
                      ) : null}
                    </td>
                    <td>{CATEGORY_LABELS[ticket.category] ?? ticket.category}</td>
                    <td>
                      <StatusBadge map={PRIORITIES} value={ticket.priority} />
                    </td>
                    <td>
                      <StatusBadge map={MAINT_STATUS} value={ticket.status} />
                    </td>
                    <td className="num">{ticket.cost ? rupiah(ticket.cost) : "-"}</td>
                    {canManage ? (
                      <td className="right">
                        <details>
                          <summary className="btn btn-sm" style={{ cursor: "pointer" }}>
                            Kelola
                          </summary>
                          <form
                            action={updateMaintenanceAction}
                            style={{ marginTop: 8, minWidth: 240, textAlign: "left" }}
                          >
                            <input type="hidden" name="ticketId" value={ticket.id} />
                            <div className="field" style={{ marginBottom: 6 }}>
                              <label className="small">Status</label>
                              <select name="status" defaultValue={ticket.status}>
                                {Object.entries(MAINT_STATUS).map(([key, meta]) => (
                                  <option key={key} value={key}>
                                    {meta.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field" style={{ marginBottom: 6 }}>
                              <label className="small">Prioritas</label>
                              <select name="priority" defaultValue={ticket.priority}>
                                {Object.entries(PRIORITIES).map(([key, meta]) => (
                                  <option key={key} value={key}>
                                    {meta.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field" style={{ marginBottom: 6 }}>
                              <label className="small">Teknisi</label>
                              <input name="assignedTo" defaultValue={ticket.assignedTo ?? ""} placeholder="Nama teknisi" />
                            </div>
                            <div className="field" style={{ marginBottom: 8 }}>
                              <label className="small">Biaya (Rp)</label>
                              <input name="cost" type="number" min={0} defaultValue={ticket.cost} />
                            </div>
                            <button className="btn btn-sm btn-primary" type="submit">
                              Simpan
                            </button>
                          </form>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Buat tiket perbaikan">
        {rooms.length === 0 ? (
          <Empty
            title="Tidak ada kamar tersedia"
            description={isTenant ? "Anda belum memiliki kontrak aktif." : "Tambahkan kamar terlebih dahulu."}
          />
        ) : (
          <form action={createMaintenanceAction}>
            <div className="form-grid">
              <Field label="Kamar">
                <select name="roomId" required defaultValue={rooms.length === 1 ? rooms[0].id : ""}>
                  <option value="">Pilih kamar</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.property.name} · {room.number}
                    </option>
                  ))}
                </select>
              </Field>
              {!isTenant ? (
                <Field label="Penyewa (opsional)">
                  <select name="tenantId" defaultValue="">
                    <option value="">Tidak terkait penyewa</option>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} — {tenant.phone}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <input type="hidden" name="tenantId" value={user.tenant?.id ?? ""} />
              )}
              <Field label="Judul">
                <input name="title" required maxLength={120} placeholder="AC tidak dingin" />
              </Field>
              <Field label="Kategori">
                <select name="category" defaultValue="umum">
                  {MAINT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category] ?? category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioritas">
                <select name="priority" defaultValue="sedang">
                  {Object.entries(PRIORITIES).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Deskripsi" full>
                <textarea name="description" required maxLength={1000} placeholder="Jelaskan masalah secara singkat." />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Kirim tiket
              </button>
              <span className="small muted">Tiket prioritas tinggi memicu notifikasi ke admin.</span>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
