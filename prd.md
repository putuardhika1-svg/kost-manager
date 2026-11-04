# PRD — Sistem Manajemen Kost (KostManager)

| Field | Keterangan |
|---|---|
| Nama Produk | KostManager |
| Versi Dokumen | 1.1 (draft lengkap) |
| Jenis Produk | Aplikasi web (responsive) + panel admin |
| Pemilik Produk | Pemilik usaha kost / pengelola properti |
| Status | Draft — menunggu validasi pemilik produk |
| Target Rilis MVP | 12 minggu setelah kickoff |
| Terakhir diperbarui | 2026-11-01 |

> **Catatan asumsi:** Dokumen ini disusun dari kebutuhan umum pengelolaan kost di Indonesia. Bagian bertanda ⚠️ berisi asumsi yang perlu dikonfirmasi pemilik produk.

---

## Daftar Isi

1. Ringkasan Produk
2. Latar Belakang & Pernyataan Masalah
3. Tujuan, KPI & Metrik
4. Persona & User Journey
5. Ruang Lingkup
6. Daftar Fitur & Prioritas
7. User Stories & Acceptance Criteria
8. Alur Pengguna Utama
9. Model Data
10. Persyaratan Fungsional per Modul
11. Aturan Validasi & Penanganan Error
12. Notifikasi & Template Pesan
13. Matriks Hak Akses (RBAC)
14. Persyaratan Non-Fungsional
15. Arsitektur, Tech Stack & API
16. Daftar Layar (Screen Inventory)
17. Rencana Rilis & Estimasi
18. Rencana Migrasi Data & Onboarding
19. Rencana Pengujian (QA)
20. Analitik & Event Tracking
21. Risiko & Mitigasi
22. Asumsi & Pertanyaan Terbuka
23. Definisi & Istilah
24. Riwayat Revisi

---

## 1. Ringkasan Produk

KostManager adalah aplikasi berbasis web untuk mengelola operasional usaha kost secara terpusat: data kamar, data penyewa, tagihan dan pembayaran sewa, perpanjangan sewa, pemeliharaan fasilitas, serta laporan keuangan sederhana.

Tujuan utamanya adalah menggantikan pencatatan manual (buku catatan, spreadsheet, chat WhatsApp) dengan satu sistem yang:

- Mengetahui status setiap kamar secara real-time (terisi / kosong / perbaikan / booking).
- Menghitung tagihan sewa otomatis dan mengingatkan penyewa sebelum jatuh tempo.
- Mencatat pembayaran (tunai dan transfer) beserta bukti bayar.
- Menyediakan laporan pendapatan, tunggakan, dan okupansi.

**Elevator pitch:** *"Satu dashboard untuk tahu siapa yang sudah bayar, siapa yang menunggak, dan kamar mana yang kosong — tanpa buku catatan."*

### 1.1 Nilai Utama

| Nilai | Dampak bagi Pengguna |
|---|---|
| Otomatisasi tagihan | Tidak perlu membuat tagihan satu per satu setiap bulan |
| Transparansi tunggakan | Tahu posisi keuangan dalam hitungan detik |
| Jejak audit | Semua perubahan tercatat, aman saat pergantian pengelola |
| Multi-properti | Satu akun untuk beberapa lokasi kost |
| Riwayat penyewa | Deposit, kondisi kamar, dan keluhan terdokumentasi |

---

## 2. Latar Belakang & Pernyataan Masalah

### 2.1 Konteks

Mayoritas pengelola kost skala kecil–menengah (10–100 kamar) masih mengandalkan spreadsheet atau buku tulis. Penagihan dilakukan manual lewat WhatsApp, dan bukti transfer menumpuk di galeri foto. Ketika jumlah kamar bertambah atau pengelola berganti, informasi hilang dan konflik dengan penyewa meningkat.

### 2.2 Masalah Spesifik

1. **Penagihan manual rawan lupa** — tidak ada pengingat otomatis; tagihan sering dibuat setelah lewat jatuh tempo.
2. **Bukti transfer tersebar** — rekonsiliasi memakan waktu, sulit membuktikan pembayaran saat terjadi sengketa.
3. **Tidak ada visibilitas tunggakan** — pemilik tidak tahu total piutang tanpa memeriksa catatan satu per satu.
4. **Check-in/check-out tidak terdokumentasi** — kondisi kamar, inventaris, dan pengembalian deposit tidak tercatat.
5. **Multi-lokasi tercampur** — semua data dalam satu file, sulit dipisahkan per properti.
6. **Laporan keuangan dibuat ulang manual** — setiap akhir bulan memerlukan olah data berjam-jam.

### 2.3 Kondisi Ideal (Setelah Implementasi)

- Tagihan bulanan terbit otomatis pada tanggal yang ditentukan, tanpa intervensi manual.
- Penyewa menerima pengingat sebelum dan sesudah jatuh tempo.
- Admin hanya perlu memverifikasi bukti bayar; sistem memperbarui status tagihan.
- Pemilik membuka dashboard dan langsung melihat okupansi, pendapatan, dan aging tunggakan.

---

## 3. Tujuan, KPI & Metrik

### 3.1 Tujuan Produk

| # | Tujuan | Metrik Keberhasilan |
|---|---|---|
| G1 | Menghilangkan pencatatan manual | 100% tagihan dibuat oleh sistem, bukan manual |
| G2 | Menurunkan tunggakan | Tunggakan > 7 hari < 5% dari total tagihan aktif |
| G3 | Mempercepat penagihan | Waktu membuat & menerbitkan tagihan < 10 menit untuk 50 kamar |
| G4 | Rekonsiliasi cepat | 90% pembayaran terverifikasi < 24 jam setelah bukti diunggah |
| G5 | Visibilitas bisnis | Laporan okupansi & pendapatan tersedia real-time tanpa olah manual |

### 3.2 North Star Metric

**Persentase tagihan yang terbayar tepat waktu per bulan** (target awal: ≥ 85%).

### 3.3 KPI Pendukung

| KPI | Definisi | Target MVP | Cara Ukur |
|---|---|---|---|
| Tingkat okupansi | Kamar terisi ÷ kamar aktif | ≥ 85% | Dashboard okupansi |
| Waktu verifikasi pembayaran | Rata-rata selisih upload → verifikasi | ≤ 12 jam | Log `payment_verified` |
| Tingkat pengiriman pengingat | Terkirim ÷ dijadwalkan | ≥ 95% | Log notifikasi |
| Adopsi sistem | % tagihan dibuat via sistem | 100% | Query `invoice.source` |
| Error rate transaksi | Request gagal ÷ total request | < 1% | Sentry / APM |
| Waktu penyelesaian tiket | Rata-rata tiket `selesai` − `dibuat` | ≤ 3 hari | Laporan maintenance |

### 3.4 Non-Goals (Tidak Dituju pada MVP)

