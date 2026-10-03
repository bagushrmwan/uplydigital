# Uply Digital V10 — Vercel Native

Versi V10 memperbaiki alur checkout dan menambahkan invoice pelanggan yang mengikuti status pembayaran/pemrosesan. Arsitektur tetap Vercel + PostgreSQL/Neon dan tetap mendukung transfer manual maupun Midtrans.

## Yang diperbaiki

### Checkout
Bug V9 berasal dari atribut `data-product` yang dipakai sekaligus oleh tombol detail dan form checkout. Setelah event klik dipindah ke level document agar tombol dalam modal bisa bekerja, klik input checkout ikut dianggap sebagai klik detail produk.

V10 memisahkan atribut menjadi:
- `data-view-product` untuk tombol detail produk.
- `data-product-id` untuk form checkout.

Hasilnya: pelanggan dapat mengisi form checkout tanpa popup detail produk muncul kembali.

### Invoice pelanggan
Invoice muncul setelah pembayaran dikirim dan terus diperbarui sampai order selesai. Isinya:
- nomor invoice dan order,
- tanggal order,
- metode pembayaran,
- status pembayaran dan pesanan,
- timeline pembayaran dikirim -> terverifikasi -> diproses -> selesai,
- nama/email/WhatsApp pelanggan,
- produk, durasi, harga satuan, jumlah, subtotal, total,
- rekening tujuan untuk transfer manual,
- tombol Cetak / Simpan PDF.

### Timestamp database baru
V10 menambahkan secara otomatis:
- `payment_submitted_at`
- `payment_verified_at`
- `processing_at`
- `completed_at`

Migrasi menggunakan `ADD COLUMN IF NOT EXISTS`, jadi database lama tidak perlu dihapus.

## Instalasi update
1. Replace file repository GitHub dengan seluruh isi V10.
2. Commit ke branch Production (`main` pada setup kamu).
3. Tunggu Vercel membuat Production Deployment baru.
4. Tidak perlu mengubah Environment Variables jika V9 sebelumnya sudah terhubung.
5. Refresh website dengan Ctrl+Shift+R.

## Environment Variables utama
- `DATABASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PAYMENT_MODE`
- `SITE_URL`

Untuk Midtrans juga gunakan:
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_IS_PRODUCTION`

## Test setelah deploy
Lihat `MULAI-DARI-SINI.txt` dan `HASIL-PENGUJIAN.md`.
