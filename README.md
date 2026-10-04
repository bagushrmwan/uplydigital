# Uply Digital V16 — Netlify + Xendit

Full rebuild untuk Netlify Functions, PostgreSQL/Neon, Xendit Payment Session, dashboard pelanggan/admin, stok manual/inventory, upload thumbnail ke database, invoice, tema terang/gelap/system.

## Netlify
Import repository GitHub ke Netlify. Build command kosong, Publish directory `.`. Functions otomatis dari `netlify/functions`. Tambahkan environment variables dari `.env.example`, lalu deploy ulang.

## Xendit
Gunakan Secret API key production dan webhook verification token. Set webhook Payment Session ke `https://DOMAIN.netlify.app/api/payment-webhook`. Jangan menaruh Secret API key di frontend. IP allowlist Xendit bersifat opsional: jika daftar allowlist kosong, Xendit tidak memvalidasi source IP untuk API request.
