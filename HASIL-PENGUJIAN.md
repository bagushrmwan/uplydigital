# Hasil Pengujian Uply Digital V8

Pengecekan lokal yang dilakukan:

- `app.js`: syntax check lulus.
- `api/uply.js`: syntax check lulus.
- `api/health.js`: syntax check lulus.
- `api/payment-webhook.js`: syntax check lulus.
- `lib/db.js`: syntax check lulus.
- `lib/security.js`: syntax check lulus.
- `lib/midtrans.js`: syntax check lulus.
- `lib/email.js`: syntax check lulus.
- Referensi logo frontend diarahkan ke `assets/logo-uply-digital.png`.
- Teks teknis homepage lama sudah dihapus.
- Backend menyediakan `inventoryAdd` dan `inventorySetStatus`.
- Schema migration menambahkan `inventory.note` dengan `ALTER TABLE ... IF NOT EXISTS`, sehingga database lama dapat diperbarui tanpa menghapus data.

Belum bisa diuji secara end-to-end tanpa kredensial/database pengguna:

- koneksi Neon/PostgreSQL nyata;
- login admin Vercel production;
- transaksi Midtrans Sandbox;
- webhook Midtrans nyata;
- pengiriman email provider production.

Setelah deploy, lakukan tes berurutan:

1. `/api/health`
2. Login admin
3. Tambah 1 inventory
4. Daftar pelanggan
5. Checkout manual
6. Verifikasi admin
7. Midtrans Sandbox
8. Auto-delivery inventory