- Menjadi marketplace pencarian kost.
- Menyediakan akuntansi lengkap berstandar SAK (jurnal, neraca, pajak).
- Mengelola gaji karyawan atau pembukuan bisnis lain.
- Menyediakan aplikasi mobile native.

---

## 4. Persona & User Journey

### 4.1 Persona

| Persona | Peran | Kebutuhan Utama | Tingkat Teknis | Frekuensi Pakai |
|---|---|---|---|---|
| Pak Budi — Pemilik Kost | Owner | Pendapatan, okupansi, tunggakan, pengawasan pengelola | Rendah | 2–3×/minggu |
| Sari — Pengelola/Admin | Admin | Tambah penyewa, terbitkan tagihan, verifikasi bayar | Sedang | Harian |
| Dewi — Penjaga Kost | Staff | Check-in/out, catat keluhan & perbaikan | Rendah | Harian |
| Rizky — Penyewa | Tenant | Lihat tagihan, riwayat bayar, unggah bukti, kirim keluhan | Sedang | 1–2×/bulan |

⚠️ Asumsi: penyewa memiliki akses portal penyewa. Jika tidak, portal dipindah ke Fase 2 dan verifikasi dilakukan sepenuhnya oleh admin.

### 4.2 User Journey — Admin (Sari)

| Tahap | Aktivitas | Pain Point Sekarang | Solusi di KostManager |
|---|---|---|---|
| Awal bulan | Membuat tagihan 40 kamar | Manual, 3–4 jam | Generate otomatis massal, tinjau & terbitkan |
| Hari H+0 | Mengingatkan penyewa | Chat satu per satu | Pengingat otomatis WA/email |
| Penerimaan bayar | Cek bukti transfer | Tercecer di chat | Inbox pembayaran + preview bukti |
| Verifikasi | Update catatan | Rawan lupa | Klik verifikasi, status tagihan otomatis |
| Akhir bulan | Membuat laporan | Olah spreadsheet | Laporan siap ekspor CSV/PDF |

### 4.3 User Journey — Penyewa (Rizky)

1. Menerima pesan tagihan berisi tautan.
2. Membuka portal, melihat rincian tagihan dan tanggal jatuh tempo.
3. Mentransfer sesuai nominal, mengunggah bukti.
4. Menerima konfirmasi setelah admin memverifikasi.
5. Bila ada masalah (AC rusak, air mati), membuat tiket keluhan.

---

## 5. Ruang Lingkup

### 5.1 Termasuk dalam Ruang Lingkup (MVP)

- Manajemen properti dan kamar (multi-properti, multi-lantai, tipe kamar).
- Manajemen penyewa dan kontrak sewa (tanggal masuk, durasi, deposit).
- Pembuatan tagihan otomatis bulanan + tagihan tambahan (listrik, air, denda).
- Pencatatan pembayaran manual dan upload bukti transfer.
- Pengingat jatuh tempo via WhatsApp/email.
- Pencatatan keluhan & pekerjaan perbaikan.
- Laporan: pendapatan, tunggakan, okupansi, riwayat per penyewa.
- Manajemen pengguna & hak akses (Owner, Admin, Staff, Tenant).

### 5.2 Di Luar Ruang Lingkup

| Item | Alasan | Rencana |
|---|---|---|
| Aplikasi mobile native | Biaya tinggi, web responsive cukup | Evaluasi setelah 6 bulan |
| Payment gateway otomatis | Butuh verifikasi merchant & biaya | Fase 2 |
| Akuntansi penuh (jurnal/neraca) | Kompleksitas tinggi, bukan inti | Integrasi ke software akuntansi |
| Kunci pintu pintar / IoT | Perangkat mahal, adopsi rendah | Tidak direncanakan |
| Marketplace pencarian kost | Model bisnis berbeda | Tidak direncanakan |
| Payroll karyawan | Di luar domain | Tidak direncanakan |
| Multi-mata uang | Pasar tunggal (IDR) | Tidak direncanakan |

---

## 6. Daftar Fitur & Prioritas

Prioritas menggunakan MoSCoW. Estimasi dalam *story point* relatif (skala Fibonacci).

| ID | Fitur | Prioritas | Fase | Est. (SP) | Catatan |
|---|---|---|---|---|---|
| F-01 | Login & manajemen pengguna (RBAC) | Must | 1 | 8 | Owner/Admin/Staff/Tenant |
| F-02 | CRUD Properti & Kamar | Must | 1 | 13 | Status kamar, harga sewa, fasilitas |
| F-03 | CRUD Penyewa & Kontrak Sewa | Must | 1 | 13 | Termasuk deposit & tanggal berakhir |
| F-04 | Generate tagihan otomatis | Must | 1 | 13 | Scheduler bulanan |
| F-05 | Tagihan tambahan (utilitas/denda) | Must | 1 | 5 | Manual per kamar |
| F-06 | Pencatatan pembayaran + bukti bayar | Must | 1 | 13 | Tunai/transfer |
| F-07 | Verifikasi pembayaran oleh admin | Must | 1 | 8 | Status pending/terverifikasi/ditolak |
| F-08 | Dashboard ringkasan | Must | 1 | 8 | Okupansi, pendapatan, tunggakan |
| F-09 | Pengingat jatuh tempo (WA/email) | Should | 1 | 13 | Template + log pengiriman |
| F-10 | Check-in / Check-out penyewa | Must | 1 | 8 | Update status kamar otomatis |
| F-11 | Keluhan & perbaikan | Should | 1 | 8 | Status: baru/diproses/selesai |
| F-12 | Laporan pendapatan & tunggakan | Must | 1 | 13 | Filter periode, ekspor CSV/PDF |
| F-13 | Laporan okupansi | Should | 1 | 5 | Per properti/per bulan |
| F-14 | Portal penyewa (lihat tagihan & upload bukti) | Should | 2 | 21 | ⚠️ konfirmasi kebutuhan |
| F-15 | Payment gateway (VA/QRIS) | Could | 2 | 21 | Midtrans/Xendit |
| F-16 | Manajemen inventaris kamar | Could | 2 | 13 | Kondisi aset saat check-in/out |
| F-17 | Notifikasi in-app / push | Could | 2 | 8 | — |
| F-18 | Multi-mata uang | Won't | — | — | Hanya IDR |
| F-19 | Impor data dari CSV | Must | 1 | 8 | Untuk migrasi awal |
| F-20 | Audit log | Must | 1 | 5 | Semua aksi ubah data |

**Total estimasi MVP (Fase 1):** ≈ 149 SP ⚠️ (perlu kalibrasi dengan kapasitas tim).

---

## 7. User Stories & Acceptance Criteria

Format acceptance criteria menggunakan Given/When/Then.

### US-01 — Menerbitkan tagihan bulanan massal (F-04)

