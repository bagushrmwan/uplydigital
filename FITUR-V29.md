# Fitur Uply Digital V29

## Warranty / Claim Center
Pelanggan dapat mengajukan klaim dari order selesai yang masih dalam masa garansi, memilih jenis kendala, menjelaskan masalah, dan upload screenshot. Admin dapat mengubah status klaim dan memberi catatan.

## Garansi per produk / varian
Admin menentukan jumlah hari garansi pada produk atau varian. Setelah order selesai, `warranty_until` dihitung otomatis. Varian dengan nilai 0 mengikuti garansi produk utama.

## Order Timeline
Detail order memperlihatkan progress order dari dibuat sampai selesai berdasarkan timestamp backend.

## Harga Modal & Profit
Produk/varian menyimpan harga modal. Saat checkout, harga modal disnapshot ke order agar laporan lama tetap konsisten meski modal produk berubah kemudian. Laporan menampilkan estimasi modal, laba, dan margin.

## Flash Sale Scheduler
Admin dapat mengisi harga promo, waktu mulai, dan berakhir. Harga efektif dihitung server-side sehingga checkout tidak bergantung pada manipulasi browser.

## Customer Notifications
Customer mendapat notifikasi internal untuk pembayaran terverifikasi, order diproses/selesai, dan perubahan status klaim.

## Payment Monitor
Panel admin menampilkan percobaan gateway dan event pembayaran. Untuk order Midtrans, admin dapat menjalankan cek status ulang server-to-server.

## Metode Pembayaran
Menu mobile Metode Pembayaran sekarang membuka halaman khusus yang menampilkan metode yang benar-benar aktif: Midtrans, QRIS manual, transfer bank, dan/atau Saldo Uply.
