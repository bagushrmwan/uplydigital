# Hasil Pengujian Uply Digital V14

Pengecekan lokal yang dilakukan:

- PASS — `node --check` untuk `app.js`, semua `api/*.js`, dan semua `lib/*.js`.
- PASS — mock Midtrans Snap request berhasil.
- PASS — mock Midtrans Get Status berhasil dan diklasifikasikan `success`.
- PASS — request Snap otomatis membawa `X-Override-Notification` ke `/api/payment-webhook`.
- PASS — callback Midtrans kembali ke order lokal Uply Digital.
- PASS — seluruh action API yang dipanggil frontend memiliki handler backend.
- PASS — `syncPaymentStatus` tersedia sebagai fallback jika webhook terlambat/gagal.
- PASS — payment event mempunyai `processed_at`; event gagal tidak dianggap selesai permanen.
- PASS — gateway order ID/attempt memiliki migration non-destruktif.
- PASS — stock adjustment API mendukung add / subtract / set dengan validasi.
- PASS — stok manual checkout direservasi dengan transaksi PostgreSQL + row lock.
- PASS — Inventory API menolak produk yang memakai stok manual dan memberi pesan yang jelas.
- PASS — Top Up tetap manual dan credential flow V13 tetap dipertahankan.

Belum dapat dites tanpa kredensial/layanan milik pengguna:
- transaksi Midtrans Sandbox nyata,
- webhook Midtrans nyata ke domain Vercel,
- koneksi PostgreSQL/Neon Production,
- email Resend nyata.

Test produksi yang disarankan:
1. `/api/health`
2. Tambah stok manual dari Admin → Produk
3. Checkout 1 produk dengan stok terbatas
4. Midtrans Sandbox sukses
5. Pastikan order berubah `processing` / `completed`
6. Test tombol `Cek status pembayaran`
7. Test Midtrans expire/cancel dan pastikan stok manual kembali
