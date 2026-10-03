# Uply Digital V11 — Responsive Desktop + Mobile

Versi V11 mengembangkan V10 menjadi UI adaptif dengan pengalaman desktop dan mobile yang sengaja dibedakan, tetapi tetap dalam **satu codebase** agar mudah dirawat dan otomatis menyesuaikan perangkat.

## Desktop experience
- Navigasi penuh dan brand Uply Digital.
- Hero besar dengan featured products.
- Grid produk 4/3/2 kolom mengikuti lebar layar.
- Customer Dashboard dengan sidebar dan statistik.
- Checkout dua kolom.
- Admin dashboard untuk layar lebar.

## Mobile experience
- Nama Uply Digital tetap terlihat di header.
- Bottom navigation fixed.
- Produk card horizontal satu kolom.
- Dashboard pelanggan berbasis card.
- Checkout single-column dengan input touch-friendly.
- Admin navigation horizontal-scroll.
- Invoice responsif.

## Backend
Backend tetap Vercel Native + PostgreSQL seperti V10. Tidak ada Google Apps Script.

Environment Variables lama tetap dipakai:
- DATABASE_URL
- ADMIN_EMAIL
- ADMIN_PASSWORD
- SESSION_SECRET
- PAYMENT_MODE
- SITE_URL
- MIDTRANS_SERVER_KEY (jika Midtrans aktif)
- MIDTRANS_IS_PRODUCTION
- RESEND_API_KEY (opsional)
- EMAIL_FROM (opsional)

## Deployment
Replace semua file repository GitHub dengan V11, commit ke `main`, dan tunggu Vercel membuat Production Deployment.
