import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS, NOTIFICATION_STATUS } from "@/lib/constants";
import { dateID, dateTimeID } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { createUserAction, resetPasswordAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireRole(["owner"]);
  const flash = await searchParams;

  const [users, properties, tenants, auditLogs, notifications, tenantsCount, roomsCount] =
    await Promise.all([
      prisma.user.findMany({
        include: {
          properties: { include: { property: { select: { name: true } } } },
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.property.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.tenant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
      prisma.auditLog.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.notificationLog.findMany({
        include: {
          tenant: { select: { name: true } },
          invoice: { select: { invoiceNo: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.tenant.count(),
      prisma.room.count(),
    ]);

  return (
    <>
      <PageHeader
        title="Pengaturan"
        subtitle="Kelola pengguna, hak akses properti, audit log, dan log notifikasi."
      />
      <Flash error={flash.err} ok={flash.ok} />

      <Card title="Akun masuk" tight>
        <div className="card-body">
          <dl className="kv">
            <dt>Nama</dt>
            <dd>{user.name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Peran</dt>
            <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
            <dt>Terakhir masuk</dt>
            <dd>{user.lastLoginAt ? dateTimeID(user.lastLoginAt) : "-"}</dd>
          </dl>
        </div>
      </Card>

      <Card title={`Pengguna (${users.length})`} description="Owner dapat mengelola peran dan cakupan properti." tight>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th>Cakupan</th>
                <th>Status</th>
                <th>Terakhir masuk</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    {item.phone ? <div className="small muted">{item.phone}</div> : null}
                  </td>
                  <td className="mono">{item.email}</td>
                  <td>{ROLE_LABELS[item.role] ?? item.role}</td>
                  <td>
                    {item.role === "owner"
                      ? "Semua properti"
                      : item.role === "tenant"
                        ? item.tenant?.name ?? "Belum terhubung"
                        : item.properties.length
                          ? item.properties.map((p) => p.property.name).join(", ")
                          : "Belum ditugaskan"}
                  </td>
                  <td>
                    <span className={`badge ${item.isActive ? "badge-green" : "badge-gray"}`}>
                      {item.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td>{item.lastLoginAt ? dateID(item.lastLoginAt) : "-"}</td>
                  <td className="right">
                    <details>
                      <summary className="btn btn-sm" style={{ cursor: "pointer" }}>
                        Kelola
                      </summary>
                      <div style={{ marginTop: 10, minWidth: 260, textAlign: "left" }}>
                        <form action={updateUserAction}>
                          <input type="hidden" name="userId" value={item.id} />
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Nama</label>
                            <input name="name" defaultValue={item.name} required />
                          </div>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Telepon</label>
                            <input name="phone" defaultValue={item.phone ?? ""} />
                          </div>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Peran</label>
                            <select name="role" defaultValue={item.role}>
                              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Data penyewa (untuk peran tenant)</label>
                            <select name="tenantId" defaultValue={item.tenantId ?? ""}>
                              <option value="">-</option>
                              {tenants.map((tenant) => (
                                <option key={tenant.id} value={tenant.id}>
                                  {tenant.name} — {tenant.phone}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Cakupan properti</label>
                            <select
                              name="propertyIds"
                              multiple
                              size={Math.min(5, Math.max(2, properties.length))}
                              defaultValue={item.properties.map((p) => p.propertyId)}
                            >
                              {properties.map((property) => (
                                <option key={property.id} value={property.id}>
                                  {property.name}
                                </option>
                              ))}
                            </select>
                            <span className="hint">Ctrl/Cmd untuk memilih beberapa.</span>
                          </div>
                          <label className="row small" style={{ marginBottom: 8 }}>
                            <input
                              type="checkbox"
                              name="isActive"
                              defaultChecked={item.isActive}
                              style={{ width: "auto" }}
                            />
                            Aktif
                          </label>
                          <button className="btn btn-sm btn-primary" type="submit">
                            Simpan pengguna
                          </button>
                        </form>

                        <form action={resetPasswordAction} style={{ marginTop: 10 }}>
                          <input type="hidden" name="userId" value={item.id} />
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Reset password</label>
                            <input
                              name="password"
                              type="password"
                              minLength={8}
                              placeholder="Min. 8 karakter, huruf + angka"
                            />
                          </div>
                          <button className="btn btn-sm" type="submit">
                            Reset password
                          </button>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tambah pengguna">
        <form action={createUserAction}>
          <div className="form-grid">
            <Field label="Nama">
              <input name="name" required placeholder="Nama pengguna" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required placeholder="nama@kost.local" />
            </Field>
            <Field label="Password awal" hint="Min. 8 karakter, huruf + angka">
              <input name="password" type="password" required minLength={8} />
            </Field>
            <Field label="Telepon (opsional)">
              <input name="phone" placeholder="081234567890" />
            </Field>
            <Field label="Peran">
              <select name="role" defaultValue="staff">
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data penyewa" hint="Wajib untuk peran tenant">
              <select name="tenantId" defaultValue="">
                <option value="">-</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} — {tenant.phone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cakupan properti" hint="Abaikan untuk owner/tenant. Ctrl/Cmd untuk memilih beberapa." full>
              <select name="propertyIds" multiple size={Math.min(6, Math.max(2, properties.length))}>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit">
              Buat pengguna
            </button>
          </div>
        </form>
      </Card>

      <Card title="Ringkasan data" tight>
        <div className="card-body">
          <dl className="kv">
            <dt>Properti</dt>
            <dd>{properties.length}</dd>
            <dt>Kamar</dt>
            <dd>{roomsCount}</dd>
            <dt>Penyewa</dt>
            <dd>{tenantsCount}</dd>
            <dt>Pengguna</dt>
            <dd>{users.length}</dd>
          </dl>
        </div>
      </Card>

      <Card title={`Audit log (${auditLogs.length})`} description="100 aktivitas terakhir." tight>
        {auditLogs.length === 0 ? (
          <Empty title="Belum ada aktivitas" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Pengguna</th>
                  <th>Aksi</th>
                  <th>Entitas</th>
                  <th>Referensi</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{dateTimeID(log.createdAt)}</td>
                    <td>{log.user?.name ?? "Sistem"}</td>
                    <td className="mono">{log.action}</td>
                    <td>{log.entity}</td>
                    <td className="mono small">{log.entityId ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Log notifikasi (${notifications.length})`} description="50 pengiriman terakhir." tight>
        {notifications.length === 0 ? (
          <Empty title="Belum ada notifikasi" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Penerima</th>
                  <th>Template</th>
                  <th>Kanal</th>
                  <th>Tagihan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((log) => (
                  <tr key={log.id}>
                    <td>{dateTimeID(log.createdAt)}</td>
                    <td>{log.tenant?.name ?? "-"}</td>
                    <td className="mono">{log.templateKey}</td>
                    <td>{log.channel === "whatsapp" ? "WhatsApp" : "Email"}</td>
                    <td className="mono">{log.invoice?.invoiceNo ?? "-"}</td>
                    <td>
                      <StatusBadge map={NOTIFICATION_STATUS} value={log.status} />
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
