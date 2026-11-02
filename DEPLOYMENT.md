# Panduan Deployment — GitHub + Supabase + Vercel

Stack produksi: **Next.js 15 + Prisma + Supabase Postgres + Supabase Storage + Vercel**.

> Jangan pernah commit `.env`, `prisma/dev.db`, atau service role key. `.gitignore` sudah mengecualikannya.

---

## 1. Buat project Supabase

1. Buka [supabase.com](https://supabase.com) → **New project**.
2. Pilih region terdekat (mis. **Singapore**), simpan database password.
3. Setelah project siap, buka **Project Settings → Database → Connection string**.
4. Salin dua koneksi:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Session pooler / Direct** (port `5432`) → `DIRECT_URL`

Tambahkan parameter Prisma pada `DATABASE_URL`:

```text
?pgbouncer=true&connection_limit=1
```

Jika password mengandung karakter khusus (`@`, `#`, `%`, dll.), URL-encode dulu.

## 2. Buat bucket Storage

1. Buka **Storage → New bucket**.
2. Nama: `payment-proofs`.
3. **Public bucket: OFF** (privat).
4. Buka **Project Settings → API** dan salin:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

Service role key hanya dipakai di server. Jangan memakai prefix `NEXT_PUBLIC_`.

## 3. Isi environment lokal

Salin template:

```bash
cp .env.example .env
```

Isi minimal:

| Variabel | Nilai |
|---|---|
| `DATABASE_URL` | Transaction pooler Supabase + `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Session pooler/direct Supabase (port 5432) |
| `AUTH_SECRET` | String acak ≥ 32 karakter |
| `APP_URL` | `http://localhost:3000` saat lokal |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (rahasia) |
| `SUPABASE_STORAGE_BUCKET` | `payment-proofs` |
| `OWNER_NAME/EMAIL/PASSWORD` | Akun owner pertama |

Generate `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Migrasi skema & buat owner

```bash
npm install
npx prisma db push
npm run db:owner
```

- `db:push` memakai `DIRECT_URL` untuk membuat tabel.
- `db:owner` hanya membuat akun owner; **tidak menghapus data**.
- `npm run db:seed` bersifat **destruktif** (menghapus semua data) dan hanya untuk demo lokal. **Jangan jalankan di produksi.**

Uji lokal:

```bash
npm run dev
```

## 5. Push ke GitHub

Belum ada repository Git di folder ini. Buat repo kosong di GitHub (jangan centang README), lalu:

```bash
git init -b main
git add .
git commit -m "KostManager: siap deploy Supabase + Vercel"
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```

Pastikan `git status` tidak memuat `.env`, `node_modules`, `.next`, `prisma/dev.db`, atau `.data/`.

## 6. Import ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New → Project** → import repo GitHub.
2. **Root Directory**: pilih folder yang berisi `package.json` (jika repo hanya berisi proyek ini, biarkan default).
3. Framework: Next.js (otomatis).
4. Build Command: `prisma generate && next build` (sudah ada di `package.json`).
5. Tambahkan Environment Variables untuk **Production** (dan Preview bila perlu):

```text
DATABASE_URL
DIRECT_URL
AUTH_SECRET
APP_NAME
APP_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

6. Deploy.
7. Setelah mendapat domain, ubah `APP_URL` menjadi `https://<project>.vercel.app` lalu **Redeploy**.

## 7. Checklist setelah deploy

- [ ] Login owner berhasil.
- [ ] Buat properti, kamar, penyewa, dan kontrak.
- [ ] Generate tagihan → terbitkan.
- [ ] Catat pembayaran tunai dan transfer.
- [ ] Upload bukti bayar berhasil masuk bucket `payment-proofs` (bukan filesystem Vercel).
- [ ] Verifikasi/tolak pembayaran.
- [ ] Buka bukti bayar dari akun tenant/admin (signed URL).
- [ ] Cek `/laporan` dan ekspor CSV.
- [ ] Ganti/rotate service role key bila pernah terekspos.

## 8. Catatan operasional

- **Backup**: aktifkan Supabase Daily Backups / PITR sesuai paket.
- **Migrasi lanjutan**: untuk perubahan skema berikutnya gunakan `npx prisma migrate dev` secara lokal lalu `npx prisma migrate deploy` di CI/produksi.
- **Rotasi kunci**: jika `SUPABASE_SERVICE_ROLE_KEY` bocor, rotate di Supabase lalu update Vercel.
- **Log**: pantau Vercel Functions dan Supabase Logs.
- **Upload lama** di `public/uploads` (jika ada) tidak ikut pindah otomatis; unggah ulang atau salin manual ke bucket.
- **Batas upload**: Vercel Functions membatasi body request ±4,5 MB, sehingga aplikasi membatasi bukti bayar maksimal **4 MB**. Untuk file lebih besar, gunakan upload langsung ke Supabase Storage dengan signed upload URL.

## 9. Alternatif VPS

Jika ingin memakai VPS, aplikasi tetap bisa dijalankan dengan `npm run build && npm run start` dan reverse proxy Nginx. Namun konfigurasi ini tidak memakai Vercel; database tetap Supabase Postgres dan Storage.
