# Changelog V31

- BeliBayar Vercel Direct API diganti menjadi Windows Backend Proxy.
- Credential BeliBayar tidak lagi diperlukan di Vercel.
- Tambah `/api/belibayar-relay` untuk webhook relay Windows -> Vercel.
- Tambah auto polling status payment pada halaman detail order otomatis.
- QRIS BeliBayar tetap tampil inline dari `qr_url`.
- Admin toggle BeliBayar tetap berfungsi.
- Gateway Health sekarang menjelaskan arsitektur static-IP Windows.
- `/api/health` menjadi version `31.0`.
- Tambah dokumentasi konfigurasi Windows/Vercel V31.
