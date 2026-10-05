# Uply Digital V28 — Multi Image Product Gallery

## Fitur utama
- Satu produk sekarang punya thumbnail utama + hingga 12 gambar galeri.
- Galeri cocok untuk: Benefit, Cara Aktivasi, Claim Garansi, Garansi/Ketentuan, Tutorial, Informasi, dan Lainnya.
- Pelanggan dapat menggeser/pilih thumbnail kecil di halaman detail produk; gambar utama dan keterangannya langsung berubah.
- Galeri mobile menggunakan horizontal swipe agar tidak memenuhi layar.
- Admin: Produk → Galeri (N) → Tambah Gambar / Edit / Hapus.
- Setiap gambar dapat memiliki judul, caption, tipe, urutan tampil, aktif/nonaktif, URL/path, atau upload JPG/PNG/WebP.
- Upload per gambar maksimal ±1,3 MB.
- Thumbnail utama tetap terpisah, jadi gambar katalog tidak ikut berubah saat admin menambah tutorial/garansi.

## Database
V28 menambahkan tabel `product_media` secara otomatis dengan `CREATE TABLE IF NOT EXISTS`. Database Neon lama tetap digunakan dan data order/produk/customer lama tidak dihapus.

## Kompatibilitas
- Product Variant V27 tetap aktif.
- Safe delete V27.1 tetap aktif.
- Produk tanpa gambar galeri tetap berfungsi seperti sebelumnya.
- Jika produk dihapus permanen dengan aman, media galerinya ikut dibersihkan.
