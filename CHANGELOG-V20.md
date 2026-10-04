# Changelog V20 — Kembali ke Vercel

Tanggal: 4 Oktober 2026

## Hosting

- Project dikembalikan sepenuhnya dari Cloudflare Workers ke Vercel.
- `wrangler.jsonc`, Worker router, dan konfigurasi Cloudflare tidak dipakai lagi.
- Static frontend berada langsung di root project Vercel.
- API menggunakan Vercel Serverless Functions di folder `api/`.
- Menambahkan `vercel.json` dengan function duration dan security headers.

## Database

- Tetap menggunakan PostgreSQL/Neon agar data lama dapat dipertahankan.
- Driver runtime diganti kembali ke `pg`, cocok untuk Vercel Node.js Functions.
- Connection pool disimpan di `globalThis` agar warm invocation dapat reuse koneksi dengan batas pool kecil.
- Mendukung `DATABASE_URL` atau `POSTGRES_URL`.

## Payment

- Midtrans Snap dipertahankan sebagai gateway utama.
- Production memakai `MIDTRANS_SERVER_KEY` + `MIDTRANS_IS_PRODUCTION=true`.
- Webhook tetap di `/api/payment-webhook`.
- Sistem payment attempt P1/P2/P3 tetap dipertahankan untuk menghindari duplicate Midtrans order ID saat retry.
- Tombol sinkronisasi/cek status Midtrans tetap tersedia.

## Thumbnail / branding produk

- Netflix: N merah khas streaming dengan tema hitam-merah.
- Google AI Pro: G multicolor dan AI sparkle.
- YouTube Premium: tombol play merah-putih.
- Facebook Stars 6.400 / 12.800 / 19.200: Facebook blue + gold stars dengan badge jumlah masing-masing.
- Unblock IMEI: smartphone dengan unlock icon.
- Upload thumbnail custom dari Panel Admin tetap tersedia dan akan meng-override default thumbnail.

## Fitur yang dipertahankan

- Login/register customer dan admin.
- Dashboard customer/admin.
- Cart, checkout, order detail, invoice.
- Stok manual + inventory otomatis.
- Upload thumbnail JPG/PNG/WebP.
- Top Up manual via credential terenkripsi.
- Light/Dark/System theme.
- Responsive mobile/desktop.
- Featured products, best seller, member status, promo banner, audit log.
