# Uply Digital V25.1

Hotfix stabilitas untuk V25 Business Suite.

## Bug yang diperbaiki

1. **Checkout HTTP 500** — order V25 dapat tersimpan, tetapi response gagal karena notifikasi admin memakai variabel `name` yang sudah keluar dari scope transaksi. Sekarang memakai `order.name`.
2. **Quantity detail produk tidak terlihat di mobile** — konflik CSS lama membuat teks quantity putih di atas background putih.
3. **Quantity checkout** — native select diganti kontrol minus/angka/plus untuk hasil konsisten di Safari iOS/Android.
4. **Simbol kotak** — tombol mobile utama memakai inline SVG, bukan karakter Unicode dekoratif.
5. **Thumbnail rusak** — jika upload/API thumbnail gagal, UI otomatis kembali ke thumbnail bawaan sesuai produk.
6. **Checkout preflight** — validasi stok, payment method, bank, voucher/balance, dan credential Top Up dilakukan sebelum create order.
7. **Idempotency retry** — request ID dipertahankan pada percobaan ulang form yang sama untuk mengurangi risiko order duplikat.
8. **Error reference** — backend memberi kode ERR-... untuk memudahkan pencarian di Vercel Logs.

## Deploy

Gunakan Environment Variables V25 yang sudah ada. Tidak perlu membuat database baru.

Setelah deploy buka `/api/health` dan periksa:
- `backend: connected`
- `database: connected`
- `version: 25.1`
- `checkoutSchemaReady: true`