> Sebagai Admin, saya ingin membuat tagihan semua kontrak aktif sekaligus agar tidak mengetik satu per satu.

- **AC-01** Diberikan 40 kontrak aktif dengan `billing_day` = 1, ketika scheduler berjalan pada tgl 1 pukul 00:05, maka terbentuk 40 draft tagihan dengan periode bulan berjalan dan total sesuai harga sewa kontrak.
- **AC-02** Diberikan draft tagihan sudah ada untuk periode yang sama, ketika generate dijalankan ulang, maka tidak ada duplikasi (sistem melewati kontrak yang sudah punya tagihan periode tersebut).
- **AC-03** Diberikan kontrak berstatus `ended`, ketika generate berjalan, maka kontrak tersebut tidak menghasilkan tagihan.

### US-02 — Verifikasi pembayaran (F-07)

> Sebagai Admin, saya ingin memverifikasi bukti bayar agar status tagihan akurat.

- **AC-04** Diberikan pembayaran dengan status `pending`, ketika Admin menekan "Verifikasi", maka status menjadi `verified`, tagihan terkait diperbarui, dan `verified_by` serta `verified_at` terisi.
- **AC-05** Diberikan total pembayaran terverifikasi ≥ total tagihan, ketika verifikasi selesai, maka status tagihan menjadi `paid` dan tercatat di laporan pendapatan.
- **AC-06** Diberikan total pembayaran terverifikasi < total tagihan, ketika verifikasi selesai, maka status tagihan tetap `unpaid` dengan informasi sisa tagihan.
- **AC-07** Diberikan Admin menolak pembayaran, ketika alasan kosong, maka sistem menolak aksi dan menampilkan pesan validasi.

### US-03 — Mencegah bentrok kontrak (F-03)

- **AC-08** Diberikan kamar A memiliki kontrak aktif 1 Jan–30 Jun, ketika Admin membuat kontrak baru mulai 1 Mei untuk kamar yang sama, maka sistem menolak dengan pesan "Kamar masih memiliki kontrak aktif pada periode tersebut".
- **AC-09** Diberikan tanggal mulai ≥ tanggal berakhir, ketika form disimpan, maka muncul error validasi pada field tanggal berakhir.

### US-04 — Check-out & deposit (F-10)

- **AC-10** Diberikan kontrak aktif, ketika Admin menandai selesai dengan tanggal keluar dan potongan deposit, maka status kamar berubah menjadi `kosong` (atau `perbaikan` bila dipilih) dan tercatat nominal deposit yang dikembalikan.
- **AC-11** Diberikan kontrak selesai, ketika Admin membuka riwayat kamar, maka kontrak tersebut tampil beserta penyewa dan nilai deposit.

### US-05 — Pengingat otomatis (F-09)

- **AC-12** Diberikan tagihan `unpaid` dengan jatuh tempo 3 hari lagi, ketika scheduler berjalan, maka terkirim pengingat H-3 dan tercatat di log notifikasi dengan status `sent`.
- **AC-13** Diberikan pengiriman gagal (nomor tidak valid), ketika proses selesai, maka log mencatat status `failed` beserta alasan, dan admin dapat melihatnya di halaman notifikasi.

### US-06 — Laporan & ekspor (F-12)

- **AC-14** Diberikan filter properti "Kost Melati" dan periode Oktober 2026, ketika Admin menekan "Ekspor CSV", maka file berisi baris tagihan periode tersebut dengan kolom nomor tagihan, penyewa, kamar, total, tanggal bayar, status.
- **AC-15** Diberikan data kosong pada periode terpilih, ketika ekspor dilakukan, maka file tetap dibuat dengan header saja dan UI menampilkan pesan "Tidak ada data pada periode ini".

### US-07 — Isolasi data antar properti (F-01)

- **AC-16** Diberikan Admin hanya ditugaskan ke Properti A, ketika membuka daftar penyewa, maka penyewa Properti B tidak tampil dan endpoint API mengembalikan 403 bila diakses langsung.

---

## 8. Alur Pengguna Utama

### 8.1 Alur Penagihan Bulanan

```text
[Scheduler 00:05 tgl billing_day]
        │
        ▼
[Draft tagihan dibuat untuk kontrak aktif]
        │
        ▼
[Admin meninjau draft + tambah item utilitas]
        │
        ├── ada kesalahan? ──► [Void draft dengan alasan]
        ▼
[Terbitkan tagihan] ──► status: unpaid
        │
        ▼
[Notifikasi terkirim ke penyewa]
        │
        ├── bayar penuh ──► [Upload bukti] ──► [Admin verifikasi] ──► paid
        ├── bayar sebagian ──► [Upload bukti] ──► status tetap unpaid + sisa
        └── lewat jatuh tempo ──► status: overdue + pengingat H+1, H+3, H+7
```

### 8.2 Alur Check-in

1. Admin membuat data penyewa (nama, telepon, kontak darurat).
2. Admin membuat kontrak: kamar, tanggal masuk, durasi, nominal sewa, deposit, `billing_day`.
3. Sistem memvalidasi tidak ada kontrak aktif yang bentrok pada kamar tersebut.
4. Status kamar berubah menjadi `terisi`.
5. Sistem membuat tagihan pertama (pro-rata bila masuk di tengah bulan ⚠️).
6. Penyewa menerima kredensial portal (bila portal aktif) atau info rekening pembayaran.

### 8.3 Alur Check-out

1. Admin menandai kontrak selesai dengan tanggal keluar.
2. Sistem menampilkan form pengembalian deposit: potongan kerusakan/kebersihan.
3. Sistem menghitung deposit dikembalikan = deposit − potongan.
4. Status kamar menjadi `kosong` atau `perbaikan`.
5. Tagihan terakhir dipastikan lunas atau dicatat sebagai piutang.

### 8.4 Alur Keluhan/Perbaikan

1. Penyewa atau Staff membuat tiket: judul, kategori, deskripsi, foto.
2. Admin menetapkan prioritas (rendah/sedang/tinggi) dan penanggung jawab.
3. Teknisi/Staff memperbarui status hingga `selesai`, mengisi biaya (opsional).
4. Biaya dapat dibebankan ke tagihan berikutnya sebagai item `other` (opsional, perlu persetujuan Admin).

---

## 9. Model Data

### 9.1 Relasi

```text
Property 1 ──── N Room
Room     1 ──── N Contract 1 ──── N Invoice 1 ──── N InvoiceItem
                                        │
                                        └──── N Payment

Tenant   1 ──── N Contract
Room     1 ──── N Maintenance
User     1 ──── N AuditLog
```

### 9.2 Skema Tabel

