# Uply Digital V31.5

## BeliBayar checkout hotfix
- Preflight sekarang memeriksa koneksi Windows -> BeliBayar Live melalui `/api/belibayar/diagnostic`.
- QRIS response dinormalisasi (`qr_url` -> `qrUrl`/`paymentUrl`) agar QR muncul di halaman order.
- `normalizedCreatedPayment` menerima snake_case dan camelCase.
- Health menampilkan `providerConnected` dan `apiOrigin` tanpa membocorkan credential.
- Cocok dengan Windows Backend V31.5 yang memaksa origin resmi `https://api.belibayar.id`.
