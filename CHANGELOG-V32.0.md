# Uply Digital V32.0

## Checkout payment-state fix
- Memperbaiki bug ketika percobaan VA gagal lalu user mengganti ke QRIS tetapi order lama VA dikembalikan oleh idempotency requestId.
- requestId checkout sekarang terikat pada fingerprint pilihan pembayaran. Mengubah gateway, QRIS/VA, bank, qty, saldo, atau rekening mereset attempt lama.
- Radio bank VA dinonaktifkan saat QRIS dipilih sehingga channel VA tersembunyi tidak ikut terkirim lewat FormData.
- Payload QRIS selalu dinormalisasi tanpa paymentChannel VA.
- Jika createOrder mengalami false error setelah DB sebenarnya commit, frontend mencoba memulihkan order berdasarkan requestId sebelum menampilkan error.
- Endpoint checkoutRequestStatus ditambahkan untuk recovery aman.
- Seluruh perbaikan V31.9 tetap dipertahankan.
