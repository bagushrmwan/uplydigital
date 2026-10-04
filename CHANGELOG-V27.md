# Changelog Uply Digital V27

## Product Variant System

- Menambahkan tabel PostgreSQL `product_variants`.
- Satu produk sekarang dapat memiliki banyak varian harga/stok.
- Menambahkan nama, subtitle, harga jual, harga coret, stok, badge, urutan, dan status aktif per varian.
- Produk tanpa varian tetap kompatibel dengan sistem lama.
- Katalog hanya menampilkan satu kartu per produk.
- Harga kartu otomatis menjadi rentang ketika harga antar-varian berbeda.
- Halaman detail produk mempunyai bagian **Pilih Varian**.
- Varian stok habis otomatis disabled, pudar, dan mendapat label **Stok Habis**.
- Varian dapat mempunyai badge promo/terlaris/hemat.

## Cart & Checkout

- Cart menyimpan `productId + variantId + quantity`.
- Nama varian tampil di cart, checkout, dashboard, order, admin, email, dan export laporan.
- Checkout memvalidasi ulang varian di server.
- Harga tidak diambil dari browser; server selalu membaca harga varian dari database.
- Stok varian manual dikurangi atomik pada transaksi checkout.
- Stok varian dikembalikan saat order dibatalkan/kedaluwarsa/payment gagal.
- Voucher, saldo, Midtrans, QRIS manual, dan transfer manual tetap kompatibel.

## Inventory Otomatis

- Inventory sekarang mempunyai `variant_id`.
- Produk inventory dengan varian mewajibkan admin memilih varian ketika menambah/import inventory.
- Auto delivery hanya mengambil inventory dari varian yang dibeli.
- Low-stock notification dapat menyebut nama varian.

## Admin

- Tombol **Varian (N)** ditambahkan pada setiap produk.
- Admin dapat tambah/edit/hapus/nonaktifkan/reorder varian.
- Stok manual dapat diatur per varian.
- UI pengelolaan varian dibuat responsif untuk mobile tanpa tabel lebar.
- Export CSV sekarang mempunyai kolom Varian.
- Dokumentasi admin ditambah panduan varian.

## Database

Migration non-destruktif:

- `CREATE TABLE IF NOT EXISTS product_variants ...`
- `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant_id ...`
- `ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_id ...`
- `ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_name ...`
- `ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_subtitle ...`

Tidak ada reset data lama.
