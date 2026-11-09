import Link from "next/link";
import { propertyScope, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roomScopeWhere } from "@/lib/scope";
import { dateID, inputDate, rupiah } from "@/lib/format";
import { METER_SOURCES, METER_STATUS } from "@/lib/constants";
import { Badge, Card, Empty, Field, Flash, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { ConfirmForm } from "@/components/confirm-form";
import { PhotoInput } from "@/components/photo-input";
import {
  attachMeterReadingAction,
  createBaselineAction,
  deleteMeterReadingAction,
  recordMeterReadingAction,
  rejectMeterReadingAction,
  tenantSubmitMeterReadingAction,
  updateMeterReadingAction,
  verifyMeterReadingAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function MeterPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireUser();
  const flash = await searchParams;

  if (user.role === "tenant") {
    if (!user.tenant) {
      return (
        <>
          <PageHeader title="Meter Listrik" subtitle="Akun belum terhubung ke data penyewa." />
          <Flash error={flash.err} ok={flash.ok} />
          <Card title="Akun belum terhubung">
            <p className="small muted" style={{ margin: 0 }}>
              Hubungi admin untuk menghubungkan akun Anda dengan data penyewa.
            </p>
          </Card>
        </>
      );
    }

    const contract = await prisma.contract.findFirst({
      where: { tenantId: user.tenant.id, status: "active" },
      include: { room: { include: { property: true } } },
      orderBy: { startDate: "desc" },
    });

    if (!contract) {
      return (
        <>
          <PageHeader title="Meter Listrik" subtitle="Belum ada kontrak aktif." />
          <Flash error={flash.err} ok={flash.ok} />
          <Card title="Tidak ada kontrak aktif">
            <p className="small muted" style={{ margin: 0 }}>
              Pembacaan meter dapat dikirim setelah kontrak aktif dibuat admin.
            </p>
          </Card>
        </>
      );
    }

    const [lastReading, pending, history] = await Promise.all([
      prisma.meterReading.findFirst({
        where: { roomId: contract.roomId, status: { in: ["verified", "billed"] } },
        orderBy: [{ readingAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.meterReading.findFirst({
        where: { roomId: contract.roomId, status: "pending" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.meterReading.findMany({
        where: { roomId: contract.roomId },
        orderBy: { readingAt: "desc" },
        take: 12,
        include: { invoice: { select: { invoiceNo: true } } },
      }),
    ]);

    return (
      <>
        <PageHeader
          title="Meter Listrik"
          subtitle={`${contract.room.property.name} · Kamar ${contract.room.number}`}
          actions={
            <Link className="btn btn-sm" href="/tagihan">
              Tagihan saya
            </Link>
          }
        />
        <Flash error={flash.err} ok={flash.ok} />

        <div className="stat-grid">
          <Stat
            label="Pembacaan terakhir"
            value={lastReading ? `${lastReading.currentReading} kWh` : "-"}
            hint={lastReading ? dateID(lastReading.readingAt) : "Belum ada"}
          />
          <Stat
            label="Tarif listrik"
            value={`${rupiah(contract.room.property.electricityTariff)}/kWh`}
            hint="Dihitung setelah verifikasi admin"
          />
          <Stat
            label="Status pengajuan"
            value={pending ? "Menunggu verifikasi" : "Belum ada"}
            hint={pending ? dateID(pending.createdAt) : "Kirim pembacaan bulan ini"}
          />
        </div>

        <Card
          title="Kirim pembacaan meter"
          description="Baca digit hitam (kWh) pada meter analog, lalu foto meter secara jelas."
        >
          <form action={tenantSubmitMeterReadingAction}>
            <div className="form-grid">
              <Field label="Angka meter sekarang (kWh)" hint="Contoh: 12345">
                <input
                  name="currentReading"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={lastReading?.currentReading ?? 0}
                />
              </Field>
              <Field label="Tanggal pembacaan">
                <input name="readingAt" type="date" defaultValue={inputDate(new Date())} />
              </Field>
              <Field label="Foto meter" hint="JPG/PNG/WEBP, maks. 4 MB" full>
                <PhotoInput name="photo" required hint="Foto langsung dari kamera agar terbaru." />
              </Field>
              <Field label="Catatan" full>
                <input name="notes" maxLength={500} placeholder="Opsional" />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Kirim pembacaan
              </button>
              <span className="small muted">Pemakaian dihitung dari pembacaan terakhir yang terverifikasi.</span>
            </div>
          </form>
        </Card>

        <Card title={`Riwayat pembacaan (${history.length})`} tight>
          {history.length === 0 ? (
            <Empty title="Belum ada riwayat" description="Pembacaan yang Anda kirim akan muncul di sini." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th className="num">Awal</th>
                    <th className="num">Akhir</th>
                    <th className="num">Pemakaian</th>
                    <th className="num">Biaya</th>
                    <th>Status</th>
                    <th>Tagihan</th>
                    <th>Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((reading) => (
                    <tr key={reading.id}>
                      <td>{dateID(reading.readingAt)}</td>
                      <td className="num">{reading.previousReading}</td>
                      <td className="num">{reading.currentReading}</td>
                      <td className="num">{reading.usageKwh} kWh</td>
                      <td className="num">{rupiah(reading.amount)}</td>
                      <td>
                        <StatusBadge map={METER_STATUS} value={reading.status} />
                        {reading.rejectionReason ? (
                          <div className="small muted">{reading.rejectionReason}</div>
                        ) : null}
                      </td>
                      <td className="mono small">{reading.invoice?.invoiceNo ?? "-"}</td>
                      <td>
                        {reading.photoUrl ? (
                          <a href={reading.photoUrl} target="_blank" rel="noreferrer">
                            Lihat
                          </a>
                        ) : (
                          "-"
                        )}
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

  if (!["owner", "admin", "staff"].includes(user.role)) {
    return (
      <>
        <PageHeader title="Meter Listrik" />
        <Card title="Akses ditolak">
          <p className="small muted" style={{ margin: 0 }}>
            Peran Anda tidak memiliki akses ke modul ini.
          </p>
        </Card>
      </>
    );
  }

  const scope = await propertyScope(user);
  const roomWhere = roomScopeWhere(scope);

  const [rooms, pending, recent] = await Promise.all([
    prisma.room.findMany({
      where: { ...roomWhere, status: { not: "nonaktif" } },
      include: {
        property: true,
        contracts: {
          where: { status: "active" },
          include: { tenant: true },
          orderBy: { startDate: "desc" },
          take: 1,
        },
      },
      orderBy: [{ property: { name: "asc" } }, { number: "asc" }],
    }),
    prisma.meterReading.findMany({
      where: { room: roomWhere, status: "pending" },
      include: {
        room: { include: { property: true } },
        tenant: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.meterReading.findMany({
      where: { room: roomWhere, status: { in: ["verified", "billed", "rejected"] } },
      include: {
        room: { include: { property: true } },
        tenant: { select: { name: true } },
        invoice: { select: { invoiceNo: true } },
      },
      orderBy: { readingAt: "desc" },
      take: 50,
    }),
  ]);

  const latestByRoom = new Map<string, (typeof recent)[number]>();
  for (const reading of recent) {
    if (!latestByRoom.has(reading.roomId)) latestByRoom.set(reading.roomId, reading);
  }

  const pendingAmount = pending.reduce((sum, reading) => sum + reading.amount, 0);
  const billedThisMonth = recent
    .filter(
      (reading) =>
        reading.status === "billed" &&
        reading.periodStart.getUTCMonth() === new Date().getUTCMonth() &&
        reading.periodStart.getUTCFullYear() === new Date().getUTCFullYear(),
    )
    .reduce((sum, reading) => sum + reading.amount, 0);

  return (
    <>
      <PageHeader
        title="Meter Listrik"
        subtitle="Catat, verifikasi, dan tagih pemakaian listrik per kamar."
        actions={
          <Link className="btn btn-sm" href="/tagihan">
            Tagihan
          </Link>
        }
      />
      <Flash error={flash.err} ok={flash.ok} />

      <div className="stat-grid">
        <Stat label="Menunggu verifikasi" value={pending.length} hint={rupiah(pendingAmount)} />
        <Stat label="Kamar aktif" value={rooms.length} hint="Dengan meter analog" />
        <Stat label="Sudah ditagih bulan ini" value={rupiah(billedThisMonth)} hint="Listrik" />
      </div>

      <Card title={`Menunggu verifikasi (${pending.length})`} tight>
        {pending.length === 0 ? (
          <Empty title="Tidak ada pembacaan pending" description="Pembacaan dari penyewa akan muncul di sini." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kamar / penyewa</th>
                  <th className="num">Awal</th>
                  <th className="num">Akhir</th>
                  <th className="num">Pemakaian</th>
                  <th className="num">Biaya</th>
                  <th>Sumber</th>
                  <th>Foto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((reading) => (
                  <tr key={reading.id}>
                    <td>{dateID(reading.readingAt)}</td>
                    <td>
                      {reading.room.property.name} · {reading.room.number}
                      <div className="small muted">{reading.tenant?.name ?? "-"}</div>
                    </td>
                    <td className="num">{reading.previousReading}</td>
                    <td className="num">{reading.currentReading}</td>
                    <td className="num">{reading.usageKwh} kWh</td>
                    <td className="num">{rupiah(reading.amount)}</td>
                    <td>{METER_SOURCES[reading.source] ?? reading.source}</td>
                    <td>
                      {reading.photoUrl ? (
                        <a href={reading.photoUrl} target="_blank" rel="noreferrer">
                          Lihat
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="right">
                      <details>
                        <summary className="btn btn-sm" style={{ cursor: "pointer" }}>
                          Verifikasi
                        </summary>
                        <div style={{ marginTop: 8, minWidth: 240, textAlign: "left" }}>
                          <form action={verifyMeterReadingAction}>
                            <input type="hidden" name="readingId" value={reading.id} />
                            <div className="field" style={{ marginBottom: 6 }}>
                              <label className="small">Koreksi angka akhir (kWh)</label>
                              <input
                                name="currentReading"
                                type="number"
                                min={reading.previousReading}
                                step={1}
                                defaultValue={reading.currentReading}
                              />
                            </div>
                            <button className="btn btn-sm btn-primary" type="submit">
                              Verifikasi
                            </button>
                          </form>
                          <form action={rejectMeterReadingAction} style={{ marginTop: 10 }}>
                            <input type="hidden" name="readingId" value={reading.id} />
                            <div className="field" style={{ marginBottom: 6 }}>
                              <label className="small">Alasan tolak</label>
                              <input name="reason" required minLength={5} maxLength={300} />
                            </div>
                            <button className="btn btn-sm btn-danger" type="submit">
                              Tolak
                            </button>
                          </form>
                        </div>
                      </details>
                      <details style={{ marginTop: 6 }}>
                        <summary className="btn btn-sm" style={{ cursor: "pointer" }}>
                          Edit
                        </summary>
                        <form
                          action={updateMeterReadingAction}
                          style={{ marginTop: 8, minWidth: 240, textAlign: "left" }}
                        >
                          <input type="hidden" name="readingId" value={reading.id} />
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Angka meter (kWh)</label>
                            <input
                              name="currentReading"
                              type="number"
                              min={0}
                              step={1}
                              required
                              defaultValue={reading.currentReading}
                            />
                          </div>
                          <div className="field" style={{ marginBottom: 6 }}>
                            <label className="small">Tanggal pembacaan</label>
                            <input
                              name="readingAt"
                              type="date"
                              defaultValue={inputDate(reading.readingAt)}
                            />
                          </div>
                          <div className="field" style={{ marginBottom: 8 }}>
                            <label className="small">Catatan</label>
                            <input name="notes" defaultValue={reading.notes ?? ""} maxLength={500} />
                          </div>
                          <button className="btn btn-sm btn-primary" type="submit">
                            Simpan
                          </button>
                        </form>
                      </details>
                      <ConfirmForm
                        action={deleteMeterReadingAction}
                        confirmMessage={`Hapus pembacaan meter kamar ${reading.room.number} tanggal ${dateID(reading.readingAt)}?`}
                        style={{ marginTop: 6 }}
                      >
                        <input type="hidden" name="readingId" value={reading.id} />
                        <button className="btn btn-sm btn-danger" type="submit">
                          Hapus
                        </button>
                      </ConfirmForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Catat pembacaan manual" description="Admin/owner langsung terverifikasi; staff masuk antrean verifikasi.">
        {rooms.length === 0 ? (
          <Empty title="Belum ada kamar" description="Tambahkan kamar terlebih dahulu." />
        ) : (
          <form action={recordMeterReadingAction}>
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
              <Field label="Angka meter (kWh)">
                <input name="currentReading" type="number" min={0} step={1} required />
              </Field>
              <Field label="Tanggal">
                <input name="readingAt" type="date" defaultValue={inputDate(new Date())} />
              </Field>
              <Field label="Foto meter (opsional)">
                <PhotoInput name="photo" hint="Foto langsung dari kamera agar terbaru." />
              </Field>
              <Field label="Catatan" full>
                <input name="notes" maxLength={500} placeholder="Opsional" />
              </Field>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit">
                Simpan pembacaan
              </button>
            </div>
          </form>
        )}
      </Card>

      <Card title={`Pembacaan terbaru (${recent.length})`} tight>
        {recent.length === 0 ? (
          <Empty title="Belum ada pembacaan" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Kamar</th>
                  <th className="num">Awal</th>
                  <th className="num">Akhir</th>
                  <th className="num">Pemakaian</th>
                  <th className="num">Biaya</th>
                  <th>Status</th>
                  <th>Tagihan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((reading) => (
                  <tr key={reading.id}>
                    <td>{dateID(reading.readingAt)}</td>
                    <td>
                      {reading.room.property.name} · {reading.room.number}
                      <div className="small muted">{reading.tenant?.name ?? "-"}</div>
                    </td>
                    <td className="num">{reading.previousReading}</td>
                    <td className="num">{reading.currentReading}</td>
                    <td className="num">{reading.usageKwh} kWh</td>
                    <td className="num">{rupiah(reading.amount)}</td>
                    <td>
                      <StatusBadge map={METER_STATUS} value={reading.status} />
                    </td>
                    <td className="mono small">{reading.invoice?.invoiceNo ?? "-"}</td>
                    <td className="right">
                      {reading.status === "verified" ? (
                        <form action={attachMeterReadingAction}>
                          <input type="hidden" name="readingId" value={reading.id} />
                          <button className="btn btn-sm btn-primary" type="submit">
                            Ke tagihan
                          </button>
                        </form>
                      ) : null}
                      {reading.status === "rejected" ? (
                        <ConfirmForm
                          action={deleteMeterReadingAction}
                          confirmMessage={`Hapus pembacaan meter kamar ${reading.room.number} tanggal ${dateID(reading.readingAt)}?`}
                        >
                          <input type="hidden" name="readingId" value={reading.id} />
                          <button className="btn btn-sm btn-danger" type="submit">
                            Hapus
                          </button>
                        </ConfirmForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Baseline / ganti meter" description="Set angka awal baru tanpa menghitung pemakaian." tight>
        {rooms.length === 0 ? (
          <Empty title="Belum ada kamar" />
        ) : (
          <div className="card-body">
            <form action={createBaselineAction}>
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
                <Field label="Angka awal baru (kWh)">
                  <input name="currentReading" type="number" min={0} step={1} required />
                </Field>
                <Field label="Tanggal">
                  <input name="readingAt" type="date" defaultValue={inputDate(new Date())} />
                </Field>
                <Field label="Catatan" full>
                  <input name="notes" maxLength={500} placeholder="Meter diganti, reset, dll." />
                </Field>
              </div>
              <div className="form-actions">
                <button className="btn" type="submit">
                  Simpan baseline
                </button>
              </div>
            </form>
          </div>
        )}
      </Card>

      <Card title="Kamar & meter" tight>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kamar</th>
                <th>Penyewa aktif</th>
                <th>No. meter</th>
                <th className="num">Tarif</th>
                <th className="num">Terakhir</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const last = latestByRoom.get(room.id);
                return (
                  <tr key={room.id}>
                    <td>
                      {room.property.name} · {room.number}
                    </td>
                    <td>{room.contracts[0]?.tenant.name ?? "-"}</td>
                    <td className="mono">{room.meterSerial ?? "-"}</td>
                    <td className="num">{rupiah(room.property.electricityTariff)}</td>
                    <td className="num">{last ? `${last.currentReading} kWh` : "-"}</td>
                    <td>
                      {last ? <StatusBadge map={METER_STATUS} value={last.status} /> : <Badge tone="gray">Belum ada</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
