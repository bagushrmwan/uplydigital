# Uply Digital V31.6

## BeliBayar QRIS + Virtual Account
- QRIS BeliBayar tidak lagi membuka gambar provider sebagai halaman utama.
- QRIS tampil langsung di halaman detail pesanan dengan nominal, countdown, cek status, dan tombol layar penuh opsional.
- Checkout BeliBayar sekarang dapat menampilkan Virtual Account bank yang benar-benar aktif pada merchant.
- Daftar bank diambil server-to-server dari `GET /direct/v1/channels`.
- Virtual Account mendukung channel bank aktif dari: BCA, BNI, BRI, Mandiri, Permata, BSI, Muamalat, CIMB, Sinarmas, BNC, dan Maybank.
- Nomor VA ditampilkan di halaman order dengan tombol Salin Nomor.
- QRIS maupun VA memakai webhook/status sync yang sama.
- QRIS Manual tetap terpisah dan dapat dinonaktifkan dari Admin.

## Keamanan
- API Key/Secret BeliBayar tetap hanya berada di Windows backend.
- Browser tidak pernah menerima BeliBayar secret.
- Channel VA divalidasi terhadap channel aktif merchant sebelum checkout.
- Windows backend tetap menggunakan static IP whitelist.

## Upgrade
1. Update Windows backend ke V31.6.
2. Update Vercel ke V31.6.
3. Tidak ada Environment Variable baru.
4. Jangan timpa `.env` Windows.
