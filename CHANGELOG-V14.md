# Uply Digital V14 — Payment & Stock Reliability Fix

V14 fokus memperbaiki dua area yang dilaporkan bermasalah: pembayaran otomatis Midtrans dan pengelolaan stok produk.

## Pembayaran otomatis
- Snap transaction sekarang memasang `X-Override-Notification` otomatis ke `/api/payment-webhook` berdasarkan `SITE_URL` (atau `MIDTRANS_NOTIFICATION_URL` jika diisi).
- Midtrans menggunakan gateway order ID terpisah (`...-P1`, `...-P2`) agar retry transaksi tidak bentrok dengan order ID yang pernah dipakai.
- Menambahkan `gateway_order_id` dan `gateway_attempt` dengan migration non-destruktif.
- Menambahkan GET Status Midtrans sebagai fallback melalui tombol **Cek status pembayaran**.
- Setelah kembali dari Midtrans, website mencoba sinkron status order otomatis.
- Error Midtrans sekarang tampil lebih jelas, termasuk Server Key salah / Sandbox-Production tidak cocok / timeout.
- Webhook dibuat retry-safe: event baru dianggap selesai setelah pemrosesan sukses. Jika server error, notification retry tetap bisa diproses.
- Webhook memvalidasi nominal pembayaran terhadap total order.
- Pembayaran yang datang setelah order dibatalkan tidak otomatis menghidupkan order lagi; masuk review admin.
- `/api/health` sekarang menunjukkan kesiapan Midtrans, environment Sandbox/Production, dan notification URL tanpa membocorkan secret.

## Stok
- Menambahkan tombol **Tambah stok / Atur stok** langsung dari Panel Admin → Produk.
- Admin dapat: Tambah stok, Kurangi stok, atau Set stok langsung.
- `-1` tetap berarti stok tanpa batas.
- Update stok memakai row lock PostgreSQL agar aman terhadap perubahan bersamaan.
- Reservasi stok checkout manual dibuat atomik di dalam transaksi database untuk mengurangi overselling.
- Produk `Inventory Otomatis` tidak lagi membingungkan dengan stok manual: stoknya ditambah lewat menu Inventory.
- Menu Inventory hanya menampilkan produk yang memang memakai mode Inventory Otomatis.
- Backend menolak penambahan inventory ke produk stok manual dan memberi pesan yang jelas.

## Tetap dipertahankan
- Responsive Desktop + Mobile
- Tema System / Light / Dark
- Thumbnail per produk
- Top Up manual via login terenkripsi
- Dashboard pelanggan & admin
- Invoice
- Midtrans dan transfer manual
- Featured product, best seller, promo banner, low-stock alert, funnel order
