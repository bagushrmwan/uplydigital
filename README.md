# Uply Digital V9 — Vercel Native

Versi V9 adalah project lengkap untuk Vercel + PostgreSQL/Neon. Tidak membutuhkan Google Apps Script.

## Perubahan utama V9

- Logo website menggunakan logo Uply Digital lama (`assets/logo-uply-digital.png`).
- Bagian teknis di homepage dihapus dan diganti copy brand yang lebih cocok untuk pelanggan.
- Homepage ditambah trust badges dan section "Kenapa Uply Digital?".
- Inventory utama sekarang ditambahkan **satu per satu** dari Panel Admin.
- Inventory memiliki kolom catatan internal dan status Tersedia / Nonaktif / Terkirim.
- Bulk import tetap tersedia sebagai fitur sekunder.
- Panel Admin ditambah:
  - statistik omzet, order, pelanggan, produk aktif, inventory;
  - quick actions;
  - alert stok rendah;
  - aktivitas terbaru;
  - pencarian & filter order;
  - pencarian pelanggan;
  - filter inventory;
  - daftar inventory per item dengan tombol salin;
  - aktif/nonaktif inventory yang belum terkirim.
- Auth, checkout, pembayaran manual, Midtrans, webhook, dan auto-delivery tetap dipertahankan.

## Upload ke Vercel

Upload folder project dengan struktur root seperti ini:

```
index.html
app.js
styles.css
package.json
vercel.json
api/
lib/
assets/
```

Jangan upload folder pembungkus satu tingkat di atas project.

## Environment Variables minimum

```
DATABASE_URL=postgresql://...
ADMIN_EMAIL=email-admin-kamu
ADMIN_PASSWORD=password-baru-minimal-8-karakter
SESSION_SECRET=string-random-minimal-32-karakter
PAYMENT_MODE=manual
SITE_URL=https://domain-kamu.vercel.app
```

Untuk Midtrans Sandbox:

```
PAYMENT_MODE=midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_IS_PRODUCTION=false
```

Notification URL Midtrans:

```
https://DOMAIN-KAMU/api/payment-webhook
```

Setelah mengubah Environment Variables, lakukan **Redeploy**.

## Health check

Buka:

```
https://DOMAIN-KAMU/api/health
```

Target respons:

```json
{
  "ok": true,
  "backend": "connected",
  "database": "connected",
  "paymentMode": "manual"
}
```

## Login admin

Buka:

```
https://DOMAIN-KAMU/#admin
```

Gunakan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari Environment Variables Vercel.

## Inventory satu per satu

Panel Admin → Inventory → Tambah inventory.

Isi:
- Produk
- Kode / link / detail akun
- Catatan internal (opsional)
- Status: Tersedia atau Nonaktif

Klik **Tambah 1 Item**.

Untuk produk yang ingin otomatis dikirim setelah pembayaran berhasil, edit produk lalu pilih **Mode pengiriman → Inventory otomatis**.

## Catatan keamanan

- Jangan taruh `DATABASE_URL`, `SESSION_SECRET`, `MIDTRANS_SERVER_KEY`, atau password admin di frontend.
- Ganti password admin yang pernah terlihat di screenshot/chat.
- Gunakan Midtrans Sandbox sebelum Production.
- Inventory dapat berisi data sensitif produk; akses hanya melalui akun admin.


## Perbaikan V9
- Checkout pelanggan diperkuat dan memberi pesan error yang jelas.
- Setelah login/daftar dari tombol checkout, pelanggan otomatis kembali ke checkout produk yang dipilih.
- Header memakai logo mark lama + teks “Uply Digital”.
- Inventory satu-per-satu dan fitur admin V8 tetap dipertahankan.
