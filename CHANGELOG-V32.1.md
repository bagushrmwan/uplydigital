# Uply Digital V32.1

- Email transaksi Brevo sekarang dikirim melalui Windows backend dengan static public IP.
- BREVO_API_KEY tidak perlu disimpan di Vercel.
- Endpoint Vercel memanggil `/api/email/send` di Windows menggunakan `BELIBAYAR_BACKEND_KEY`.
- `/api/health` menampilkan status runtime email relay dan static egress.
- Semua fitur V32.0 tetap dipertahankan.
