# Uply Digital V25.1 — Checkout & Mobile UI Hotfix

## Perbaikan utama

- Memperbaiki HTTP 500 setelah tombol **Lanjut ke Pembayaran**. Penyebab ditemukan di backend: setelah order berhasil disimpan, kode notifikasi admin memakai variabel `name` yang sudah keluar dari scope transaksi. Ini memicu `ReferenceError`, sehingga browser menerima HTTP 500 walaupun order sebenarnya sudah sempat dibuat. V25.1 menggunakan `order.name` yang valid.
- Menambahkan `checkoutPreflight` supaya stok, metode pembayaran, rekening, voucher, saldo, dan credential Top Up divalidasi sebelum order dibuat.
- Request ID checkout sekarang dipertahankan selama percobaan ulang pada form yang sama untuk mengurangi risiko order ganda jika jaringan gagal setelah server memproses order.
- Quantity pada detail produk diperbaiki: teks minus / angka / plus sekarang terlihat pada background putih.
- Quantity checkout diganti dari native select menjadi kontrol `− 1 +` agar konsisten di Safari/iPhone dan Android.
- Tombol mobile WhatsApp, Lihat Produk, cart, menu, dan bottom navigation memakai SVG icon, bukan karakter Unicode yang bisa tampil sebagai kotak.
- Thumbnail produk memiliki fallback otomatis ke thumbnail branded sesuai produk bila thumbnail upload/API gagal dimuat.
- `/api/health` sekarang melaporkan `version: 25.1` dan `checkoutSchemaReady`.
- Error backend sekarang mempunyai kode referensi `ERR-...` yang juga muncul di Vercel Logs tanpa membocorkan detail database ke pelanggan.

## Catatan setelah update
Percobaan checkout pada V25 sebelum hotfix mungkin sudah membuat order di database meskipun browser menampilkan HTTP 500. Periksa menu **Pesanan** dan batalkan order duplikat/pending yang tidak digunakan.
