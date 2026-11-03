import Link from "next/link";
import { prisma } from "@/lib/db";
import { inputDate, rupiah } from "@/lib/format";
import { startOfTodayUTC } from "@/lib/dates";
import { Alert } from "@/components/ui";
import { registerTenantAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const params = await searchParams;

  const properties = await prisma.property.findMany({
    where: {
      rooms: {
        some: {
          status: "kosong",
          contracts: { none: { status: { in: ["active", "pending"] } } },
        },
      },
    },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      rooms: {
        where: {
          status: "kosong",
          contracts: { none: { status: { in: ["active", "pending"] } } },
        },
        select: {
          id: true,
          number: true,
          type: true,
          floor: true,
          monthlyPrice: true,
        },
        orderBy: { number: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const totalRooms = properties.reduce((sum, property) => sum + property.rooms.length, 0);
  const today = inputDate(startOfTodayUTC());

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 680 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 14 }}>
          <div className="brand-mark">KM</div>
          <div>
            <div className="brand-name" style={{ color: "#14181f" }}>
              KostManager
            </div>
            <div className="brand-sub">Pendaftaran penyewa</div>
          </div>
        </div>

        <div className="auth-title">Daftar sebagai penyewa</div>
        <div className="auth-sub">
          Isi data wajib, pilih kamar yang tersedia, lalu tunggu persetujuan owner.
        </div>

        <Alert tone="error" message={params.err} />
        <Alert tone="success" message={params.ok} />

        {totalRooms === 0 ? (
          <div className="empty">
            <div className="empty-title">Belum ada kamar tersedia</div>
            <div className="small">Hubungi owner untuk informasi kamar kosong.</div>
          </div>
        ) : (
          <form action={registerTenantAction}>
            <div style={{ display: "none" }} aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">Nama lengkap *</label>
                <input id="name" name="name" required minLength={2} maxLength={100} placeholder="Rizky Pratama" />
              </div>
              <div className="field">
                <label htmlFor="phone">Nomor telepon/WA *</label>
                <input id="phone" name="phone" required placeholder="081234567890" />
              </div>
              <div className="field full">
                <label htmlFor="email">Email *</label>
                <input id="email" name="email" type="email" required autoComplete="email" placeholder="nama@email.com" />
              </div>
              <div className="field">
                <label htmlFor="password">Password *</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <span className="hint">Min. 8 karakter, harus ada huruf dan angka.</span>
              </div>
              <div className="field">
                <label htmlFor="confirmPassword">Ulangi password *</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="field full">
                <label htmlFor="addressOrigin">Alamat asal *</label>
                <input
                  id="addressOrigin"
                  name="addressOrigin"
                  required
                  minLength={5}
                  maxLength={200}
                  placeholder="Kota asal / alamat lengkap"
                />
              </div>

              <details className="full" style={{ marginTop: 2 }}>
                <summary className="small" style={{ cursor: "pointer" }}>
                  Data opsional (NIK, kontak darurat)
                </summary>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label htmlFor="idNumber">NIK</label>
                    <input id="idNumber" name="idNumber" maxLength={30} placeholder="3273xxxxxxxxxxxx" />
                  </div>
                  <div className="field">
                    <label htmlFor="emergencyContact">Kontak darurat</label>
                    <input
                      id="emergencyContact"
                      name="emergencyContact"
                      maxLength={100}
                      placeholder="Ibu Sari - 0812xxxx"
                    />
                  </div>
                </div>
              </details>

              <div className="field full">
                <label htmlFor="roomId">Kamar tersedia *</label>
                <select id="roomId" name="roomId" required defaultValue="">
                  <option value="">Pilih kamar</option>
                  {properties.map((property) => (
                    <optgroup key={property.id} label={`${property.name} — ${property.city}`}>
                      {property.rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          Kamar {room.number}
                          {room.type ? ` · ${room.type}` : ""} · Lantai {room.floor} ·{" "}
                          {rupiah(room.monthlyPrice)}/bulan
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span className="hint">
                  Harga sewa mengikuti kamar. Kontrak 1 bulan, dapat disesuaikan owner saat persetujuan.
                </span>
              </div>
              <div className="field">
                <label htmlFor="startDate">Tanggal mulai sewa *</label>
                <input id="startDate" name="startDate" type="date" required min={today} defaultValue={today} />
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" type="submit">
                Kirim pendaftaran
              </button>
            </div>
          </form>
        )}

        <div className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          Sudah punya akun? <Link href="/login">Masuk</Link>
        </div>
      </div>
    </div>
  );
}