```text
Property (id PK, name, address, city, notes, created_at, updated_at)

Room (id PK, property_id FK, number, floor, type, monthly_price, status,
      facilities JSONB, created_at, updated_at)
      UNIQUE(property_id, number)
      status ∈ {kosong, terisi, booked, perbaikan, nonaktif}

Tenant (id PK, name, phone, email, id_number, emergency_contact,
        address_origin, status, created_at, updated_at)
        status ∈ {aktif, nonaktif}

Contract (id PK, tenant_id FK, room_id FK, start_date, end_date, rent_amount,
          deposit, billing_day, status, ended_at, deposit_returned,
          deposit_deduction, notes)
          status ∈ {active, ended, cancelled}
          1 ≤ billing_day ≤ 28

Invoice (id PK, contract_id FK, invoice_no UNIQUE, period_start, period_end,
         issue_date, due_date, subtotal, additional_total, total, paid_total,
         status, void_reason, source, created_at)
         status ∈ {draft, unpaid, paid, overdue, void}
         source ∈ {auto, manual}

InvoiceItem (id PK, invoice_id FK, description, type, amount)
             type ∈ {rent, utility, penalty, other}

Payment (id PK, invoice_id FK, method, amount, paid_at, proof_url,
         status, verified_by FK→User, verified_at, rejection_reason, notes)
         method ∈ {cash, transfer, gateway}
         status ∈ {pending, verified, rejected}

Maintenance (id PK, room_id FK, tenant_id FK NULL, title, description,
             category, priority, photo_urls JSONB, status, cost,
             assigned_to FK→User NULL, created_at, closed_at)
             status ∈ {baru, diproses, selesai, ditutup}
             priority ∈ {rendah, sedang, tinggi}

User (id PK, name, email UNIQUE, password_hash, phone, role, is_active,
      created_at, last_login_at)
      role ∈ {owner, admin, staff, tenant}

UserProperty (user_id FK, property_id FK)   -- pembatasan scope untuk admin/staff

NotificationLog (id PK, invoice_id FK NULL, tenant_id FK, channel,
                 template_key, payload JSONB, status, error_message, sent_at)
                 channel ∈ {whatsapp, email}
                 status ∈ {queued, sent, failed}

AuditLog (id PK, user_id FK, action, entity, entity_id, payload JSONB,
          ip_address, created_at)

Setting (key PK, value JSONB, updated_at)
```

### 9.3 Aturan Integritas

- `Invoice.total = SUM(InvoiceItem.amount)` — dihitung ulang pada setiap perubahan item.
- `Invoice.paid_total = SUM(Payment.amount WHERE status='verified')`.
- `Contract` tidak boleh dihapus permanen; gunakan status `cancelled` (soft delete).
- `Room.number` unik dalam satu properti.
- Semua tabel memiliki `created_at`/`updated_at`; penghapusan data master memakai soft delete (`deleted_at`).

---

## 10. Persyaratan Fungsional per Modul

### 10.1 Autentikasi & Otorisasi

- **FR-01** Login dengan email + password; sesi berlaku 10 menit.
- **FR-02** Sistem menerapkan RBAC sesuai matriks bagian 13.
- **FR-03** Owner dapat membatasi Admin/Staff hanya pada properti tertentu (`UserProperty`).
- **FR-04** Semua aksi ubah data tercatat di `AuditLog` (siapa, kapan, entitas, payload sebelum/sesudah).
- **FR-05** Reset password melalui tautan email dengan masa berlaku 30 menit.
- **FR-06** Setelah 5 kali gagal login, akun dikunci 15 menit.

### 10.2 Properti & Kamar

- **FR-07** Admin dapat membuat/mengubah/menonaktifkan properti dan kamar.
- **FR-08** Status kamar: `kosong`, `terisi`, `booked`, `perbaikan`, `nonaktif`.
- **FR-09** Status `terisi` hanya dapat diset otomatis dari kontrak aktif; perubahan manual ke `terisi` ditolak.
- **FR-10** Harga sewa dapat berbeda per kamar (bukan hanya per tipe).
- **FR-11** Halaman daftar kamar menampilkan grid status berwarna dan filter per lantai/status.
- **FR-12** Kamar dengan kontrak aktif tidak dapat dinonaktifkan.

### 10.3 Penyewa & Kontrak

- **FR-13** Penyewa wajib memiliki nama dan nomor telepon; nomor telepon unik per properti.
- **FR-14** Validasi bentrok: satu kamar tidak boleh memiliki >1 kontrak `active` pada periode yang sama.
- **FR-15** Kontrak memiliki tanggal mulai, tanggal berakhir, deposit, `billing_day` (1–28).
- **FR-16** Sistem mengirim notifikasi perpanjangan H-30 dan H-7 sebelum `end_date`.
- **FR-17** Perpanjangan kontrak membuat kontrak baru yang merujuk kontrak sebelumnya (`previous_contract_id`, Fase 2).
- **FR-18** Penghapusan penyewa hanya diizinkan jika tidak memiliki kontrak aktif.

### 10.4 Tagihan

- **FR-19** Sistem membuat draft tagihan otomatis sesuai `billing_day` untuk kontrak aktif.
- **FR-20** Tagihan dapat berisi beberapa item (sewa, listrik, air, denda, lainnya).
- **FR-21** Total tagihan dihitung sistem; field total tidak dapat diedit langsung.
- **FR-22** Tagihan `paid` tidak dapat diubah; koreksi melalui void beralasan lalu buat tagihan baru.
- **FR-23** Tagihan yang melewati `due_date` otomatis menjadi `overdue` (job harian 00:10).
- **FR-24** Nomor tagihan otomatis dan unik, format `INV/{kode_properti}/{YYYYMM}/{urut}`.
- **FR-25** Admin dapat mengubah `due_date` sebelum tagihan diterbitkan.
- **FR-26** Generate massal menampilkan pratinjau (jumlah kontrak, total nilai, kontrak terlewat) sebelum dieksekusi.

### 10.5 Pembayaran

- **FR-27** Pembayaran dicatat dengan metode `cash`, `transfer`, atau `gateway` (Fase 2).
- **FR-28** Bukti bayar menerima JPG/PNG/PDF maks. 5 MB; disimpan privat dengan signed URL.
- **FR-29** Mendukung pembayaran bertahap; tagihan `paid` hanya bila total terverifikasi ≥ total tagihan.
- **FR-30** Hanya Admin/Owner yang dapat memverifikasi atau menolak pembayaran.
- **FR-31** Penolakan wajib disertai alasan (maks. 300 karakter).
- **FR-32** Kelebihan bayar dicatat sebagai saldo kredit penyewa yang dapat dipakai pada tagihan berikutnya (Fase 2) ⚠️.
- **FR-33** Semua pembayaran dapat difilter berdasarkan status, metode, properti, dan rentang tanggal.

### 10.6 Notifikasi

