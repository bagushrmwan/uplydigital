# Uply Digital V31.9

- Memperbaiki checkout HTTP 500 PostgreSQL `40P01 deadlock detected`.
- Schema bootstrap sekarang memakai PostgreSQL transaction advisory lock sehingga cold-start Vercel terserialisasi.
- Retry otomatis maksimal 3 kali khusus `40P01` untuk masa transisi deployment.
- Mempertahankan seluruh perbaikan pembayaran dan UI dari V31.8.
- Windows BeliBayar backend tidak perlu diubah.
