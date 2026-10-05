# Uply Digital V26

Versi Vercel-ready dari Uply Digital dengan storefront marketplace, Business Suite, dan account management yang sudah dirapikan untuk mobile.

## Fokus V26

- Uply Digital blue/cyan identity pada storefront dan admin.
- Cart/CTA lebih terlihat dan konsisten.
- Halaman Kelola Akun lengkap.
- Edit nama/email/WhatsApp.
- Ubah password dengan verifikasi password lama.
- Logout akun dan logout semua perangkat.
- Mobile drawer berisi shortcut akun setelah login.
- Existing V25 Business Suite tetap dipertahankan: Voucher, Balance, Inventory, Reporting, Role, Notifications, Manual QRIS, Midtrans, Admin mobile order cards.

## Deploy

Project ini menggunakan Vercel Serverless Functions + PostgreSQL/Neon. Upload seluruh root project ke repository Vercel. Jangan mengubah Root Directory jika file `index.html`, `app.js`, `vercel.json`, `api/`, dan `lib/` sudah berada di root.

Environment Variables lama dari V25/V25.1 dapat digunakan kembali.

Setelah deploy buka `/api/health` dan pastikan version `26.0` serta database connected.
