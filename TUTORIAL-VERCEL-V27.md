# Tutorial Deploy Uply Digital V27 ke Vercel

## 1. Backup database

Sebelum upgrade production, buat backup/snapshot database Neon. V27 memakai migration non-destruktif, tetapi backup tetap disarankan.

## 2. Upload file V27

Extract ZIP V27. Root repository harus langsung berisi:

- `index.html`
- `app.js`
- `styles.css`
- `market.css`
- `package.json`
- `vercel.json`
- `api/`
- `lib/`
- `assets/`

Replace isi repository lama dan push ke branch `main` atau branch production Vercel.

## 3. Environment Variables

V27 tidak membutuhkan Environment Variable baru untuk sistem varian.

Gunakan variable yang sudah ada:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PAYMENT_MODE`
- `MIDTRANS_SERVER_KEY` jika Midtrans dipakai
- `MIDTRANS_IS_PRODUCTION`
- `SITE_URL`
- `ALLOWED_ORIGIN`
- `RESEND_API_KEY` opsional
- `EMAIL_FROM` opsional

## 4. Redeploy

Setelah file dan Environment Variables benar, redeploy Production dari Vercel.

## 5. Health check

Buka:

`https://DOMAIN-KAMU.vercel.app/api/health`

Target utama:

```json
{
  "backend": "connected",
  "database": "connected",
  "hosting": "vercel",
  "version": "27.0",
  "checkoutSchemaReady": true,
  "variantSystemReady": true
}
```

## 6. Membuat varian

Login Admin → Produk → tombol `Varian (0)` → `+ Tambah Varian`.

Setelah varian dibuat, buka storefront dan tes satu pembelian.