- **FR-34** Pengingat otomatis dikirim H-3, H0, H+1, H+3, dan H+7.
- **FR-35** Template pesan dapat diubah Owner/Admin dengan variabel `{nama}`, `{kamar}`, `{jumlah}`, `{jatuh_tempo}`, `{link}`.
- **FR-36** Semua pengiriman tercatat (status terkirim/gagal + alasan).
- **FR-37** Admin dapat mengirim ulang pengingat secara manual (maks. 1× per hari per tagihan).
- **FR-38** Notifikasi tidak dikirim untuk tagihan berstatus `paid`, `void`, atau `draft`.

### 10.7 Dashboard & Laporan

- **FR-39** Dashboard menampilkan: okupansi %, pendapatan bulan berjalan, total tunggakan, tagihan jatuh tempo 7 hari ke depan, 5 tiket maintenance terbaru.
- **FR-40** Laporan pendapatan dapat difilter per properti, per kamar, per periode.
- **FR-41** Laporan tunggakan menampilkan aging: 1–7, 8–30, >30 hari.
- **FR-42** Laporan okupansi menampilkan tren per bulan (min. 12 bulan terakhir).
- **FR-43** Laporan dapat diekspor CSV dan PDF; ekspor >1.000 baris diproses sebagai job dengan tautan unduh.
- **FR-44** Angka pada dashboard dihitung berdasarkan data `verified` saja (bukan `pending`).

### 10.8 Keluhan & Perbaikan

- **FR-45** Tiket memiliki kategori, prioritas, foto (maks. 3), dan riwayat status.
- **FR-46** Riwayat perubahan status tiket mencatat pelaku dan waktu.
- **FR-47** Biaya perbaikan dapat dibebankan ke tagihan penyewa sebagai item `other` (opsional, butuh konfirmasi Admin).
- **FR-48** Tiket `tinggi` memicu notifikasi langsung ke Admin.

### 10.9 Impor Data

- **FR-49** Admin dapat mengunggah CSV kamar dan penyewa menggunakan template yang disediakan.
- **FR-50** Sistem menampilkan laporan validasi (baris valid, baris gagal + alasan) sebelum impor final.
- **FR-51** Impor bersifat transaksional: gagal sebagian → seluruh batch dibatalkan (all-or-nothing).

---

## 11. Aturan Validasi & Penanganan Error

### 11.1 Validasi Input

| Field | Aturan | Pesan Error |
|---|---|---|
| Email pengguna | Format email valid, unik | "Email sudah digunakan" |
| Password | Min. 8 karakter, kombinasi huruf & angka | "Password minimal 8 karakter dan mengandung huruf serta angka" |
| Nomor telepon | 10–15 digit, boleh diawali `+62`/`0` | "Nomor telepon tidak valid" |
| `room.number` | Wajib, unik per properti, maks. 10 karakter | "Nomor kamar sudah dipakai di properti ini" |
| `rent_amount` | > 0, maks. 12 digit | "Harga sewa harus lebih dari 0" |
| `deposit` | ≥ 0 | "Deposit tidak boleh negatif" |
| `start_date` / `end_date` | `end_date` > `start_date` | "Tanggal berakhir harus setelah tanggal mulai" |
| `billing_day` | 1–28 | "Tanggal tagih harus antara 1 dan 28" |
| Item tagihan `amount` | > 0 | "Nominal harus lebih dari 0" |
| Bukti bayar | JPG/PNG/PDF, ≤ 5 MB | "Format file harus JPG, PNG, atau PDF dan maksimal 5 MB" |
| Alasan void/penolakan | Wajib, 5–300 karakter | "Alasan wajib diisi (5–300 karakter)" |

### 11.2 Penanganan Error

| Kode | Kondisi | Respons UI |
|---|---|---|
| 400 | Validasi gagal | Highlight field + pesan di bawah input |
| 401 | Sesi habis | Redirect ke login, pesan "Sesi berakhir, silakan masuk kembali" |
| 403 | Akses properti di luar scope | Halaman 403 + tombol kembali ke dashboard |
| 404 | Data tidak ditemukan | Empty state "Data tidak ditemukan" |
| 409 | Bentrok kontrak / duplikasi | Banner peringatan dengan detail konflik |
| 422 | Aturan bisnis dilanggar (mis. ubah tagihan `paid`) | Toast + penjelasan langkah yang diizinkan |
| 429 | Rate limit | Toast "Terlalu banyak percobaan, coba lagi dalam 15 menit" |
| 500 | Error server | Halaman error + ID referensi untuk dukungan |

### 11.3 Empty States

- Daftar kamar kosong → ilustrasi + tombol "Tambah Kamar Pertama".
- Belum ada tagihan bulan ini → tombol "Generate Tagihan".
- Tidak ada tunggakan → badge hijau "Semua tagihan lancar 🎉".

---

## 12. Notifikasi & Template Pesan

### 12.1 Jadwal Pengiriman

| Kode | Pemicu | Penerima | Kanal |
|---|---|---|---|
| N-01 | Tagihan diterbitkan | Penyewa | WA + email |
| N-02 | H-3 sebelum jatuh tempo | Penyewa | WA |
| N-03 | H0 (hari jatuh tempo) | Penyewa | WA |
| N-04 | H+1 setelah jatuh tempo | Penyewa | WA + email |
| N-05 | H+3 setelah jatuh tempo | Penyewa + Admin | WA |
| N-06 | H+7 setelah jatuh tempo | Penyewa + Owner | WA + email |
| N-07 | Bukti bayar diterima | Penyewa | WA |
| N-08 | Pembayaran diverifikasi | Penyewa | WA |
| N-09 | Pembayaran ditolak | Penyewa | WA + email |
| N-10 | Kontrak berakhir H-30 | Penyewa + Admin | WA |
| N-11 | Kontrak berakhir H-7 | Penyewa + Admin | WA + email |
| N-12 | Tiket prioritas tinggi dibuat | Admin | WA + email |

### 12.2 Contoh Template

**N-01 — Tagihan terbit**
> Halo {nama}, tagihan kost {kamar} periode {periode} sebesar {jumlah} telah terbit. Jatuh tempo {jatuh_tempo}. Detail: {link}. Terima kasih.

**N-04 — Lewat jatuh tempo**
> Halo {nama}, tagihan {kamar} sebesar {jumlah} telah melewati jatuh tempo pada {jatuh_tempo}. Mohon segera melakukan pembayaran. Detail: {link}.

**N-08 — Pembayaran diverifikasi**
> Terima kasih {nama}, pembayaran sebesar {jumlah} untuk tagihan {kamar} telah kami verifikasi. Status tagihan: LUNAS.

### 12.3 Aturan

- Pengiriman dilakukan melalui antrean (queue) dengan retry 3× (interval 5, 15, 60 menit).
- Konten pesan tidak boleh memuat data sensitif seperti nomor KTP.
- Jika penyewa memilih opt-out, hanya N-07, N-08, N-09 yang tetap dikirim (transaksional).
- Log notifikasi dapat difilter per bulan dan diekspor untuk audit.

