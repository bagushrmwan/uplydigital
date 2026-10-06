# Uply Digital V30 — Multi Payment Gateway

## Perubahan utama

- Sistem pembayaran otomatis tidak lagi Midtrans-only.
- Provider otomatis yang tersedia: **Midtrans**, **BeliBayar**, dan **Duitku**.
- Admin dapat menyalakan/mematikan setiap provider secara terpisah dari **Admin → Pembayaran & Toko**.
- Gateway hanya muncul di checkout jika **toggle aktif** dan **credential/config server terdeteksi siap**.
- Transfer bank manual, QRIS manual, dan Saldo Uply tetap tersedia dan dapat dinyalakan/dimatikan.
- Payment Monitor sekarang dapat melakukan sync untuk semua gateway otomatis.
- Status sukses dari webhook/status API masuk ke alur order yang sama: verifikasi → processing → auto fulfillment bila produk memakai inventory otomatis.
- Pembayaran gagal/expired membatalkan order yang belum diproses dan mengembalikan reservasi stok/saldo sesuai mekanisme V29.
- Pembayaran terlambat setelah order cancelled masuk status `review` agar tidak otomatis mengirim stok.

## Endpoint webhook

- Midtrans: `/api/payment-webhook`
- BeliBayar: `/api/belibayar-webhook`
- Duitku: `/api/duitku-webhook`

## Catatan BeliBayar

BeliBayar Direct API memerlukan IP whitelist. Pada Vercel dengan outbound IP dinamis, BeliBayar tidak disarankan diaktifkan untuk production sebelum memakai Static IP/egress tetap atau backend/proxy dengan public IP statis.

## Keamanan

API key, secret key, server key, dan webhook secret tidak disimpan di browser ataupun database pengaturan admin. Semua credential berasal dari Vercel Environment Variables.
