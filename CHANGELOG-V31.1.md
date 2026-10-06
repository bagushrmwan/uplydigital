# Uply Digital V31.1

## Perbaikan Payment Gateway

- Memperjelas kontrol **ON/OFF** Midtrans, BeliBayar, dan Duitku di Admin → Pembayaran & Toko.
- Menambahkan status visual **AKTIF / SIAP · OFF / BELUM SIAP** untuk masing-masing gateway.
- BeliBayar yang sudah `configured=true` + `ready=true` akan **diaktifkan otomatis satu kali** saat V31.1 pertama dijalankan.
- Duitku juga memakai mekanisme auto-init satu kali ketika kredensialnya kelak sudah lengkap.
- Setelah auto-init pertama, keputusan ON/OFF admin tetap dipertahankan; cold start/redeploy berikutnya tidak menyalakan gateway kembali secara paksa.
- Checkout tetap hanya menampilkan gateway yang **Ready + Enabled**.

## Target kasus V31

Pada database lama, `belibayarPaymentEnabled` tersimpan `false` dari default versi sebelumnya. Akibatnya `/api/health` dapat menunjukkan BeliBayar `configured:true` dan `ready:true` tetapi `enabled:false`. V31.1 memperbaiki kondisi tersebut tanpa menghilangkan kemampuan admin untuk mematikan gateway.