---

## 13. Matriks Hak Akses (RBAC)

| Kemampuan | Owner | Admin | Staff | Tenant |
|---|---|---|---|---|
| Lihat dashboard semua properti | ✔ | — | — | — |
| Lihat dashboard properti yang ditugaskan | ✔ | ✔ | ✔ | — |
| Kelola properti & kamar | ✔ | ✔ | — | — |
| Kelola penyewa & kontrak | ✔ | ✔ | — | — |
| Buat & terbitkan tagihan | ✔ | ✔ | — | — |
| Catat pembayaran | ✔ | ✔ | — | — |
| Verifikasi / tolak pembayaran | ✔ | ✔ | — | — |
| Void tagihan | ✔ | ✔ | — | — |
| Lihat tagihan sendiri & unggah bukti | — | — | — | ✔ |
| Kelola tiket perbaikan | ✔ | ✔ | ✔ | buat + lihat milik sendiri |
| Lihat laporan keuangan | ✔ | ✔ | — | — |
| Ekspor laporan | ✔ | ✔ | — | — |
| Kelola pengguna & peran | ✔ | — | — | — |
| Ubah pengaturan sistem & template | ✔ | — | — | — |
| Lihat audit log | ✔ | — | — | — |

**Prinsip:** *least privilege* — Admin tidak dapat mengubah peran pengguna atau menghapus properti; hanya dapat menonaktifkan.

---

## 14. Persyaratan Non-Fungsional

| Kategori | Persyaratan | Cara Verifikasi |
|---|---|---|
| Performa | Halaman utama < 2,5 s pada 3G cepat; API p95 < 400 ms | Lighthouse, APM |
| Skalabilitas | 1.000 kamar, 5.000 tagihan/bulan tanpa degradasi | Load test k6 |
| Ketersediaan | Uptime ≥ 99,5% per bulan | UptimeRobot |
| Keamanan | bcrypt/argon2, HTTPS wajib, rate limit login, RBAC di API, audit log | Pentest checklist OWASP |
| Privasi | Data KTP & telepon dienkripsi at-rest; akses sesuai UU PDP | Review skema DB |
| Kompatibilitas | Chrome/Edge/Safari 2 versi terakhir; responsif 360–1440 px | Manual + BrowserStack |
| Aksesibilitas | Kontras WCAG AA, navigasi keyboard pada form utama | axe-core |
| Backup | Harian otomatis, retensi 30 hari, uji restore bulanan | Jadwal & laporan uji |
| Lokalisasi | Bahasa Indonesia, `DD/MM/YYYY`, IDR `Rp 1.500.000` | UAT |
| Observability | Sentry, log terstruktur, health check `/health` | Konfigurasi & uji |
| Auditability | Semua mutasi tercatat dengan pelaku & waktu | Query AuditLog |
| Portabilitas data | Ekspor seluruh data ke CSV/JSON atas permintaan Owner | Uji ekspor |

### 14.1 Batas Kapasitas Awal ⚠️

| Parameter | Nilai Awal |
|---|---|
| Properti per akun | 10 |
| Kamar per properti | 200 |
| Pengguna internal per akun | 20 |
| Ukuran unggahan | 5 MB/file |
| Retensi bukti bayar | 5 tahun |
| Retensi log notifikasi | 12 bulan |

---

## 15. Arsitektur, Tech Stack & API

### 15.1 Tech Stack ⚠️

| Lapisan | Usulan | Alasan |
|---|---|---|
| Frontend | Next.js (React) + Tailwind CSS | SSR cepat, ekosistem besar |
| Backend | NestJS (Node/TypeScript) REST API | Modular, mudah diuji, satu bahasa dengan frontend |
| Database | PostgreSQL | Relasi kuat, transaksi andal, JSONB fleksibel |
| Cache/Queue | Redis + BullMQ | Job terjadwal & retry |
| Storage | S3-compatible (bukti bayar, foto) | Skalabel, signed URL |
| Notifikasi | WhatsApp Business API / SMTP | Kanal utama penyewa Indonesia |
| Auth | JWT access + refresh token, RBAC guard | Stateless, sederhana |
| Deployment | Docker + VPS (Coolify) atau Vercel + Railway | Biaya awal rendah |
| Monitoring | Sentry + UptimeRobot | Deteksi error & downtime |

Alternatif: Laravel + MySQL bila tim lebih familiar dengan PHP.

### 15.2 Ringkasan Endpoint API

| Method | Endpoint | Fungsi | Peran |
|---|---|---|---|
| POST | `/auth/login` | Login | Publik |
| POST | `/auth/refresh` | Perbarui token | Auth |
| POST | `/auth/logout` | Logout | Auth |
| GET | `/dashboard` | Ringkasan KPI | Owner/Admin/Staff |
| GET/POST | `/properties` | Daftar/buat properti | Owner/Admin |
| PATCH | `/properties/:id` | Ubah properti | Owner/Admin |
| GET/POST | `/rooms` | Daftar/buat kamar | Owner/Admin |
| PATCH | `/rooms/:id` | Ubah kamar | Owner/Admin |
| PATCH | `/rooms/:id/status` | Ubah status kamar | Owner/Admin |
| GET/POST | `/tenants` | Daftar/buat penyewa | Owner/Admin |
| PATCH | `/tenants/:id` | Ubah penyewa | Owner/Admin |
| GET/POST | `/contracts` | Daftar/buat kontrak | Owner/Admin |
| POST | `/contracts/:id/end` | Check-out | Owner/Admin |
| GET | `/invoices` | Daftar tagihan + filter | Owner/Admin |
| POST | `/invoices/generate` | Generate massal | Owner/Admin |
| POST | `/invoices/:id/publish` | Terbitkan tagihan | Owner/Admin |
| POST | `/invoices/:id/void` | Batalkan tagihan | Owner/Admin |
| GET | `/invoices/:id` | Detail tagihan | Owner/Admin/Tenant(own) |
| POST | `/payments` | Catat pembayaran | Owner/Admin |
| PATCH | `/payments/:id/verify` | Verifikasi | Owner/Admin |
| PATCH | `/payments/:id/reject` | Tolak | Owner/Admin |
| GET/POST | `/maintenance` | Tiket perbaikan | Semua peran |
| PATCH | `/maintenance/:id` | Ubah status/tiket | Owner/Admin/Staff |
| GET | `/reports/revenue` | Laporan pendapatan | Owner/Admin |
| GET | `/reports/arrears` | Laporan tunggakan | Owner/Admin |
| GET | `/reports/occupancy` | Laporan okupansi | Owner/Admin |
| GET/POST | `/users` | Kelola pengguna | Owner |
| POST | `/uploads/sign` | Signed URL unggah | Auth |
| POST | `/imports/rooms` | Impor kamar CSV | Owner/Admin |
| POST | `/imports/tenants` | Impor penyewa CSV | Owner/Admin |
| GET | `/audit-logs` | Lihat audit log | Owner |

