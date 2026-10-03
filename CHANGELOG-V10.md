# Uply Digital V10 — Checkout + Invoice Fix

## Perbaikan utama
- Memperbaiki bug popup detail produk yang muncul saat pelanggan mengisi form checkout.
- Selector tombol detail produk dan form checkout sekarang dipisahkan.
- Tombol **Lanjut checkout** tetap bekerja dari modal detail produk.
- Menambahkan invoice pelanggan setelah pembayaran dikirim.
- Invoice otomatis diperbarui ketika pembayaran terverifikasi, pesanan diproses, dan pesanan selesai.
- Menambahkan tombol **Cetak / Simpan PDF** pada invoice.
- Invoice menampilkan nomor invoice, nomor order, pelanggan, produk, harga, kuantitas, total, metode pembayaran, dan timeline status.
- Menambahkan timestamp database: `payment_submitted_at`, `payment_verified_at`, `processing_at`, dan `completed_at`.
- Midtrans webhook dan proses manual admin ikut memperbarui timestamp invoice.

## Database lama
Tidak perlu membuat database baru. Kolom V10 ditambahkan otomatis dengan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` saat API pertama kali dijalankan setelah deployment.
