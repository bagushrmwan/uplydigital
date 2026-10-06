# Uply Digital V31.7

## Logo lebih menyatu
- `assets/logo-mark.png` sekarang memakai alpha/transparansi.
- Background putih pada logo header/footer dihapus.
- Logo memakai drop-shadow halus tanpa kotak putih dan tetap terbaca di light/dark mode.

## Email otomatis ke pembeli
Email transaksi dikirim ke email akun pelanggan saat:
1. Pesanan berhasil dibuat.
2. Pembayaran otomatis berhasil diverifikasi.
3. Pesanan selesai / produk terkirim.

Provider yang didukung:
- Brevo API (direkomendasikan jika belum punya domain sendiri; verifikasi sender email di Brevo).
- Resend API sebagai alternatif.

Email bersifat non-blocking: checkout tetap berhasil walaupun provider email sedang tidak dikonfigurasi/down.
