# Hasil Pengujian Uply Digital V31

Tanggal build: 2026-10-06

## Hasil

- `npm run check`: **PASS**
- `npm run test:smoke`: **PASS**
- `server.js` Windows Backend V31 `node --check`: **PASS**
- Endpoint Vercel relay `/api/belibayar-relay` tersedia: **PASS**
- BeliBayar Vercel menggunakan `BELIBAYAR_BACKEND_URL` + server key, bukan API secret langsung: **PASS**
- Toggle Admin BeliBayar tetap dipertahankan: **PASS**
- QR URL tetap dirender pada detail pesanan: **PASS**
- Auto polling pembayaran otomatis pada halaman detail order: **PASS**
- Tidak ada credential live pengguna yang dibundel ke artifact: **PASS**

## Catatan

Pengujian transaksi live telah dilakukan pengguna pada Windows backend sebelumnya dan berhasil sampai `paid`. V31 menambahkan bridge Vercel + webhook relay; setelah deploy, lakukan satu transaksi nominal kecil untuk validasi end-to-end database order Vercel/Neon.
