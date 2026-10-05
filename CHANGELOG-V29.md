# Uply Digital V29 — Growth & Trust Suite

## Perubahan utama
- Memperbaiki menu mobile **Metode Pembayaran** agar menuju halaman khusus `#pembayaran`, bukan `#bantuan`.
- Menambahkan **Warranty / Claim Center** untuk pelanggan dan admin.
- Menambahkan garansi per produk/varian dengan tanggal akhir garansi otomatis pada order selesai.
- Menambahkan **Order Timeline**: dibuat, pembayaran dikirim, pembayaran terverifikasi, diproses, selesai.
- Menambahkan **Harga Modal & Estimasi Laba** pada produk/varian dan laporan admin.
- Menambahkan **Flash Sale Scheduler** per produk/varian (harga promo + mulai + berakhir).
- Menambahkan **Customer Notification Center** untuk update pembayaran/order/garansi.
- Menambahkan **Payment Monitor** untuk percobaan Midtrans dan event webhook, termasuk tombol cek ulang.
- Mempertahankan varian produk, galeri multi-image, voucher, saldo, inventory, safe delete/restore, kelola akun/logout, dan mobile admin.

## Database
Migration otomatis menambah tabel `warranty_claims`, `customer_notifications` dan kolom cost/warranty/sale yang diperlukan menggunakan pola non-destruktif. Data lama tidak dihapus.
