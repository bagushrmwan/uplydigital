# Uply Digital V31.8

## Perbaikan
- Memperbaiki false positive nominal BeliBayar: validasi memakai `base_amount` (nominal invoice sebelum biaya), bukan selalu `amount` (total yang dibayar pelanggan).
- Pesan nominal mismatch tidak lagi ditambahkan berulang kali.
- Warning mismatch lama dari bug V31.7 dibersihkan otomatis ketika sinkronisasi berikutnya valid.
- Tampilan pelanggan tidak lagi memakai istilah teknis `webhook/status sync`, `channel aktif merchant`, atau teks teknis serupa.
- Catatan order pelanggan dideduplikasi agar pesan yang sama hanya tampil sekali.
- Copy QRIS / Virtual Account dibuat lebih sederhana dan ramah pelanggan.