### 15.3 Prinsip Desain API

- Semua endpoint mengembalikan format `{ data, meta }` atau `{ error: { code, message, details } }`.
- Pagination berbasis cursor untuk daftar besar; default 20 item/halaman.
- Idempotency key pada `POST /payments` untuk mencegah duplikasi.
- Zona waktu server: `Asia/Jakarta`; tanggal disimpan UTC, ditampilkan lokal.
- Versi API di prefix `/v1`.

---

## 16. Daftar Layar (Screen Inventory)

| No | Layar | Peran | Prioritas | Komponen Kunci |
|---|---|---|---|---|
| S-01 | Login | Semua | Must | Form email/password, lupa password |
| S-02 | Dashboard | Owner/Admin/Staff | Must | Kartu KPI, grafik tren, daftar jatuh tempo |
| S-03 | Daftar Properti | Owner/Admin | Must | Tabel, filter, tombol tambah |
| S-04 | Detail Properti | Owner/Admin | Must | Info, ringkasan kamar, okupansi |
| S-05 | Grid Kamar | Owner/Admin | Must | Grid status berwarna, filter lantai/status |
| S-06 | Detail Kamar | Owner/Admin | Must | Info, riwayat kontrak, riwayat tagihan |
| S-07 | Daftar Penyewa | Owner/Admin | Must | Tabel, pencarian, filter status |
| S-08 | Detail Penyewa | Owner/Admin | Must | Profil, kontrak aktif, riwayat bayar |
| S-09 | Form Kontrak | Owner/Admin | Must | Validasi bentrok, kalkulasi deposit |
| S-10 | Daftar Tagihan | Owner/Admin | Must | Tabel + filter status/periode |
| S-11 | Detail Tagihan | Owner/Admin | Must | Item, pembayaran, aksi void/terbitkan |
| S-12 | Generate Tagihan | Owner/Admin | Must | Pratinjau massal, konfirmasi |
| S-13 | Inbox Pembayaran | Owner/Admin | Must | Preview bukti, aksi verifikasi/tolak |
| S-14 | Tiket Maintenance | Semua | Should | Kanban (baru/diproses/selesai) |
| S-15 | Laporan | Owner/Admin | Must | Tab pendapatan/tunggakan/okupansi, ekspor |
| S-16 | Pengaturan Pengguna | Owner | Must | Tabel user, peran, scope properti |
| S-17 | Pengaturan Template Notifikasi | Owner | Should | Editor template + preview variabel |
| S-18 | Portal Penyewa | Tenant | Fase 2 | Tagihan, unggah bukti, keluhan |

---

## 17. Rencana Rilis & Estimasi

| Milestone | Cakupan | Durasi | Target |
|---|---|---|---|
| M0 — Discovery | Validasi PRD, wireframe, skema DB, setup environment | 1 minggu | Minggu 1 |
| M1 — Fondasi | Auth, RBAC, CRUD properti/kamar/penyewa/kontrak, audit log | 3 minggu | Minggu 2–4 |
| M2 — Keuangan | Tagihan, item, pembayaran, verifikasi, dashboard | 3 minggu | Minggu 5–7 |
| M3 — Operasional | Check-in/out, maintenance, notifikasi WA/email | 2 minggu | Minggu 8–9 |
| M4 — Laporan & Uji | Laporan, ekspor, impor CSV, UAT, perbaikan bug | 2 minggu | Minggu 10–11 |
| M5 — Rilis | Deploy produksi, migrasi data awal, pelatihan, monitoring | 1 minggu | Minggu 12 |
| Fase 2 | Portal penyewa, payment gateway, inventaris, kredit kelebihan bayar | 2–3 bulan | Setelah MVP |

**Definisi Selesai (DoD):** fitur lulus acceptance criteria, unit test cakupan ≥ 70% untuk modul kritis, lolos code review, dokumentasi API diperbarui, dan diuji di staging.

---

## 18. Rencana Migrasi Data & Onboarding

### 18.1 Migrasi dari Spreadsheet

1. Sediakan template CSV: `rooms.csv` (nomor, lantai, tipe, harga, status) dan `tenants.csv` (nama, telepon, kamar, mulai, durasi, deposit).
2. Admin mengunggah → sistem menampilkan laporan validasi.
3. Perbaiki baris gagal → unggah ulang → impor final (transaksional).
4. Rekonsiliasi: bandingkan jumlah kamar, penyewa aktif, dan total piutang sebelum vs sesudah.

### 18.2 Onboarding Pengguna

| Hari | Aktivitas | Output |
|---|---|---|
| H-7 | Kickoff & konfirmasi PRD | Dokumen disetujui |
| H-5 | Kirim template CSV ke pengelola | Data mentah siap |
| H-3 | Pelatihan 90 menit (Admin & Staff) | Rekaman + panduan PDF |
| H-1 | UAT bersama pengelola | Daftar bug prioritas |
| H0 | Go-live, monitoring ketat | Sistem produksi aktif |
| H+7 | Review adopsi & kendala | Laporan mingguan pertama |
| H+30 | Pendampingan berakhir | Evaluasi KPI awal |

### 18.3 Dukungan

- Kanal: WhatsApp grup + email dukungan.
- Jam kerja: Senin–Jumat 09.00–17.00 WIB; respons maks. 1 hari kerja.
- Insiden kritis (sistem tidak bisa diakses): respons maks. 2 jam.
- Panduan pengguna: artikel bantuan + 5 video pendek per alur utama.

---

## 19. Rencana Pengujian (QA)

| Jenis Uji | Cakupan | Alat | Kriteria Lulus |
|---|---|---|---|
| Unit test | Logika tagihan, kalkulasi deposit, validasi kontrak | Jest/Vitest | Coverage ≥ 70% modul keuangan |
| Integration test | API + database (transaksi, constraint) | Supertest + Testcontainers | Semua endpoint kritis lulus |
| E2E test | Alur penagihan, check-in, verifikasi bayar | Playwright | 5 skenario utama lulus |
| Performance test | 500 pengguna konkuren, 5.000 tagihan/bulan | k6 | p95 < 400 ms, error < 1% |
| Security test | OWASP Top 10, IDOR, akses lintas properti | OWASP ZAP + manual | Tidak ada temuan kritis/tinggi |
| UAT | Skrip uji dengan pengelola asli | Manual checklist | Semua Must lulus |
| Backup & restore drill | Restore database dari backup harian | Manual | Restore < 2 jam, data utuh |

### 19.1 Skrip UAT Inti (ringkas)

