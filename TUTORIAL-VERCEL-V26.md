# Tutorial Deploy Uply Digital V26 ke Vercel

## 1. Persiapan

Gunakan file ZIP V26, extract, lalu pastikan root project langsung berisi:

- `index.html`
- `app.js`
- `styles.css`
- `market.css`
- `vercel.json`
- `package.json`
- `api/`
- `lib/`
- `assets/`

Jangan upload folder pembungkus tambahan.

## 2. Upload ke repository

Replace seluruh isi repository Uply Digital lama dengan isi V26, lalu push ke branch yang terhubung ke Vercel (umumnya `main`).

## 3. Environment Variables

Gunakan kembali variable lama:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PAYMENT_MODE`
- `SITE_URL`
- `ALLOWED_ORIGIN`

Jika memakai Midtrans:

- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_IS_PRODUCTION=true`

Opsional email:

- `RESEND_API_KEY`
- `EMAIL_FROM`

## 4. Redeploy

Setelah commit masuk, tunggu deployment Production selesai. Jika Environment Variables baru diubah, lakukan Redeploy dari Vercel Dashboard.

## 5. Health check

Buka:

`https://DOMAIN-KAMU.vercel.app/api/health`

Pastikan respons menunjukkan:

- `backend: connected`
- `database: connected`
- `hosting: vercel`
- `version: 26.0`
- `checkoutSchemaReady: true`

## 6. Tes wajib setelah deploy

1. Login pelanggan.
2. Buka produk.
3. Pastikan tombol `+ Keranjang` berwarna biru dan terbaca jelas.
4. Tambah produk ke cart.
5. Tes quantity `- 1 +`.
6. Masuk checkout dan buat satu order test.
7. Buka `Kelola Akun`.
8. Ubah nama/WhatsApp lalu Simpan.
9. Tes ubah password.
10. Tes Logout dan Login kembali.
11. Login admin dan cek order dari HP.

## Database

V26 tidak meminta database baru. Gunakan `DATABASE_URL` Neon yang sama dengan versi sebelumnya. Tidak ada reset produk, customer, inventory, atau order.
