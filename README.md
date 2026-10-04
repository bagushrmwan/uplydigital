# Uply Digital V20 — Vercel + Neon PostgreSQL + Midtrans Production

V20 adalah build penuh Uply Digital yang dikembalikan ke **Vercel**. Semua konfigurasi Cloudflare/Wrangler sudah dihapus. Frontend, API serverless, database PostgreSQL/Neon, Midtrans Snap Production, dashboard pelanggan/admin, stok, inventory, upload thumbnail, invoice, dan tema responsive tetap tersedia.

## Struktur

- `index.html`, `app.js`, `styles.css` — storefront responsive.
- `assets/` — logo Uply Digital dan thumbnail produk.
- `api/uply.js` — API utama auth, katalog, order, admin, stok, inventory.
- `api/health.js` — health check database + payment.
- `api/payment-webhook.js` — webhook Midtrans.
- `api/product-image.js` — thumbnail yang di-upload admin.
- `lib/db.js` — PostgreSQL pool untuk Vercel/Neon.
- `lib/midtrans.js` — Midtrans Snap Production/Sandbox switch.
- `lib/security.js` — session + enkripsi credential Top Up.
- `lib/payment-state.js` — sinkronisasi status pembayaran.
- `vercel.json` — konfigurasi Vercel Functions dan security headers.

## Thumbnail produk V20

Default thumbnail sudah diganti agar identitas visualnya sesuai produk:

- Netflix: visual N merah dan tema hitam/merah.
- Google AI Pro: visual G multicolor + AI sparkle.
- YouTube Premium: tombol play merah/putih.
- Facebook Stars: visual Facebook biru + bintang emas, berbeda untuk 6.400 / 12.800 / 19.200 Stars.
- Unblock IMEI: smartphone + ikon unlock/IMEI.

Admin tetap dapat menimpa thumbnail default melalui **Admin → Produk → Edit → Upload Thumbnail** (JPG/PNG/WebP).

## Environment Variables wajib

```text
DATABASE_URL
SESSION_SECRET
CREDENTIAL_ENCRYPTION_KEY
ADMIN_EMAIL
ADMIN_PASSWORD
PAYMENT_MODE=midtrans
MIDTRANS_SERVER_KEY
MIDTRANS_IS_PRODUCTION=true
SITE_URL
ALLOWED_ORIGIN
```

Opsional untuk email:

```text
RESEND_API_KEY
EMAIL_FROM
```

## Midtrans webhook

Set Payment Notification URL di Midtrans Production ke:

```text
https://DOMAIN-VERCEL-KAMU/api/payment-webhook
```

## Health check

Setelah deployment:

```text
https://DOMAIN-VERCEL-KAMU/api/health
```

Target utama:

```json
{
  "ok": true,
  "backend": "connected",
  "database": "connected",
  "hosting": "vercel",
  "payment": {
    "mode": "midtrans",
    "ready": true,
    "environment": "production"
  }
}
```

Baca `TUTORIAL-VERCEL.md` untuk instalasi lengkap.
