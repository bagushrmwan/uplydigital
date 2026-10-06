# Uply Digital V31 — Windows BeliBayar Production Bridge

V31 melanjutkan seluruh fitur V30 dan menghubungkan BeliBayar Production ke Windows Server static IP.

## Highlight
- BeliBayar QRIS Production melalui `https://uplyapi.duckdns.org`.
- Reserved public IP whitelist tetap berada di Windows backend.
- Vercel tidak menyimpan credential BeliBayar.
- Webhook terverifikasi di Windows kemudian direlay secara aman ke Vercel/Neon.
- Auto status polling pada detail order sebagai fallback webhook.
- Midtrans / BeliBayar / Duitku / Manual / Saldo tetap dapat ON/OFF dari Admin.

Mulai dari `TUTORIAL-VERCEL-V31.md`.
