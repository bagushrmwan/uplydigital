# Uply Digital V26 — Brand & Account UX Release

V26 berfokus pada polish yang paling terasa saat dipakai langsung di HP: identitas Uply Digital, visibilitas tombol keranjang, dan kelola akun pelanggan.

## Perubahan utama

- Seluruh layer visual storefront diarahkan ke identitas Uply Digital: biru `#0B5CFF`, cyan, navy, background biru-putih lembut.
- Tombol **+ Keranjang** di detail produk sekarang menggunakan gradient biru dengan teks/icon putih dan state disabled yang jelas.
- Tombol cart di header diberi background biru dan badge putih-biru supaya selalu terlihat.
- CTA utama, active filter, promo, loading animation, sticky action mobile, cart drawer, dan admin active state mengikuti palette Uply.
- Ditambahkan halaman **Kelola Akun** (`#akun`) dengan edit nama, email, WhatsApp, ubah password, logout, dan logout semua perangkat.
- Ditambahkan backend action `updateProfile`, `changePassword`, dan `logoutAll` dengan validasi server.
- Mobile hamburger menu menampilkan identitas akun, Dashboard, Pesanan, Kelola Akun, dan Logout saat pengguna sudah login.
- Dashboard pelanggan mempunyai shortcut Kelola Akun.
- Sticky WhatsApp/Lihat Produk otomatis disembunyikan pada halaman akun, dashboard, pesanan, checkout, dan admin agar tidak menutupi form/tombol.
- Dark mode tetap dipertahankan dengan kontras Uply Blue.
- Backend Vercel, Neon PostgreSQL, Voucher, Balance, Reporting, Inventory, QRIS manual, Midtrans, dan Business Suite V25 tetap dipertahankan.

## Database

Tidak membutuhkan database baru dan tidak ada reset data. V26 menggunakan struktur V25/V25.1 yang sama.
