# Uply Digital V21 — Vercel Marketplace Redesign

Versi ini adalah kelanjutan V20 untuk Vercel dengan redesign storefront lengkap. Backend tetap menggunakan Vercel Serverless Functions + PostgreSQL/Neon.

## Deploy
1. Upload seluruh isi folder/repository ke GitHub.
2. Import project ke Vercel.
3. Pastikan Root Directory adalah root project.
4. Tambahkan Environment Variables seperti V20.
5. Deploy.

## Environment Variables
- DATABASE_URL
- SESSION_SECRET
- CREDENTIAL_ENCRYPTION_KEY
- ADMIN_EMAIL
- ADMIN_PASSWORD
- PAYMENT_MODE
- MIDTRANS_SERVER_KEY (jika Midtrans dipakai)
- MIDTRANS_IS_PRODUCTION
- SITE_URL
- ALLOWED_ORIGIN

## File UI utama
- index.html
- styles.css
- market.css (redesign V21)
- app.js

## Fitur yang dipertahankan
Login customer/admin, catalog, cart, checkout, dashboard, order, invoice, admin stock, inventory, upload thumbnail, theme, PostgreSQL/Neon, dan payment backend V20.
