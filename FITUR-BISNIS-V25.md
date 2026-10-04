# Detail Fitur Bisnis Uply Digital V25

## 1. Dashboard Admin Lengkap
Panel Ringkasan menampilkan KPI operasional, funnel, grafik 14 hari, produk terlaris, payment mix, stok menipis, notification center, quick actions, dan order terbaru.

## 2. Auto QRIS / Payment
Midtrans digunakan sebagai jalur otomatis jika merchant mempunyai channel aktif. V25 tidak memalsukan verifikasi QRIS: QRIS statis yang diupload ke toko tetap berstatus manual hingga admin mencocokkan pembayaran.

## 3. Instant Auto Delivery
Produk ber-mode `inventory` mengambil item tersedia secara database-lock setelah pembayaran verified. Inventory ditandai delivered dan order otomatis completed.

## 4. Balance System
`users.balance` menyimpan saldo berjalan; `balance_ledger` menyimpan semua perubahan. Balance dapat digunakan sebagian/seluruhnya pada checkout. Refund balance idempotent memakai `orders.credit_refunded`.

## 5. Smart Voucher
Voucher divalidasi server-side. Database menyimpan kuota dan `voucher_usages` untuk limit total/per user. Diskon tersimpan pada order sehingga invoice/report tetap konsisten.

## 6. Auto Recap & Statistik
Backend merangkum 30 hari berdasarkan timezone Asia/Jakarta, produk terlaris, payment mix, omzet verified, dan funnel status.

## 7. Multi Payment
Checkout dapat menampilkan Midtrans, transfer bank manual, QRIS manual, dan Saldo Uply secara bersamaan sesuai pengaturan admin.

## 8. Smart Stock
Produk manual mempunyai stock integer atau `-1` unlimited. Produk inventory menghitung item available. `low_stock_threshold` dapat diatur per produk dan menghasilkan alert/notifikasi.

## 9. Dokumentasi Lengkap
Tab Dokumentasi tersedia langsung di admin agar flow operasional tidak tergantung README eksternal.

## 10. Role Connector Otomatis
Default rule:
- Customer: awal
- Member: >= 3 completed order atau >= Rp250.000 spent
- Reseller: >= 10 completed order atau >= Rp1.000.000 spent
- VIP: >= 30 completed order atau >= Rp3.000.000 spent
Admin dapat override manual.

## 11. Reporting
Admin dapat melihat recap dan mengunduh CSV dengan order ID, tanggal, customer, produk, subtotal, diskon, voucher, saldo, pembayaran, metode, dan status.
