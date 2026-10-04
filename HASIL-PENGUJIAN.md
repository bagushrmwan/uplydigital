# Hasil Pengujian Uply Digital V27

Tanggal build: 2026-10-04

## Static syntax check

`npm run check` — PASS

Mencakup:

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

## Smoke check

`npm run test:smoke` — PASS

Marker yang diperiksa antara lain:

- tabel `product_variants`;
- kolom variant pada order dan inventory;
- API save/delete/adjust stock variant;
- resolver server-side variant;
- UI pilih varian;
- UI admin varian;
- compatibility V26 account UX;
- business suite Voucher/Balance/Reporting/Role;
- branding Uply Digital.

## Logic review

PASS untuk source-level review:

- produk tanpa varian tetap memakai harga/stok lama;
- produk dengan varian mewajibkan `variantId` di checkout;
- harga varian dibaca ulang dari PostgreSQL;
- stok manual varian direserve dalam database transaction;
- stok varian dikembalikan pada cancel/expire/payment failure;
- inventory otomatis difilter per `product_id + variant_id`;
- cart menyimpan varian;
- checkout, order dan CSV membawa nama varian;
- varian stok 0 disabled di storefront;
- delete varian yang sudah dipakai berubah menjadi nonaktif agar histori aman.

## Batas pengujian

Belum diuji terhadap database Neon production dan transaksi payment production milik pengguna karena credential production tidak tersedia di lingkungan build. Setelah deploy lakukan satu order uji untuk produk dengan varian sebelum membuka ke pelanggan umum.
