# Hasil Pengujian Uply Digital V10

## Lulus — syntax
- `app.js`
- `api/uply.js`
- `api/health.js`
- `api/payment-webhook.js`
- seluruh file `lib/*.js`

Semua diperiksa menggunakan `node --check`.

## Lulus — checkout regression
- Tombol detail menggunakan `data-view-product`.
- Form checkout menggunakan `data-product-id`.
- Tidak ada lagi click selector umum `[data-product]`.
- Event checkout memakai listener document sehingga tombol di modal tetap bekerja.
- Input Nama/WhatsApp/Bank/Quantity tidak lagi memenuhi selector tombol detail produk.

## Lulus — invoice
- Invoice UI tersedia setelah pembayaran dikirim/status review/processing/completed.
- Tombol Cetak / Simpan PDF tersedia.
- API mengirim timestamp payment submitted, verified, processing, completed.
- Upload bukti manual mencatat `payment_submitted_at`.
- Verifikasi admin mencatat pembayaran/proses/selesai.
- Midtrans webhook mencatat pembayaran terverifikasi dan processing.
- Auto inventory mencatat completed timestamp.

## Catatan pengujian nyata
Koneksi produksi ke akun Vercel, Neon/PostgreSQL, Midtrans, email, dan browser pelanggan tetap harus diuji pada deployment milik pengguna karena kredensial production tidak tersedia di environment pengembangan ini.
