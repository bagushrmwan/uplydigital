# Uply Digital V15 — BeliBayar + Stock + Thumbnail Upload

## Perbaikan utama
- Payment gateway Midtrans diganti ke **BeliBayar Direct API**.
- Mode otomatis V15 menggunakan QRIS BeliBayar sebagai default.
- Webhook BeliBayar diverifikasi dengan `X-Belibayar-Signature` memakai HMAC-SHA256 raw body.
- Tombol **Cek status pembayaran** memakai endpoint inquiry status BeliBayar.
- Instruksi QRIS tampil langsung di detail pesanan, termasuk QR image dan ID transaksi.
- Error API Key, Secret, Sandbox/Live, timeout, dan terutama IP whitelist dibuat lebih jelas.

## Stock
- Perbaikan tombol **Tambah stok / Atur stok** pada produk manual.
- Jika stok sebelumnya `-1` (Tanpa Batas), aksi **Tambah stok 10** sekarang mengubah stok menjadi `10`, bukan gagal.
- Setelah stok tersimpan, data Admin dan katalog langsung dimuat ulang.
- Produk mode Inventory Otomatis tetap memakai menu Inventory, bukan stok manual.

## Thumbnail
- Panel Admin > Produk sekarang memiliki **Upload thumbnail**.
- Mendukung JPG, PNG, WebP maksimal sekitar 1 MB.
- File gambar disimpan di PostgreSQL dan disajikan melalui `/api/product-image`.
- URL/path thumbnail lama masih didukung.

## Database
Migration V15 hanya menambah kolom dengan `IF NOT EXISTS`:
- `products.thumbnail_mime`
- `products.thumbnail_data`
- `orders.gateway_payment_method`
- `orders.gateway_payment_channel`
- `orders.gateway_payload`

Tidak ada reset tabel atau penghapusan data lama.
