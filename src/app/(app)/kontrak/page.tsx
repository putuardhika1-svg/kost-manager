import Link from "next/link";
import { propertyScope, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contractScopeWhere, roomScopeWhere, tenantScopeWhere } from "@/lib/scope";
import { dateID, inputDate, rupiah } from "@/lib/format";
import { Card, Empty, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { currentYearMonth, lastDayOfMonthISO, firstDayOfMonthISO } from "@/lib/dates";
import { createContractAction, endContractAction, sendContractReminderAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; status?: string }>;
}) {
  const user = await requireRole(["owner", "admin"]);
  const scope = await propertyScope(user);
  const params = await searchParams;
  const statusFilter = params.status ?? "active";

  const [contracts, tenants, rooms] = await Promise.all([
    prisma.contract.findMany({
      where: {
        ...contractScopeWhere(scope),
        ...(statusFilter === "all" ? {} : { status: statusFilter }),
      },
      include: {
        tenant: true,
        room: { include: { property: true } },
        invoices: { select: { id: true, status: true, total: true, paidTotal: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.tenant.findMany({
      where: { ...tenantScopeWhere(scope), status: "aktif" },
      orderBy: { name: "asc" },
    }),
    prisma.room.findMany({
      where: { ...roomScopeWhere(scope), status: { not: "nonaktif" } },
      include: {
        property: true,
        contracts: { where: { status: "active" }, select: { id: true } },
      },
      orderBy: [{ property: { name: "asc" } }, { number: "asc" }],
    }),
  ]);

  const availableRooms = rooms.filter((room) => room.contracts.length === 0);
  const ym = currentYearMonth();

  return (
    <>
      <PageHeader
        title="Kontrak sewa"
        subtitle="Buat kontrak baru, pantau masa sewa, dan proses check-out."
      />
      <Flash error={params.err} ok={params.ok} />

      <Card
        title={`Daftar kontrak (${contracts.length})`}
        actions={
          <div className="row" style={{ gap: 6 }}>
            {[
              { key: "active", label: "Aktif" },
              { key: "ended", label: "Selesai" },
              { key: "all", label: "Semua" },
            ].map((item) => (
              <Link
                key={item.key}
                className={`btn btn-sm${statusFilter === item.key ? " btn-primary" : ""}`}
                href={`/kontrak?status=${item.key}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        }
        tight
      >
        {contracts.length === 0 ? (
          <Empty
            title="Belum ada kontrak"
            description="Buat kontrak baru agar kamar berstatus terisi dan tagihan dapat dibuat."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Penyewa</th>
                  <th>Kamar</th>
                  <th>Periode</th>
                  <th className="num">Sewa</th>
                  <th className="num">Deposit</th>
                  <th className="num">Tunggakan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => {
                  const outstanding = contract.invoices
                    .filter((invoice) => invoice.status === "unpaid" || invoice.status === "overdue")
                    .reduce((sum, invoice) => sum + (invoice.total - invoice.paidTotal), 0);
                  return (
                    <tr key={contract.id}>
                      <td>
                        <Link href={`/penyewa/${contract.tenantId}`}>{contract.tenant.name}</Link>
                        <div className="small muted">{contract.tenant.phone}</div>
                      </td>
                      <td>
                        {contract.room.property.name}
                        <div className="small muted">Kamar {contract.room.number}</div>
                      </td>
                      <td>
                        {dateID(contract.startDate)} — {dateID(contract.endDate)}
                        <div className="small muted">
                          <StatusBadge
                            map={{
                              active: { label: "Aktif", tone: "green" },
                              ended: { label: "Selesai", tone: "gray" },
                              cancelled: { label: "Dibatalkan", tone: "red" },
                            }}
                            value={contract.status}
                          />
                        </div>
                      </td>
                      <td className="num">{rupiah(contract.rentAmount)}</td>
                      <td className="num">{rupiah(contract.deposit)}</td>
                      <td className="num">{outstanding ? rupiah(outstanding) : "-"}</td>
                      <td className="right">
                        {contract.status === "active" ? (
                          <>
                          {Math.ceil((contract.endDate.getTime() - Date.now()) / 86_400_000) <= 30 ? (
                            <form action={sendContractReminderAction} className="inline" style={{ marginRight: 6 }}>
                              <input type="hidden" name="contractId" value={contract.id} />
                              <button className="btn btn-sm" type="submit">
                                Ingatkan
                              </button>
                            </form>
                          ) : null}
                          <details>
                            <summary className="btn btn-sm" style={{ cursor: "pointer" }}>
                              Check-out
                            </summary>
                            <form
                              action={endContractAction}
                              style={{ marginTop: 8, minWidth: 220, textAlign: "left" }}
                            >
                              <input type="hidden" name="contractId" value={contract.id} />
                              <div className="field" style={{ marginBottom: 6 }}>
                                <label className="small">Potongan deposit</label>
                                <input
                                  type="number"
                                  name="deduction"
                                  min={0}
                                  max={contract.deposit}
                                  defaultValue={0}
                                />
                              </div>
                              <div className="field" style={{ marginBottom: 8 }}>
                                <label className="small">Status kamar setelah keluar</label>
                                <select name="roomStatusAfter" defaultValue="kosong">
                                  <option value="kosong">Kosong</option>
                                  <option value="perbaikan">Perbaikan</option>
                                </select>
                              </div>
                              <div className="small muted" style={{ marginBottom: 8 }}>
                                Deposit dikembalikan: {rupiah(contract.deposit)} − potongan
                              </div>
                              <button className="btn btn-sm btn-primary" type="submit">
                                Akhiri kontrak
                              </button>
                            </form>
                          </details>
                          </>
                        ) : (
                          <span className="muted small">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Buat kontrak baru">
        {availableRooms.length === 0 ? (
          <Empty
            title="Tidak ada kamar tersedia"
            description="Semua kamar sudah memiliki kontrak aktif atau berstatus nonaktif."
          />
        ) : (
          <form action={createContractAction}>
            <div className="form-grid">
              <Field label="Penyewa">
                <select name="tenantId" required defaultValue="">
                  <option value="">Pilih penyewa</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} — {tenant.phone}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kamar tersedia">
                <select name="roomId" required defaultValue="">
                  <option value="">Pilih kamar</option>
                  {availableRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.property.name} · {room.number} — {rupiah(room.monthlyPrice)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tanggal mulai">
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={firstDayOfMonthISO(ym.year, ym.month)}
                />
              </Field>
              <Field label="Tanggal berakhir">
                <input
                  name="endDate"
                  type="date"
                  required
                  defaultValue={lastDayOfMonthISO(ym.year + 1, ym.month)}
                />
              </Field>
              <Field label="Harga sewa per bulan">
                <input name="rentAmount" type="number" min={1} required placeholder="1200000" />
              </Field>
              <Field label="Deposit">
                <input name="deposit" type="number" min={0} defaultValue={0} />
              </Field>
              <Field label="Tanggal tagih" hint="1–28 setiap bulan">
                <input name="billingDay" type="number" min={1} max={28} defaultValue={1} />
              </Field>
              <Field label="Catatan">
                <input name="notes" placeholder="Opsional" />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Simpan kontrak
              </button>
              <span className="small muted">
                Kamar otomatis berubah menjadi terisi setelah kontrak dibuat.
              </span>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
