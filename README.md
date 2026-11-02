# KostManager

Aplikasi manajemen kos: properti, kamar, penyewa, kontrak, tagihan sewa, verifikasi pembayaran, tunggakan, perbaikan, laporan, dan portal penyewa.

Stack: **Next.js 15 (App Router) + TypeScript + Prisma + Supabase Postgres + Supabase Storage**, deploy di **Vercel**.

## Menjalankan lokal

```bash
npm install
cp .env.example .env      # isi DATABASE_URL, DIRECT_URL, AUTH_SECRET, Supabase, OWNER_*
npx prisma db push
npm run db:owner          # buat akun owner pertama (aman, tidak menghapus data)
npm run dev               # http://localhost:3000
```

Data demo untuk pengembangan lokal (destruktif — jangan di produksi):

```powershell
$env:CONFIRM_DESTRUCTIVE_SEED="1"; npm run db:seed
```

Tanpa `CONFIRM_DESTRUCTIVE_SEED=1`, script akan menolak berjalan.

Akun demo setelah seeding:

| Peran | Email | Password |
|---|---|---|
| Owner | owner@kost.local | owner12345 |
| Admin | admin@kost.local | admin12345 |
| Staff | staff@kost.local | staff12345 |
| Penyewa | tenant@kost.local | tenant12345 |

## Perintah penting

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi (`prisma generate && next build`) |
| `npm run start` | Jalankan hasil build |
| `npm run typecheck` | Cek TypeScript |
| `npm run db:push` | Sinkronkan skema ke Supabase (pakai `DIRECT_URL`) |
| `npm run db:owner` | Buat akun owner dari `OWNER_EMAIL` / `OWNER_PASSWORD` |
| `npm run db:seed` | Isi data demo (butuh `CONFIRM_DESTRUCTIVE_SEED=1`; menghapus data) |
| `npm run db:reset` | Reset skema + seed demo (menghapus data) |
| `node --env-file=.env scripts/smoke.mjs` | Uji cepat login & semua halaman |
| `npx prisma migrate deploy` | Terapkan migration di produksi |

## Struktur

```
src/app/(app)/        halaman setelah login (dashboard, properti, kamar, ...)
src/app/login/        halaman & aksi login
src/app/api/uploads/  route bukti bayar terautentikasi (signed URL Supabase)
src/lib/auth.ts       JWT, cookie sesi, RBAC, requireUser/requireRole/requireTenant
src/lib/billing.ts    generate tagihan, publish, void, pembayaran, verifikasi, reminder
src/lib/scope.ts      filter query sesuai properti yang boleh diakses
src/lib/storage.ts    Supabase Storage (upload privat + signed URL)
src/lib/notify.ts     template notifikasi N-01..N-12 (mode simulasi)
prisma/schema.prisma  model data (Postgres)
prisma/create-owner.ts akun owner pertama
prisma/seed.ts        data demo (destruktif)
```

## Alur bisnis singkat

1. Buat properti → kamar.
2. Daftarkan penyewa → buat kontrak (kamar otomatis `terisi`).
3. Menu **Tagihan** → *Generate tagihan* untuk bulan berjalan (status `draft`).
4. Terbitkan tagihan → status `unpaid` + notifikasi N-01 tercatat.
5. Catat pembayaran tunai (langsung terverifikasi) atau transfer (masuk antrean).
6. **Pembayaran** → verifikasi/tolak; status tagihan dihitung ulang otomatis.
7. Tagihan lewat jatuh tempo otomatis jadi `overdue` saat dashboard/tagihan/laporan dibuka.
8. Penyewa login untuk melihat tagihan sendiri dan mengunggah bukti transfer.

## Keamanan

- Password di-hash bcrypt (10 rounds; owner bootstrap 12).
- Sesi JWT HS256 di cookie `httpOnly`, `sameSite=lax`, 12 jam.
- Middleware memeriksa token sebelum halaman dirender.
- Setiap query difilter `propertyScope`; tenant hanya melihat data miliknya.
- Bukti bayar disimpan privat di Supabase Storage dan diakses lewat signed URL sementara.
- Login dibatasi 5 percobaan gagal per 15 menit (rate limit in-memory).
- Semua aksi penting dicatat di `AuditLog`.

## Dokumentasi lain

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — langkah GitHub + Supabase + Vercel.
- [`prd.md`](prd.md) — spesifikasi produk.
