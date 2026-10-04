# Tutorial Deploy Uply Digital V20 ke Vercel

## 1. Siapkan file

Extract `Uply-Digital-V20-Vercel-READY.zip`. Root project harus langsung berisi:

```text
index.html
app.js
styles.css
package.json
vercel.json
api/
lib/
assets/
```

Jangan membuat folder project dobel di repository.

## 2. Upload ke GitHub

Buat repository baru, misalnya `uply-digital`, lalu upload seluruh isi folder V20 ke branch `main`.

Alternatif: gunakan Vercel CLI dengan `npx vercel`, tetapi GitHub import biasanya paling mudah untuk update berikutnya.

## 3. Import di Vercel

1. Login Vercel.
2. Klik **Add New → Project**.
3. Import repository `uply-digital`.
4. Framework Preset: **Other**.
5. Root Directory: biarkan root repository.
6. Build Command: kosong / default.
7. Output Directory: kosong / default.
8. Jangan deploy dulu jika ingin mengisi Environment Variables dari layar setup; atau deploy sekali lalu isi dari Settings.

## 4. Database Neon PostgreSQL

V20 tidak memakai Cloudflare D1. Gunakan PostgreSQL, misalnya Neon.

Di Neon:

1. Buat project/database.
2. Klik **Connect**.
3. Pilih **Pooled connection** bila tersedia.
4. Copy connection string yang bentuknya seperti:

```text
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

Di Vercel buka:

**Project → Settings → Environment Variables**

Tambahkan sebagai Secret:

```text
DATABASE_URL=postgresql://...
```

Jangan tambahkan tanda petik di value.

## 5. Buat SESSION_SECRET

Di CMD/PowerShell Windows:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy hasilnya ke:

```text
SESSION_SECRET
```

Jalankan perintah sekali lagi dan gunakan hasil berbeda untuk:

```text
CREDENTIAL_ENCRYPTION_KEY
```

## 6. Admin

Tambahkan:

```text
ADMIN_EMAIL=email-admin-kamu
ADMIN_PASSWORD=password-admin-yang-kuat
```

## 7. Midtrans Production

Tambahkan:

```text
PAYMENT_MODE=midtrans
MIDTRANS_SERVER_KEY=Mid-server-xxxxxxxxxxxxxxxx
MIDTRANS_IS_PRODUCTION=true
```

Gunakan **Server Key Production**, bukan `SB-Mid-server-...`.

V20 memakai Snap redirect URL, sehingga `MIDTRANS_CLIENT_KEY` tidak wajib untuk flow checkout ini.

## 8. Domain Vercel

Setelah deployment berhasil, misalnya domain kamu:

```text
https://uply-digital.vercel.app
```

Tambahkan:

```text
SITE_URL=https://uply-digital.vercel.app
ALLOWED_ORIGIN=https://uply-digital.vercel.app
```

Gunakan domain production yang benar, tanpa slash `/` di akhir.

## 9. Redeploy

Setelah Environment Variables selesai:

**Vercel → Deployments → deployment terbaru → menu tiga titik → Redeploy**

Atau push commit baru ke branch `main`.

## 10. Health check

Buka:

```text
https://DOMAIN-KAMU/api/health
```

Target:

```json
{
  "ok": true,
  "backend": "connected",
  "database": "connected",
  "hosting": "vercel",
  "payment": {
    "mode": "midtrans",
    "provider": "midtrans",
    "ready": true,
    "credentials": "configured",
    "keyEnvironment": "production",
    "environment": "production",
    "production": true
  }
}
```

Jika `mode` masih `manual`, cek `PAYMENT_MODE=midtrans` lalu redeploy.

Jika `credentials` menunjukkan `missing-or-mismatch`, pastikan Server Key Production diawali `Mid-server-` dan `MIDTRANS_IS_PRODUCTION=true`.

## 11. Webhook Midtrans

Di Dashboard Midtrans Production, isi Payment Notification URL:

```text
https://DOMAIN-KAMU/api/payment-webhook
```

Kemudian buat **order baru** untuk pengujian. Jangan memakai payment link dari deployment lama.

## 12. Thumbnail produk

Default thumbnail ada di:

```text
assets/products/netflix.svg
assets/products/google-ai.svg
assets/products/youtube.svg
assets/products/stars-6400.svg
assets/products/stars-12800.svg
assets/products/stars-19200.svg
assets/products/imei.svg
```

Jika ingin gambar sendiri, masuk ke **Panel Admin → Produk → Edit Produk → Upload Thumbnail**.

## 13. Stock

Produk stok manual:

**Admin → Produk → Atur Stok → Tambah / Kurangi / Set stok**.

Produk fulfillment `inventory`:

**Admin → Inventory → Tambah item inventory**.

Top Up tetap diproses manual dan dapat meminta email/password akun tujuan yang disimpan terenkripsi. Jangan pernah meminta OTP, recovery code, PIN, atau kode 2FA.
