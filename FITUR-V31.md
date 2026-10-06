# Fitur Uply Digital V31

## BeliBayar Production via Windows Backend

V31 memindahkan seluruh credential BeliBayar dari Vercel ke Windows Server dengan reserved public IP.

Alur:

```text
Customer -> Vercel Uply Digital -> HTTPS Windows Backend -> BeliBayar
BeliBayar -> Windows Webhook -> signed relay -> Vercel -> Neon order status
```

### Yang tetap bisa ON/OFF dari Admin
- Midtrans otomatis
- BeliBayar otomatis
- Duitku otomatis
- Transfer / QRIS manual
- Saldo Uply

BeliBayar hanya muncul di checkout bila `BELIBAYAR_BACKEND_READY=true` dan toggle Admin ON.

## QRIS BeliBayar
- QR dinamis tampil langsung di detail order.
- Reference dibuat dari gateway attempt order.
- Status dapat disinkronkan otomatis setiap ±7 detik saat customer membuka detail order.
- Webhook Windows meneruskan event yang sudah diverifikasi ke Vercel melalui `/api/belibayar-relay`.
- Order berubah ke `processing` atau `completed` sesuai fulfillment mode.

## Security
- `BELIBAYAR_API_KEY`, `BELIBAYAR_SECRET_KEY`, `BELIBAYAR_WEBHOOK_SECRET` hanya berada di Windows backend.
- Vercel hanya menyimpan `BELIBAYAR_BACKEND_URL`, `BELIBAYAR_BACKEND_KEY`, dan `UPLY_RELAY_KEY`.
- Port Node 3000 tetap localhost; trafik publik melewati Caddy HTTPS.
- Relay memakai header `X-Uply-Relay-Key` dan idempotency `reference + transaction_id + status`.
