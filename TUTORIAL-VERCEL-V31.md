# Tutorial V31 — Hubungkan Vercel ke Windows BeliBayar Production

## A. Environment Variables di Vercel

Jangan masukkan API Key/Secret BeliBayar ke Vercel. Tambahkan:

```env
BELIBAYAR_BACKEND_URL=https://uplyapi.duckdns.org
BELIBAYAR_BACKEND_KEY=ISI_NILAI_UPLY_BACKEND_KEY_DARI_WINDOWS
BELIBAYAR_BACKEND_READY=true
UPLY_RELAY_KEY=BUAT_SECRET_64_KARAKTER
```

`BELIBAYAR_BACKEND_KEY` harus sama dengan `UPLY_BACKEND_KEY` pada `C:\uply-backend\.env`.

`UPLY_RELAY_KEY` harus sama di Vercel dan Windows. Buat di Windows:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## B. Environment Variables Windows Backend

Tambahkan ke `C:\uply-backend\.env`:

```env
UPLY_RELAY_URL=https://DOMAIN-VERCEL-KAMU/api/belibayar-relay
UPLY_RELAY_KEY=SECRET_YANG_SAMA_DENGAN_VERCEL
```

Credential BeliBayar Live tetap berada di Windows seperti setup yang sudah berhasil.

## C. Update Windows Backend

Gunakan paket `Uply-BeliBayar-Windows-Backend-V31.zip` yang disertakan terpisah. Replace `server.js`, jalankan `npm install`, lalu restart Node.

Callback BeliBayar tetap:

```text
https://uplyapi.duckdns.org/api/belibayar-webhook
```

Whitelist tetap reserved IP Windows:

```text
168.110.211.159
```

## D. Deploy V31 ke Vercel

1. Backup project lama.
2. Replace source dengan folder V31.
3. Tambahkan 4 env V31 di atas.
4. Deploy production.
5. Buka `/api/health`, pastikan `version` = `31.0` dan `payment.gateways.belibayar.ready` = `true`.
6. Admin -> Pembayaran & Toko -> aktifkan `BeliBayar otomatis`.

## E. Tes end-to-end

1. Checkout produk nominal kecil.
2. Pilih BeliBayar.
3. QRIS harus muncul di detail order.
4. Bayar QR.
5. Windows harus menerima webhook dan relay ke Vercel.
6. Status order otomatis berubah dari `pending_payment` menjadi `processing`/`completed`.
7. Tombol `Cek status pembayaran` tetap dapat dipakai sebagai fallback.

## Penting

- Jangan buka port 3000 ke publik.
- Jangan taruh API Key/Secret BeliBayar di frontend/Vercel.
- Jangan commit `.env`.
- Caddy harus tetap reverse proxy ke `127.0.0.1:3000`.
