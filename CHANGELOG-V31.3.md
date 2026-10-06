# Changelog V31.3

- Memperbaiki QRIS Manual yang masih terlihat di checkout saat toggle OFF.
- Panel QRIS/transfer manual sekarang hanya dirender jika metode tersebut benar-benar tersedia.
- Menambahkan `[hidden]{display:none!important}` untuk mencegah subpanel tersembunyi tampil karena CSS.
- Memperbaiki toast checkout yang sebelumnya selalu menulis "Midtrans error".
- Error pembayaran sekarang memakai nama gateway yang benar dan pesan yang dapat dibaca.
- Menambahkan runtime probe BeliBayar untuk memvalidasi `BELIBAYAR_BACKEND_KEY` Vercel terhadap Windows backend.
- `/api/health` menampilkan `runtimeConnected`, `backendAuth`, `backendHttpStatus`, dan `runtimeMessage` untuk BeliBayar.
- Checkout preflight menolak BeliBayar sebelum order dibuat jika backend Windows/key tidak benar, sehingga tidak membuat order error yang tidak perlu.
