# Uply Digital V27.1 — Safe Product Delete

- Tombol **Hapus** pada Admin → Produk.
- Produk tanpa order/inventory dihapus permanen beserta variannya.
- Produk yang sudah memiliki order/inventory otomatis diarsipkan agar riwayat transaksi tetap aman.
- Produk arsip hilang dari storefront tetapi tetap terlihat di Admin.
- Tombol **Pulihkan** untuk mengaktifkan kembali produk arsip.
- Audit log untuk `product_archived`, `product_deleted`, dan `product_restored`.
- UI konfirmasi hapus dibuat ramah mobile.
- Tidak membutuhkan database baru atau migration tambahan.
