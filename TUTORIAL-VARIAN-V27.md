# Tutorial Varian Produk — Uply Digital V27

## 1. Deploy V27

Backup database Neon terlebih dahulu untuk keamanan production.

Replace seluruh file repository lama dengan V27 lalu push ke branch Vercel (umumnya `main`). Environment Variables lama tetap digunakan.

Setelah Vercel selesai deploy, buka:

`https://DOMAIN-KAMU.vercel.app/api/health`

Pastikan:

- `backend = connected`
- `database = connected`
- `version = 27.0`
- `variantSystemReady = true`

Migration varian dibuat otomatis pada database Neon yang sama.

## 2. Membuat produk dengan banyak varian

Masuk:

`Panel Admin → Produk`

Buat/edit produk utama seperti biasa. Contoh:

- Nama: Netflix Premium
- Kategori: Streaming
- Thumbnail: Netflix
- Fulfillment: Manual Admin

Setelah produk tersimpan, tekan:

`Varian (0)`

Lalu tekan `+ Tambah Varian`.

## 3. Contoh varian Netflix

Contoh konfigurasi:

| Varian | Subtitle | Harga | Harga Coret | Stok | Badge |
|---|---|---:|---:|---:|---|
| 1 Hari | All Devices | 3.000 | 0 | 0 | |
| 3 Hari | Full Garansi | 6.000 | 0 | 0 | |
| 7 Hari | Full Garansi | 12.000 | 0 | 0 | |
| 2 User 1 Profil | Akses manual ke CS | 17.000 | 19.500 | 3 | Hemat 13% |
| 1 User 1 Profil | Akses manual ke CS | 27.000 | 0 | 0 | |
| Private 1 Bulan | Bergaransi 25–28 Hari | 110.000 | 0 | 0 | |

Varian stok 0 tetap dapat disimpan, tetapi otomatis tampil sebagai **Stok Habis** dan tidak bisa dipilih customer.

## 4. Stok varian

Untuk produk Manual Admin:

`Produk → Varian → Stok`

Pilih:

- Tambah stok
- Kurangi stok
- Set stok langsung

Gunakan `-1` pada Set Stok jika varian ingin dibuat tanpa batas.

## 5. Inventory otomatis per varian

Jika produk memakai `Inventory Otomatis`, jangan mengisi stok angka varian secara manual.

Masuk:

`Panel Admin → Inventory`

Selector akan menampilkan target seperti:

- Netflix Premium — 1 Hari
- Netflix Premium — 3 Hari
- Netflix Premium — Private 1 Bulan

Masukkan akun/kode/link pada varian yang sesuai. Stok storefront dihitung dari inventory `available` varian tersebut.

## 6. Harga di katalog

Jika produk memiliki:

- varian termurah Rp3.000
- varian termahal Rp110.000

maka satu kartu produk akan menampilkan:

`Rp3.000 – Rp110.000`

Tidak perlu membuat enam kartu Netflix berbeda.

## 7. Menggabungkan produk lama yang terpisah

V27 tidak otomatis menghapus atau menggabungkan produk lama agar histori order tidak rusak.

Jika sebelumnya kamu memiliki beberapa produk terpisah, lakukan:

1. Pilih satu produk sebagai produk utama.
2. Tambahkan seluruh paketnya sebagai varian.
3. Pastikan harga dan stok benar.
4. Tes checkout satu varian.
5. Nonaktifkan produk duplikat lama dari Admin → Produk.
6. Jangan hapus histori order lama.

Contoh Facebook Stars: kamu dapat membuat satu produk `Facebook Stars`, lalu varian `6.400 Stars`, `12.800 Stars`, `19.200 Stars`, kemudian menonaktifkan kartu Stars lama satu per satu setelah pengujian.

## 8. Hal yang diuji setelah deploy

Tes minimal:

1. Varian stok 0 harus disabled.
2. Varian stok >0 dapat dipilih.
3. Harga detail berubah sesuai varian.
4. Add to Cart membawa varian yang benar.
5. Checkout menampilkan nama/harga varian.
6. Order admin menampilkan nama varian.
7. Qty tidak boleh melebihi stok varian.
8. Pembatalan mengembalikan stok varian.
9. Inventory otomatis hanya mengambil item dari varian yang dibeli.
