# Hasil Pengujian V15

## Lulus
- PASS — syntax check seluruh JavaScript frontend/backend.
- PASS — mock BeliBayar QRIS create memakai endpoint Sandbox `/direct/v1/sandbox/payment/charge`.
- PASS — HMAC-SHA256 `X-Signature` request dibuat.
- PASS — mock inquiry status memakai `/direct/v1/sandbox/payment/status/:reference` + `X-Timestamp`.
- PASS — verifikasi webhook `X-Belibayar-Signature` dengan raw body.
- PASS — action frontend dan backend konsisten.
- PASS — thumbnail upload validation JPG/PNG/WebP ditambahkan.
- PASS — endpoint `/api/product-image` ditambahkan.
- PASS — migration thumbnail/payment payload bersifat non-destructive (`IF NOT EXISTS`).
- PASS — stock manual: add pada stok finite menambah nilai; add pada `-1` mengubah menjadi jumlah yang dimasukkan.
- PASS — katalog direload setelah update stock.

## Belum dapat diuji tanpa akun user
- Transaksi BeliBayar Sandbox nyata.
- IP whitelist merchant BeliBayar.
- Webhook BeliBayar nyata ke domain Vercel.
- PostgreSQL production user.

## Test yang wajib setelah deploy
1. `/api/health`
2. Login admin
3. Netflix: set stok 0 → Tambah stok 5 → pastikan tampil 5
4. Upload thumbnail baru → pastikan card/detail berubah
5. Checkout Sandbox → QRIS tampil
6. Simulasi `success` di dashboard BeliBayar → order berubah Processing/Completed
7. Simulasi expire/cancel → stock manual kembali