- [ ] Login Owner berhasil, akses semua properti.
- [ ] Login Admin dibatasi ke properti yang ditugaskan.
- [ ] Tambah kamar baru dengan nomor duplikat → ditolak.
- [ ] Buat kontrak yang bentrok → ditolak dengan pesan jelas.
- [ ] Generate tagihan massal → jumlah sesuai kontrak aktif.
- [ ] Upload bukti bayar → verifikasi → tagihan berubah `paid`.
- [ ] Tolak pembayaran tanpa alasan → ditolak sistem.
- [ ] Check-out → status kamar berubah & deposit tercatat.
- [ ] Ekspor laporan CSV → angka cocok dengan dashboard.
- [ ] Audit log mencatat aksi verifikasi pembayaran.

---

## 20. Analitik & Event Tracking

| Event | Properti | Tujuan |
|---|---|---|
| `login_success` | role, user_id | Mengukur adopsi per peran |
| `contract_created` | property_id, room_id, duration | Tren penghunian |
| `invoice_generated` | source, jumlah_kontrak, total_nilai | Efisiensi penagihan |
| `invoice_published` | invoice_id, total | Volume tagihan |
| `payment_uploaded` | method, amount | Kanal pembayaran dominan |
| `payment_verified` | latency_hours | KPI kecepatan verifikasi |
| `payment_rejected` | reason_code | Pola kesalahan penyewa |
| `reminder_sent` | channel, status, template_key | Keandalan notifikasi |
| `room_status_changed` | from, to | Pola okupansi |
| `report_exported` | type, format, rows | Penggunaan laporan |
| `maintenance_closed` | duration_days, cost | Efisiensi operasional |

**Aturan:** tidak ada PII (nama, telepon, KTP) dalam event analitik; gunakan ID pseudonim.

---

## 21. Risiko & Mitigasi

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| Data lama (spreadsheet) tidak rapi | Tinggi | Tinggi | Template impor CSV, laporan validasi, pendampingan |
| Pengelola menolak adopsi sistem | Tinggi | Sedang | UI sederhana, pelatihan, dukungan 30 hari |
| Salah input nominal → salah tagih | Tinggi | Sedang | Pratinjau sebelum terbit, void beralasan, audit log |
| Pengiriman WhatsApp gagal/limit | Sedang | Sedang | Fallback email, retry, log status |
| Kebocoran data pribadi | Tinggi | Rendah | Enkripsi, RBAC, audit, backup terenkripsi |
| Scope creep (akuntansi penuh) | Sedang | Tinggi | Tegaskan non-goals, kendali perubahan via PRD |
| Ketergantungan satu pengelola | Sedang | Sedang | Multi-user, dokumentasi, audit log |
| Kehilangan data saat migrasi | Tinggi | Rendah | Dry-run import, backup sebelum migrasi, rollback |
| Server down saat tanggal penagihan | Tinggi | Rendah | Health check, retry job, alerting |

---

## 22. Asumsi & Pertanyaan Terbuka

### 22.1 Asumsi ⚠️

1. Penyewa tidak selalu punya smartphone; portal penyewa bersifat opsional (Fase 2).
2. Sewa ditagih bulanan (bukan harian/mingguan), dengan opsi pro-rata saat check-in tengah bulan.
3. Biaya listrik/air dibebankan flat atau berdasarkan meteran manual yang diinput admin.
4. Satu kamar dihuni satu kontrak (tidak mendukung sewa per kasur/bed).
5. Semua transaksi dalam Rupiah (IDR).
6. Zona waktu operasional `Asia/Jakarta`.
7. Aplikasi hanya untuk satu akun bisnis (bukan SaaS multi-tenant publik) pada MVP.

### 22.2 Pertanyaan untuk Pemilik Produk

1. Berapa jumlah kamar dan properti yang akan dikelola pada 6 bulan pertama?
2. Apakah harga sewa sudah termasuk listrik/air, atau ditagih terpisah per meteran?
3. Apakah dibutuhkan sewa per kasur (kost campur dengan pembagian bed)?
4. Metode penagihan utama: transfer ke satu rekening, atau perlu virtual account/QRIS?
5. Apakah pengingat via WhatsApp wajib sejak MVP?
6. Perlukah kontrak digital ditandatangani secara elektronik?
7. Bagaimana kebijakan deposit (dikembalikan penuh atau dipotong biaya kebersihan)?
8. Siapa yang melakukan verifikasi pembayaran dan berapa SLA-nya?
9. Apakah dibutuhkan pencatatan meteran listrik/air per kamar setiap bulan?
10. Apakah sistem akan dijual ke pengelola kost lain (SaaS) atau internal saja?

---

## 23. Definisi & Istilah

| Istilah | Definisi |
|---|---|
| Kontrak | Perjanjian sewa antara penyewa dan pengelola untuk satu kamar |
| Tagihan (Invoice) | Dokumen penagihan untuk satu periode sewa |
| Tunggakan | Tagihan yang belum dibayar setelah tanggal jatuh tempo |
| Okupansi | Persentase kamar terisi dibanding total kamar aktif |
| Void | Pembatalan tagihan yang sudah terbit, disertai alasan |
| Pro-rata | Perhitungan sewa sebagian bulan saat masuk/keluar di tengah periode |
| RBAC | Role-Based Access Control, pembatasan akses berdasarkan peran |
| Aging | Pengelompokan umur tunggakan (1–7, 8–30, >30 hari) |
| Signed URL | Tautan sementara untuk mengakses file privat |
| Idempotency key | Kunci unik untuk mencegah pemrosesan ganda pada request yang sama |
| Soft delete | Menandai data terhapus tanpa menghapus baris dari database |
| DoD | Definition of Done, kriteria kelayakan sebuah fitur dianggap selesai |

---

## 24. Riwayat Revisi

| Versi | Tanggal | Perubahan | Penulis |
|---|---|---|---|
| 1.0 | 2026-11-01 | Draft awal PRD manajemen kost | Tim produk |
| 1.1 | 2026-11-01 | Melengkapi isi: user stories & acceptance criteria, skema data detail, aturan validasi & error, template notifikasi, API, screen inventory, migrasi, QA, analitik | Tim produk |

---

### Lampiran A — Checklist Pertanyaan yang Harus Dijawab Sebelum Development

- [ ] Jumlah kamar/properti awal
- [ ] Model tagihan listrik & air
- [ ] Kebutuhan sewa per kasur
- [ ] Metode pembayaran (transfer manual vs VA/QRIS)
- [ ] WhatsApp wajib atau opsional di MVP
- [ ] Kebijakan deposit
- [ ] Pemilik keputusan verifikasi pembayaran
- [ ] Sasaran: internal saja atau SaaS

> Setelah checklist di atas dijawab, versi PRD akan dinaikkan menjadi **v1.2 — Final** dan siap menjadi acuan sprint planning.
