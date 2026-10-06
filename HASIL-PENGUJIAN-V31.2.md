# Hasil Pengujian Uply Digital V31.2

- `npm run check`: PASS
- `npm run test:smoke`: PASS
- Setting `qrisManualPaymentEnabled` tersedia di database/API/admin: PASS
- QRIS Manual terpisah dari Transfer Bank Manual: PASS
- Menonaktifkan QRIS Manual tidak menghapus image QRIS: PASS (setting hanya mengatur availability checkout)
- Health API versi `31.2`: PASS
- Semantic Light/Dark contrast patch terpasang: PASS
- Hero text dipaksa high-contrast pada gradient biru: PASS
- ZIP integrity: akan diverifikasi setelah packaging.
