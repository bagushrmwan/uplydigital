# Uply Digital V11 — Desktop + Mobile Responsive

V11 menggunakan **satu codebase responsif** dengan dua pengalaman UI yang berbeda:

## Desktop
- Header penuh: logo + teks Uply Digital, Beranda, Produk, Dashboard, Pesanan, Bantuan.
- Hero dua kolom dengan produk unggulan dan 3 produk rekomendasi.
- Katalog hingga 4 kolom.
- Dashboard pelanggan dengan sidebar.
- Checkout dua kolom dan ringkasan sticky.
- Panel admin tetap lengkap dengan layout desktop.

## Mobile
- Header ringkas tetapi nama **Uply Digital tetap terlihat**.
- Bottom navigation tetap: Beranda, Produk, Dashboard, Pesanan.
- Hero ditumpuk dan tombol dibuat touch-friendly.
- Katalog berubah menjadi card horizontal satu kolom.
- Dashboard pelanggan menjadi mobile card tanpa sidebar.
- Checkout menjadi satu kolom.
- Admin tabs menjadi horizontal-scroll agar tidak memenuhi layar.
- Invoice tetap responsif dan bisa Print / Save PDF.

## Fitur dipertahankan
- PostgreSQL / Neon.
- Login pelanggan dan admin.
- Checkout manual dan Midtrans.
- Invoice dan status order.
- Inventory satu-per-satu.
- Auto fulfillment inventory.
- Panel admin, produk, bank, pelanggan, audit.

Tidak perlu database baru. V11 memakai backend V10 yang sama.
