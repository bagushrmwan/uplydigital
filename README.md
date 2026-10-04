# Uply Digital V27 — Product Variants

V27 menambahkan sistem **varian produk** ke Uply Digital agar satu produk dapat mempunyai banyak paket, harga, dan stok tanpa memenuhi katalog dengan kartu produk yang berulang.

Contoh penggunaan:

- Netflix Premium
  - 1 Hari — Rp3.000
  - 3 Hari — Rp6.000
  - 7 Hari — Rp12.000
  - 2 User 1 Profil — Rp17.000
  - 1 User 1 Profil — Rp27.000
  - Private 1 Bulan — Rp110.000

Di katalog hanya ada **satu kartu Netflix**. Jika harga varian berbeda, kartu menampilkan rentang seperti `Rp3.000 – Rp110.000`. Pelanggan membuka produk lalu memilih varian yang tersedia.

## Fitur varian V27

Setiap varian mempunyai:

- nama varian;
- deskripsi/subtitle;
- harga jual;
- harga coret opsional;
- stok sendiri;
- `-1` untuk stok tanpa batas pada produk stok manual;
- badge seperti `Terlaris`, `Hemat 13%`, atau `Promo`;
- urutan tampil;
- status aktif/nonaktif.

Varian stok `0` otomatis tampil pudar dan tidak dapat dipilih. Varian dengan stok tersedia dapat dipilih dan harga checkout dihitung dari varian tersebut.

## Admin

Masuk ke:

`Panel Admin → Produk → Varian`

Dari sana admin dapat:

- menambah varian;
- edit varian;
- aktif/nonaktifkan varian;
- mengubah harga;
- mengatur harga coret;
- mengatur badge;
- mengatur urutan;
- tambah/kurangi/set stok per varian;
- menghapus varian yang belum pernah digunakan.

Jika varian sudah mempunyai histori order atau inventory, tombol hapus akan menonaktifkannya agar histori lama tetap aman.

Untuk produk **Inventory Otomatis**, stok varian diambil dari jumlah item inventory yang tersedia. Saat menambah inventory, admin memilih produk sekaligus variannya.

## Checkout dan stock safety

Cart dan checkout menyimpan `variantId`. Backend tidak mempercayai harga dari browser. Saat checkout server akan:

1. mengambil produk;
2. mengambil varian aktif;
3. memastikan varian memang milik produk tersebut;
4. membaca harga varian langsung dari PostgreSQL;
5. mengecek stok;
6. mengurangi stok varian secara atomik untuk produk manual;
7. menyimpan nama/id varian ke order;
8. mengembalikan stok varian jika order kedaluwarsa/dibatalkan/gagal.

Produk lama yang belum punya varian tetap bekerja seperti sebelumnya.

## Deployment

V27 tetap menggunakan:

- Vercel;
- Neon/PostgreSQL;
- Midtrans/manual QRIS/transfer/saldo sesuai pengaturan;
- Environment Variables yang sama dengan V26.

Tidak perlu membuat database baru. Migration aman akan membuat tabel `product_variants` dan menambah kolom variant yang dibutuhkan secara otomatis pada database lama.

Lihat `TUTORIAL-VARIAN-V27.md` dan `MULAI-DARI-SINI.txt`.
