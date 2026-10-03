# Uply Digital V13 — Vercel Native

Versi V13 fokus pada katalog visual, proses Top Up manual yang lebih aman, dan fitur pertumbuhan toko.

## Environment Variables
Wajib: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SITE_URL`.
Untuk Top Up via login tambahkan `CREDENTIAL_ENCRYPTION_KEY` minimal 32 karakter sebagai **Secret**.
Midtrans tetap menggunakan `PAYMENT_MODE`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`.

## Top Up Manual
Kategori `Top Up` selalu diproses manual. Produk tersebut dapat meminta email + password akun tujuan pada checkout. Credential terenkripsi AES-256-GCM, tidak dikirim ke pelanggan lain, tidak dicatat plaintext dalam audit, dan dihapus ketika order selesai atau dibatalkan. Jangan meminta OTP/recovery code/2FA. Utamakan OAuth/API resmi bila penyedia mendukungnya.

## Thumbnail
Setiap produk memiliki `thumbnail_url`. Admin dapat mengganti path internal seperti `/assets/products/netflix.svg` atau URL HTTPS sendiri.

## Growth features
- Featured products
- Best seller badge dari completed orders
- Promo banner homepage
- Low-stock alert
- Order funnel admin
- Dashboard pelanggan, invoice, theme terang/gelap/system, responsive desktop/mobile
