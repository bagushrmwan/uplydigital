# Uply Digital V13

- Thumbnail berbeda untuk setiap produk dan field thumbnail di Panel Admin.
- Produk kategori **Top Up** selalu diproses manual. Checkout meminta email + password akun tujuan jika produk membutuhkan login.
- Credential disimpan terenkripsi AES-256-GCM menggunakan `CREDENTIAL_ENCRYPTION_KEY`, tidak pernah masuk API publik/audit plaintext, dan otomatis dihapus saat order selesai/dibatalkan.
- Admin dapat membuka credential dari detail order melalui tombol **Lihat login akun**; setiap akses dicatat di audit log.
- Produk unggulan (`featured`) untuk homepage.
- Badge Terlaris berdasarkan jumlah order completed.
- Banner promo homepage dari Pengaturan Admin.
- Funnel order sederhana di dashboard admin (dibuat → terverifikasi → selesai).
- Thumbnail ikut tampil di card, detail produk, checkout, order, dan panel admin.
- Tetap mendukung Vercel, PostgreSQL/Neon, Midtrans, transfer manual, theme Light/Dark/System, desktop/mobile.
