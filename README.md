# KostManager

Aplikasi manajemen kos: properti, kamar, penyewa, kontrak, tagihan sewa, meter listrik, verifikasi pembayaran, rekening/QRIS/tunai, tunggakan, perbaikan, laporan, dan portal penyewa.

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
src/lib/meter.ts      pembacaan kWh, verifikasi, baseline, hitung pemakaian
src/lib/requirements.ts syarat invoice sebelum diterbitkan
src/app/(app)/meter/  halaman & aksi meter listrik (admin + penyewa)
src/lib/scope.ts      filter query sesuai properti yang boleh diakses
src/lib/storage.ts    Supabase Storage (upload privat + signed URL)
src/lib/notify.ts     template notifikasi N-01..N-12 (mode simulasi)
prisma/schema.prisma  model data (Postgres)
prisma/create-owner.ts akun owner pertama
prisma/seed.ts        data demo (destruktif)
```

## Alur bisnis singkat

1. Buat properti → atur **tarif listrik** dan **metode pembayaran** (rekening/QRIS/tunai).
2. Tambah kamar → daftarkan penyewa → buat kontrak + angka awal meter listrik.
3. Penyewa membuka **Meter Listrik** → isi angka kWh + foto meter.
4. Admin membuka **Meter Listrik** → verifikasi/koreksi. Pemakaian dihitung otomatis.
5. Menu **Tagihan** → *Generate tagihan* (status `draft`). Item listrik ikut ditambahkan jika sudah terverifikasi.
6. Invoice **tidak bisa diterbitkan** sebelum syarat lengkap (meter, profil bila diaktifkan, metode pembayaran). Admin bisa override dengan alasan.
7. Setelah diterbitkan (`unpaid`), penyewa melihat rekening/QRIS/tunai dan mengunggah bukti.
8. Admin memverifikasi pembayaran; status tagihan dihitung ulang otomatis.
9. Tagihan lewat jatuh tempo otomatis jadi `overdue` saat dashboard/tagihan/laporan dibuka.

## Keamanan

- Password di-hash bcrypt (10 rounds; owner bootstrap 12).
- Sesi JWT HS256 di cookie `httpOnly`, `sameSite=lax`, 12 jam.
- Middleware memeriksa token sebelum halaman dirender.
- Setiap query difilter `propertyScope`; tenant hanya melihat data miliknya.
- Bukti bayar, foto meter, dan QRIS disimpan privat di Supabase Storage; akses lewat signed URL sementara dan dicek kepemilikannya.
- Login dibatasi 5 percobaan gagal per 15 menit (rate limit in-memory).
- Semua aksi penting dicatat di `AuditLog`.

## Dokumentasi lain

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — langkah GitHub + Supabase + Vercel.
- [`prd.md`](prd.md) — spesifikasi produk.
