# Hasil Pengujian — Uply Digital V25 Business Suite

Tanggal build: 4 Oktober 2026

## Pengujian statis yang dijalankan

Perintah berikut berhasil tanpa syntax error:

```bash
npm run check
npm run test:smoke
```

`npm run check` memeriksa:
- `app.js`
- `api/uply.js`
- `api/health.js`
- `api/payment-webhook.js`
- `api/product-image.js`
- `api/qris-image.js`
- `lib/db.js`
- `lib/security.js`
- `lib/midtrans.js`
- `lib/payment-state.js`
- `lib/business.js`

Smoke check memastikan file Vercel inti tersedia dan marker fitur berikut ada pada frontend/API/database:
- Smart Voucher System
- Balance System
- Reporting System
- Role Connector Otomatis
- tabel `vouchers`
- tabel `balance_ledger`
- tabel `admin_notifications`
- endpoint QRIS image
- route Vercel utama

## Pemeriksaan logika V25

Diperiksa secara statis:
- migrasi database menggunakan `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` dan tidak melakukan reset data;
- voucher divalidasi di server sebelum diskon dipakai;
- penggunaan voucher dicatat pada `voucher_usages`;
- saldo dicatat pada `balance_ledger`;
- refund saldo dibuat idempotent menggunakan `credit_refunded`;
- checkout mendukung Midtrans, transfer manual, QRIS manual, dan saldo;
- QRIS statis tidak ditandai sebagai pembayaran otomatis;
- stok manual dan inventory otomatis dipisahkan;
- threshold stok menipis tersedia per produk;
- role otomatis dapat di-override admin;
- laporan CSV tersedia dari panel admin;
- credential top-up tidak dimasukkan ke public order response;
- route `/api/qris-image` tidak mengekspos data QRIS melalui katalog JSON.

## Yang harus diuji setelah deploy Production

Pengujian berikut membutuhkan environment/account milik pengguna dan tidak dapat divalidasi secara nyata dari build lokal:
1. Koneksi Neon PostgreSQL Production.
2. Migrasi schema pada database Production yang sudah berisi data.
3. Transaksi Midtrans Production dan channel pembayaran merchant yang aktif.
4. Webhook Midtrans dari jaringan publik.
5. Pengiriman email Resend jika `RESEND_API_KEY` dipakai.
6. Upload QRIS/thumbnail dan penyimpanan data pada database Production.
7. Siklus order nyata: checkout → pembayaran → fulfilment → invoice → report.

Sebelum deploy Production disarankan membuat snapshot/backup database Neon dan melakukan satu order uji bernilai kecil atau memakai metode manual terlebih dahulu.


## V25.1 hotfix checks
- `npm run check`: PASS
- `npm run test:smoke`: PASS
- Checkout scope regression check (`order.name`): PASS
- Checkout preflight marker: PASS
- Custom mobile quantity control marker: PASS
- Product thumbnail fallback marker: PASS
- SVG action icons present: PASS
- Live Neon/Midtrans Production transaction tetap harus diuji setelah deploy karena membutuhkan credential merchant pengguna.
