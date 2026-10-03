const $ = s => document.querySelector(s);
const app = $('#app');
const modal = $('#modal');
const modalBody = $('#modalBody');
const toast = $('#toast');

const money = n => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Number(n)||0);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt = v => new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta' }).format(new Date(v));
const truncate = (v, n=44) => String(v ?? '').length > n ? String(v).slice(0,n-1) + '…' : String(v ?? '');

const state = {
  token: localStorage.getItem('uply_token') || '',
  user: null,
  catalog: null,
  orders: [],
  admin: null,
  adminTab: 'overview',
  search: '',
  filter: 'Semua',
  adminOrderSearch: '',
  adminOrderStatus: 'all',
  customerSearch: '',
  inventoryProduct: 'all',
  inventoryStatus: 'all',
  pendingCheckout: ''
};

const statusLabel = {
  pending_payment: 'Menunggu pembayaran',
  review: 'Periksa pembayaran',
  processing: 'Sedang diproses',
  completed: 'Selesai',
  cancelled: 'Dibatalkan'
};

const inventoryStatusLabel = {
  available: 'Tersedia',
  delivered: 'Terkirim',
  disabled: 'Nonaktif'
};

function msg(message){
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(msg.t);
  msg.t = setTimeout(() => toast.hidden = true, 4600);
}

function openModal(title, html){
  modalBody.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="x" data-close aria-label="Tutup">✕</button></div><div class="modal-content">${html}</div>`;
  modal.showModal();
}
function closeModal(){ if (modal.open) modal.close(); }

modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
  if (e.target.closest('[data-close]')) closeModal();
});

function setAccount(){
  const b = $('#accountBtn');
  b.textContent = state.user ? (state.user.role === 'admin' ? 'Admin' : state.user.name.split(' ')[0]) : 'Masuk';
}

async function api(action, payload={}){
  const r = await fetch('/api/uply', {
    method:'POST',
    headers:{'Content-Type':'application/json', ...(state.token ? {'Authorization':'Bearer ' + state.token} : {})},
    body:JSON.stringify({action,payload})
  });
  const d = await r.json().catch(() => ({ok:false,error:`Server mengembalikan respons yang tidak valid (HTTP ${r.status}).`}));
  if (!r.ok || !d.ok) throw Error(d.error || `Permintaan gagal (HTTP ${r.status}).`);
  return d.data;
}

async function loadCatalog(){ state.catalog = await api('catalog'); }
async function restore(){
  if (!state.token) return;
  try { state.user = await api('me'); setAccount(); }
  catch { state.token=''; state.user=null; localStorage.removeItem('uply_token'); }
}

function icon(p){ return `<span class="mark">${({netflix:'N',youtube:'▶',ai:'✦',stars:'★'}[p.icon] || 'U')}</span>`; }
function status(s){ return `<span class="status ${esc(s)}">${esc(statusLabel[s] || s)}</span>`; }
function inventoryStatus(s){ return `<span class="status inv-${esc(s)}">${esc(inventoryStatusLabel[s] || s)}</span>`; }

function hero(){
  return `<section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <div class="eyebrow">Your Everyday Digital Store</div>
        <h1>Kebutuhan digital.<br><em>Lebih simpel.</em></h1>
        <p>Pilih produk, checkout, bayar, lalu pantau prosesnya langsung dari akun Uply Digital.</p>
        <div class="hero-actions"><a class="btn hero-cta" href="#produk">Lihat produk</a><a class="hero-link" href="#bantuan">Cara belanja →</a></div>
        <div class="trust-row">
          <span>✓ Proses jelas</span><span>✓ Pembayaran fleksibel</span><span>✓ Bantuan admin</span>
        </div>
      </div>
      <div class="hero-card brand-showcase">
        <img src="/assets/logo-uply-digital.png" alt="Uply Digital">
        <h3>Belanja digital, tanpa ribet.</h3>
        <p>Semua kebutuhan digital favoritmu dalam satu tempat dengan proses yang rapi, cepat, dan mudah dipantau.</p>
        <div class="mini-features">
          <span><b>01</b> Pilih produk</span>
          <span><b>02</b> Checkout mudah</span>
          <span><b>03</b> Pantau pesanan</span>
        </div>
      </div>
    </div>
  </section>`;
}

function productCards(){
  const arr = state.catalog.products.filter(p =>
    (state.filter === 'Semua' || p.category === state.filter) &&
    `${p.name} ${p.category} ${p.duration}`.toLowerCase().includes(state.search.toLowerCase())
  );
  if (!arr.length) return `<div class="empty" style="grid-column:1/-1">Produk tidak ditemukan.</div>`;
  return arr.map(p => `<article class="card">
    <div class="cover ${esc(p.icon)}">${icon(p)}<div><strong>${esc(p.duration)}</strong></div></div>
    <div class="card-body">
      <div class="meta"><span>${esc(p.category)}</span>${p.badge?`<span class="badge">${esc(p.badge)}</span>`:''}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description)}</p>
      <div class="stock-line">${p.stock===0?'<span class="stock-out">Stok habis</span>':p.stock>0&&p.stock<=3?`<span class="stock-low">Sisa ${p.stock}</span>`:'<span>Siap dipesan</span>'}</div>
      <div class="card-foot"><div class="price">${money(p.price)}<small> / ${esc(p.duration)}</small></div><button class="btn small" data-product="${esc(p.id)}" ${p.stock===0?'disabled':''}>Detail</button></div>
    </div>
  </article>`).join('');
}

function valueSection(){
  return `<section class="value-section"><div class="wrap"><div class="section-kicker">Kenapa Uply Digital?</div><div class="value-grid">
    <article><span>01</span><h3>Praktis</h3><p>Pilih produk dan selesaikan checkout tanpa alur yang berbelit.</p></article>
    <article><span>02</span><h3>Transparan</h3><p>Status pesanan bisa dipantau langsung dari akun pelanggan.</p></article>
    <article><span>03</span><h3>Siap membantu</h3><p>Kalau butuh bantuan, admin tetap tersedia untuk proses yang memerlukan pengecekan.</p></article>
  </div></div></section>`;
}

function catalogPage(){
  const cats = ['Semua', ...new Set(state.catalog.products.map(p=>p.category))];
  return hero() + `<section id="produk" class="section"><div class="wrap">
    <div class="section-head"><div><div class="section-kicker">Katalog</div><h2>Pilih kebutuhanmu</h2><p>${state.catalog.products.length} produk tersedia.</p></div><input id="search" class="search" placeholder="Cari produk…" value="${esc(state.search)}"></div>
    ${state.catalog.settings.notice?`<div class="notice">${esc(state.catalog.settings.notice)}</div>`:''}
    ${!state.catalog.settings.storeOpen?`<div class="notice warn">Toko sedang menutup pesanan baru.</div>`:''}
    <div class="chips">${cats.map(c=>`<button class="chip ${state.filter===c?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="grid" id="productGrid">${productCards()}</div>
  </div></section>` + valueSection();
}

function helpPage(){
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Bantuan</div><h1>Belanja lebih jelas.</h1><p>Pembayaran bisa transfer manual atau otomatis melalui Midtrans, tergantung pengaturan toko.</p></div>
  <div class="guide-grid">
    <div class="panel guide-card"><b>01</b><h3>Buat akun</h3><p>Daftar sekali menggunakan email dan password.</p></div>
    <div class="panel guide-card"><b>02</b><h3>Pilih & checkout</h3><p>Pilih produk, isi kontak penerima, lalu buat pesanan.</p></div>
    <div class="panel guide-card"><b>03</b><h3>Bayar & pantau</h3><p>Selesaikan pembayaran lalu pantau status sampai produk diterima.</p></div>
  </div></div></section>`;
}

function loginForm(admin=false){
  if (admin) return `<form id="adminLogin"><label class="field">Email admin<input name="email" type="email" required autocomplete="username"></label><label class="field">Password admin<input name="password" type="password" required minlength="8" autocomplete="current-password"></label><button class="btn full" type="submit">Masuk Panel Admin</button></form>`;
  return `<form id="userLogin"><label class="field">Email<input name="email" type="email" required autocomplete="email"></label><label class="field">Password<input name="password" type="password" required minlength="8" autocomplete="current-password"></label><button class="btn full" type="submit">Masuk</button><p class="tiny center">Belum punya akun? <button type="button" class="text-btn" data-register>Daftar akun</button></p></form>`;
}

function registerForm(){
  return `<form id="register"><label class="field">Nama<input name="name" required minlength="2"></label><label class="field">Email<input name="email" type="email" required></label><label class="field">Password<input name="password" type="password" required minlength="8"></label><label class="field">Ulangi password<input name="password2" type="password" required minlength="8"></label><button class="btn full" type="submit">Daftar & Masuk</button></form>`;
}

function accountModal(){
  if (!state.user){ openModal('Masuk pelanggan', loginForm(false)); return; }
  openModal('Akun kamu', `<div class="notice"><strong>${esc(state.user.name)}</strong><br>${esc(state.user.email)}</div><div class="stack">${state.user.role==='admin'?`<a class="btn" href="#admin" data-close>Panel admin</a>`:`<a class="btn" href="#pesanan" data-close>Pesanan saya</a>`}<button class="btn danger" data-logout>Keluar</button></div>`);
}

function productModal(id){
  const p = state.catalog.products.find(x=>x.id===id); if(!p) return;
  const unavailable = !state.catalog.settings.storeOpen || p.stock===0;
  const reason = !state.catalog.settings.storeOpen ? 'Toko sedang menutup pesanan baru.' : p.stock===0 ? 'Stok produk sedang habis.' : 'Kamu bisa lanjut ke checkout.';
  openModal(p.name, `<div class="cover ${esc(p.icon)} modal-cover">${icon(p)}<strong>${esc(p.duration)}</strong></div><p>${esc(p.description)}</p><ul class="benefits">${(p.benefits||[]).map(x=>`<li>✓ ${esc(x)}</li>`).join('')}</ul><div class="notice"><strong>Ketentuan</strong><br>${esc(p.terms)}</div><div class="checkout-ready ${unavailable?'is-off':''}">${esc(reason)}</div><div class="card-foot"><div><div class="price">${money(p.price)}</div><div class="tiny">${p.stock===-1?'Stok tersedia':p.stock>0?`Stok ${p.stock}`:'Stok habis'}</div></div><button class="btn" data-checkout="${esc(p.id)}" ${unavailable?'disabled':''}>Lanjut checkout</button></div>`);
}
function checkoutPage(id){
  const p = state.catalog.products.find(x=>x.id===id);
  if(!p) return `<section class="page"><div class="wrap empty"><h2>Produk tidak tersedia</h2><p>Produk mungkin sudah dinonaktifkan. Kembali ke katalog untuk memilih produk lain.</p><a class="btn" href="#katalog">Kembali ke katalog</a></div></section>`;
  if(!state.catalog.settings.storeOpen) return `<section class="page"><div class="wrap empty"><h2>Checkout sedang ditutup</h2><p>Admin sedang menutup pesanan baru. Kamu masih bisa melihat katalog.</p><a class="btn" href="#katalog">Kembali ke katalog</a></div></section>`;
  if(p.stock===0) return `<section class="page"><div class="wrap empty"><h2>Stok sedang habis</h2><p>Produk ini belum bisa dipesan sekarang.</p><a class="btn" href="#katalog">Pilih produk lain</a></div></section>`;
  if(!state.user || state.user.role!=='user'){
    state.pendingCheckout = id;
    return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Checkout</div><h1>Masuk untuk melanjutkan</h1><p>Checkout hanya menggunakan akun pelanggan agar pesanan tersimpan dan dapat dipantau.</p></div><div class="panel" style="max-width:520px"><button class="btn full" data-checkout-login="${esc(id)}">Masuk / Daftar Pelanggan</button>${state.user?.role==='admin'?'<p class="tiny center">Kamu sedang login sebagai Admin. Masuk dengan akun pelanggan untuk membuat pesanan.</p>':''}</div></div></section>`;
  }
  const manual = state.catalog.settings.paymentMode === 'manual';
  const banksAvailable = state.catalog.banks?.length > 0;
  const maxQty = p.stock > 0 ? Math.max(1, Math.min(5, Number(p.stock))) : 5;
  const qtyOptions = Array.from({length:maxQty},(_,i)=>i+1).map(n=>`<option value="${n}">${n}</option>`).join('');
  const paymentBox = manual
    ? (banksAvailable
      ? `<div class="panel"><h2>Pilih rekening</h2><label class="field">Bank<select name="bankId" required>${state.catalog.banks.map(b=>`<option value="${esc(b.id)}">${esc(b.name)} · ${esc(b.holder)}</option>`).join('')}</select></label><p class="tiny">Nomor rekening lengkap akan tampil setelah pesanan berhasil dibuat.</p></div>`
      : `<div class="notice warn"><strong>Checkout belum siap.</strong><br>Belum ada rekening pembayaran aktif. Hubungi admin atau aktifkan rekening dari Panel Admin.</div>`)
    : `<div class="notice ok"><strong>Pembayaran otomatis aktif.</strong><br>Setelah pesanan dibuat kamu akan diarahkan ke halaman pembayaran Midtrans.</div>`;
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Checkout</div><h1>${esc(p.name)}</h1><p>${money(p.price)} · ${esc(p.duration)}</p></div>
  <form id="checkoutForm" data-product="${esc(p.id)}" class="two"><div class="stack"><div class="panel"><h2>Kontak penerima</h2><div class="row"><label class="field">Nama<input name="name" required minlength="2" maxlength="80" value="${esc(state.user.name)}"></label><label class="field">Email<input value="${esc(state.user.email)}" readonly></label></div><label class="field">Nomor WhatsApp <small>Wajib jika detail dikirim lewat WhatsApp.</small><input name="phone" type="tel" maxlength="24" placeholder="081234567890"></label><label class="field">Kirim detail melalui<select name="channel" id="checkoutChannel"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label></div>${paymentBox}</div>
  <aside class="panel order-summary"><h2>Ringkasan</h2><div class="summary-product"><div>${icon(p)}</div><div><strong>${esc(p.name)}</strong><span>${esc(p.duration)}</span></div></div><label class="field">Jumlah<select name="quantity" id="checkoutQuantity">${qtyOptions}</select></label><div class="summary-row"><span>Harga satuan</span><strong>${money(p.price)}</strong></div><div class="summary-row total"><span>Total pembayaran</span><strong id="checkoutTotal">${money(p.price)}</strong></div><label class="check"><input type="checkbox" name="agree" required> Saya sudah membaca dan menyetujui ketentuan produk.</label><div id="checkoutError" class="form-inline-error" hidden></div><button class="btn full" type="submit" ${manual&&!banksAvailable?'disabled':''}>${manual?'Buat Pesanan':'Bayar Sekarang'}</button><p class="tiny center">Pesanan baru dibuat setelah tombol ini ditekan.</p></aside></form></div></section>`;
}
function ordersPage(){
  if(!state.user || state.user.role!=='user') return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Pesanan</div><h1>Pantau pesananmu</h1><p>Masuk untuk melihat riwayat pesanan.</p></div><div class="panel" style="max-width:520px"><button class="btn" data-open-login>Masuk pelanggan</button></div></div></section>`;
  if(!state.orders.length) return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Pesanan</div><h1>Belum ada pesanan</h1><p>Produk digital pertamamu menunggu.</p></div><a class="btn" href="#katalog">Lihat produk</a></div></section>`;
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Pesanan</div><h1>Pesanan saya</h1><p>${state.orders.length} pesanan tersimpan di akunmu.</p></div><div class="orders">${state.orders.map(o=>`<article class="order"><div><span class="tiny">${esc(o.id)} · ${dt(o.createdAt)}</span><h3>${esc(o.productName)}</h3><span class="tiny">${esc(o.duration)} · ${o.quantity} produk</span></div><div><strong>${money(o.total)}</strong><br>${status(o.status)}</div><a class="btn light small" href="#pesanan/${encodeURIComponent(o.id)}">Lihat detail</a></article>`).join('')}</div></div></section>`;
}

function orderDetail(id){
  const o = state.orders.find(x=>x.id===id);
  if(!o) return `<section class="page"><div class="wrap empty">Pesanan tidak ditemukan.</div></section>`;
  let pay='';
  if(o.status==='pending_payment' && o.paymentMode==='manual' && o.bank){
    pay=`<div class="panel"><h2>Pembayaran transfer</h2><div class="bank"><strong>${esc(o.bank.name)}</strong><div class="bank-number">${esc(o.bank.number)}</div><span>Atas nama ${esc(o.bank.holder)}</span></div><p>Total transfer: <strong>${money(o.total)}</strong></p><form id="proofForm" data-order="${esc(o.id)}"><label class="field">Bukti transfer (JPG/PNG/PDF maksimal ±1MB)<input type="file" name="proof" accept="image/jpeg,image/png,application/pdf" required></label><button class="btn" type="submit">Unggah bukti</button></form></div>`;
  }
  if(o.status==='pending_payment' && o.paymentMode==='midtrans'){
    pay=`<div class="panel"><h2>Pembayaran otomatis</h2><p>Status gateway: ${esc(o.gatewayStatus||'belum dibuat')}</p>${o.paymentUrl?`<a class="btn" href="${esc(o.paymentUrl)}">Lanjut pembayaran</a>`:`<button class="btn" data-pay="${esc(o.id)}">Buat ulang pembayaran</button>`}</div>`;
  }
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">${esc(o.id)}</div><h1>${esc(o.productName)}</h1><p>${dt(o.createdAt)} · ${status(o.status)}</p></div><div class="two"><div class="stack">${pay}${o.note?`<div class="notice">${esc(o.note)}</div>`:''}${o.status==='completed'?`<div class="panel"><h2>Detail produk</h2><pre class="delivery">${esc(o.delivery)}</pre></div>`:''}</div><aside class="panel"><h2>Ringkasan</h2><p>${esc(o.duration)} · ${o.quantity} produk</p><div class="price">${money(o.total)}</div><p class="tiny">Penerima: ${esc(o.name)}<br>${esc(o.email)}${o.phone?`<br>${esc(o.phone)}`:''}</p>${o.status==='pending_payment'?`<button class="btn danger small" data-cancel="${esc(o.id)}">Batalkan pesanan</button>`:''}</aside></div></div></section>`;
}

async function adminPage(){
  if(!state.user || state.user.role!=='admin') return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Panel Admin</div><h1>Kelola Uply Digital</h1><p>Masuk menggunakan email dan password admin dari Vercel Environment Variables.</p></div><div class="panel" style="max-width:520px">${loginForm(true)}</div></div></section>`;
  state.admin = await api('adminData');
  const tabs = [['overview','Ringkasan'],['orders','Pesanan'],['products','Produk'],['inventory','Inventory'],['customers','Pelanggan'],['settings','Pengaturan'],['audit','Aktivitas']];
  return `<section class="page admin-page"><div class="wrap"><div class="page-head admin-title-row"><div><div class="eyebrow dark">Panel Admin</div><h1>Ruang kelola toko</h1><p>${esc(state.admin.admin.email)} · pembayaran <strong>${esc(state.admin.settings.paymentMode)}</strong></p></div><div class="admin-head-actions"><button class="btn light small" data-admin-refresh>↻ Perbarui</button><a class="btn small" href="#katalog">Lihat toko</a></div></div><div class="admin-layout"><aside class="admin-nav">${tabs.map(([id,l])=>`<button data-admin-tab="${id}" class="${state.adminTab===id?'active':''}">${l}</button>`).join('')}</aside><div id="adminContent">${adminContent()}</div></div></div></section>`;
}

function lowStockProducts(d){
  return d.products.filter(p => {
    if(!p.active) return false;
    if(p.fulfillmentMode==='inventory') return Number(p.stock) <= 2;
    return Number(p.stock) !== -1 && Number(p.stock) <= 3;
  });
}

function ordersTable(orders){
  if(!orders.length) return `<div class="empty panel">Tidak ada pesanan pada filter ini.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Produk</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><strong>${esc(o.id)}</strong><br><span class="tiny">${dt(o.createdAt)}</span></td><td>${esc(o.name)}<br><span class="tiny">${esc(o.email)}</span></td><td>${esc(o.productName)}<br><span class="tiny">${esc(o.duration)} · ${o.quantity}</span></td><td><strong>${money(o.total)}</strong></td><td>${status(o.status)}</td><td><button class="text-btn" data-admin-order="${esc(o.id)}">Buka</button></td></tr>`).join('')}</tbody></table></div>`;
}

function adminContent(){
  const d = state.admin;
  if(state.adminTab==='overview'){
    const rev = d.orders.filter(o=>['processing','completed'].includes(o.status)).reduce((a,o)=>a+o.total,0);
    const availableInventory = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.available||0),0);
    const low = lowStockProducts(d);
    return `<div class="stats six"><div class="stat"><span class="tiny">Omzet terverifikasi</span><strong>${money(rev)}</strong></div><div class="stat"><span class="tiny">Perlu dicek</span><strong>${d.orders.filter(o=>o.status==='review').length}</strong></div><div class="stat"><span class="tiny">Total pesanan</span><strong>${d.orders.length}</strong></div><div class="stat"><span class="tiny">Pelanggan</span><strong>${d.customers.length}</strong></div><div class="stat"><span class="tiny">Produk aktif</span><strong>${d.products.filter(p=>p.active).length}</strong></div><div class="stat"><span class="tiny">Inventory tersedia</span><strong>${availableInventory}</strong></div></div>
    <div class="admin-grid-2"><div class="panel"><div class="toolbar"><div><h2>Quick actions</h2><p class="tiny">Akses tugas yang paling sering dipakai.</p></div></div><div class="quick-actions"><button class="quick" data-quick="add-product"><b>＋</b><span>Tambah produk<small>Buat produk baru</small></span></button><button class="quick" data-quick="inventory"><b>▣</b><span>Tambah inventory<small>Input satu per satu</small></span></button><button class="quick" data-quick="review"><b>✓</b><span>Cek pembayaran<small>${d.orders.filter(o=>o.status==='review').length} perlu dicek</small></span></button><button class="quick" data-quick="settings"><b>⚙</b><span>Pengaturan toko<small>Bank & status toko</small></span></button></div></div>
    <div class="panel"><div class="toolbar"><div><h2>Alert stok</h2><p class="tiny">Produk yang perlu perhatian.</p></div><button class="text-btn" data-admin-tab="inventory">Buka inventory</button></div>${low.length?`<div class="alert-list">${low.slice(0,8).map(p=>`<div><span><strong>${esc(p.name)}</strong><small>${p.fulfillmentMode==='inventory'?'Inventory otomatis':'Stok manual'}</small></span><b>${p.stock===0?'Habis':`Sisa ${p.stock}`}</b></div>`).join('')}</div>`:`<div class="notice ok">Semua stok dalam kondisi aman.</div>`}</div></div>
    <div class="toolbar section-toolbar"><div><h2>Pesanan terbaru</h2><p class="tiny">Aktivitas order terbaru dari pelanggan.</p></div><button class="text-btn" data-admin-tab="orders">Lihat semua</button></div>${ordersTable(d.orders.slice(0,8))}
    <div class="toolbar section-toolbar"><div><h2>Aktivitas terbaru</h2><p class="tiny">Perubahan penting di toko.</p></div><button class="text-btn" data-admin-tab="audit">Lihat semua</button></div><div class="activity-list">${d.audit.slice(0,8).map(a=>`<div><span class="activity-dot"></span><div><strong>${esc(a.action.replaceAll('_',' '))}</strong><p>${esc(a.actor)}${a.record_id?` · ${esc(a.record_id)}`:''}</p></div><time>${dt(a.timestamp)}</time></div>`).join('')||'<div class="empty">Belum ada aktivitas.</div>'}</div>`;
  }

  if(state.adminTab==='orders'){
    const needle = state.adminOrderSearch.toLowerCase();
    const filtered = d.orders.filter(o => (state.adminOrderStatus==='all'||o.status===state.adminOrderStatus) && `${o.id} ${o.name} ${o.email} ${o.productName}`.toLowerCase().includes(needle));
    return `<div class="toolbar"><div><h2>Pesanan</h2><p class="tiny">Cari berdasarkan ID, pelanggan, email, atau produk.</p></div><span class="pill-count">${filtered.length} hasil</span></div><div class="filter-bar"><input id="adminOrderSearch" class="search" placeholder="Cari pesanan…" value="${esc(state.adminOrderSearch)}"><select id="adminOrderStatus" class="select">${[['all','Semua status'],...Object.entries(statusLabel)].map(([v,l])=>`<option value="${v}" ${state.adminOrderStatus===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>${ordersTable(filtered)}`;
  }

  if(state.adminTab==='products'){
    return `<div class="toolbar"><div><h2>Katalog produk</h2><p class="tiny">Atur harga, stok, badge, dan mode pengiriman.</p></div><button class="btn small" data-edit-product="">Tambah produk</button></div><div class="table-wrap"><table><thead><tr><th>Produk</th><th>Harga</th><th>Stok</th><th>Pengiriman</th><th>Status</th><th></th></tr></thead><tbody>${d.products.map(p=>`<tr><td><strong>${esc(p.name)}</strong><br><span class="tiny">${esc(p.category)} · ${esc(p.duration)}</span>${p.badge?`<br><span class="badge">${esc(p.badge)}</span>`:''}</td><td>${money(p.price)}</td><td>${p.stock===-1?'Tanpa batas':p.stock}</td><td>${p.fulfillmentMode==='inventory'?'<span class="mode-chip auto">Inventory otomatis</span>':'<span class="mode-chip">Manual admin</span>'}</td><td>${p.active?'<span class="status completed">Aktif</span>':'<span class="status cancelled">Nonaktif</span>'}</td><td><button class="text-btn" data-edit-product="${esc(p.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  if(state.adminTab==='inventory'){
    const items = (d.inventoryItems||[]).filter(i => (state.inventoryProduct==='all'||i.productId===state.inventoryProduct) && (state.inventoryStatus==='all'||i.status===state.inventoryStatus));
    const available = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.available||0),0);
    const delivered = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.delivered||0),0);
    const disabled = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.disabled||0),0);
    return `<div class="stats inventory-stats"><div class="stat"><span class="tiny">Tersedia</span><strong>${available}</strong></div><div class="stat"><span class="tiny">Terkirim</span><strong>${delivered}</strong></div><div class="stat"><span class="tiny">Nonaktif</span><strong>${disabled}</strong></div></div>
    <div class="admin-grid-2 inventory-grid"><div class="panel"><div class="panel-title"><div><h2>Tambah inventory</h2><p>Input item satu per satu supaya stok lebih mudah dikontrol.</p></div><span class="tag-new">Utama</span></div><form id="inventoryAddForm"><label class="field">Produk<select name="productId" required>${d.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · tersedia ${d.inventory[p.id]?.available||0}</option>`).join('')}</select></label><label class="field">Kode / link / detail akun<textarea name="itemValue" rows="4" maxlength="5000" required placeholder="Contoh: https://link-aktivasi... atau kode lisensi..."></textarea></label><label class="field">Catatan internal <small>Opsional, hanya terlihat admin.</small><input name="note" maxlength="300" placeholder="Contoh: batch Oktober / profil 2"></label><label class="field">Status<select name="status"><option value="available">Tersedia</option><option value="disabled">Nonaktif</option></select></label><button class="btn full" type="submit">＋ Tambah 1 Item</button></form></div>
    <div class="panel"><h2>Ringkasan per produk</h2><div class="inventory-product-list">${d.products.map(p=>`<div><span><strong>${esc(p.name)}</strong><small>${p.fulfillmentMode==='inventory'?'Auto-delivery aktif':'Manual'}</small></span><span class="inv-counts"><b>${d.inventory[p.id]?.available||0}</b> tersedia · ${d.inventory[p.id]?.delivered||0} terkirim</span></div>`).join('')}</div><details class="bulk-box"><summary>Import banyak sekaligus (opsional)</summary><form id="inventoryBulkForm"><label class="field">Produk<select name="productId">${d.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label class="field">Satu item per baris<textarea name="items" placeholder="kode-001\nkode-002\nkode-003"></textarea></label><button class="btn light" type="submit">Import daftar</button></form></details></div></div>
    <div class="toolbar section-toolbar"><div><h2>Daftar inventory</h2><p class="tiny">Item terbaru dan status penggunaannya.</p></div><span class="pill-count">${items.length} item</span></div><div class="filter-bar"><select id="inventoryProductFilter" class="select"><option value="all">Semua produk</option>${d.products.map(p=>`<option value="${esc(p.id)}" ${state.inventoryProduct===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select><select id="inventoryStatusFilter" class="select">${[['all','Semua status'],['available','Tersedia'],['delivered','Terkirim'],['disabled','Nonaktif']].map(([v,l])=>`<option value="${v}" ${state.inventoryStatus===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Produk</th><th>Item</th><th>Catatan</th><th>Status</th><th>Order</th><th>Ditambahkan</th><th></th></tr></thead><tbody>${items.map(i=>`<tr><td><strong>${esc(i.productName||i.productId)}</strong></td><td><code class="inventory-value">${esc(truncate(i.itemValue,54))}</code><br><button class="text-btn tiny-btn" data-copy="${esc(i.itemValue)}">Salin</button></td><td>${esc(i.note||'—')}</td><td>${inventoryStatus(i.status)}</td><td>${esc(i.orderId||'—')}</td><td>${dt(i.createdAt)}</td><td>${i.status==='delivered'?'<span class="tiny">Terkunci</span>':`<button class="text-btn" data-inventory-toggle="${esc(i.id)}" data-next-status="${i.status==='available'?'disabled':'available'}">${i.status==='available'?'Nonaktifkan':'Aktifkan'}</button>`}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Belum ada inventory.</td></tr>'}</tbody></table></div>`;
  }

  if(state.adminTab==='customers'){
    const needle = state.customerSearch.toLowerCase();
    const customers = d.customers.filter(c=>`${c.name} ${c.email} ${c.phone||''}`.toLowerCase().includes(needle));
    return `<div class="toolbar"><div><h2>Pelanggan</h2><p class="tiny">Lihat riwayat singkat pelanggan.</p></div><span class="pill-count">${customers.length} pelanggan</span></div><div class="filter-bar"><input id="customerSearch" class="search" placeholder="Cari nama / email…" value="${esc(state.customerSearch)}"></div><div class="table-wrap"><table><thead><tr><th>Pelanggan</th><th>Kontak</th><th>Order</th><th>Total belanja</th><th>Daftar</th></tr></thead><tbody>${customers.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.email)}<br>${esc(c.phone||'')}</td><td>${c.ordersCount}</td><td>${money(c.spent)}</td><td>${dt(c.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  if(state.adminTab==='settings'){
    const s = d.settings;
    return `<div class="admin-grid-2"><form id="settingsForm" class="panel"><h2>Pengaturan toko</h2><label class="field">Nama toko<input name="storeName" value="${esc(s.storeName||'Uply Digital')}" required></label><label class="field">WhatsApp admin<input name="whatsapp" value="${esc(s.whatsapp||'')}" placeholder="628123456789"></label><label class="field">Jam layanan<input name="hours" value="${esc(s.hours||'')}"></label><label class="field">Batas pembayaran (jam)<input name="paymentHours" type="number" min="1" max="72" value="${Number(s.paymentHours)||24}"></label><label class="field">Pengumuman toko<textarea name="notice">${esc(s.notice||'')}</textarea></label><label class="check"><input name="storeOpen" type="checkbox" ${s.storeOpen?'checked':''}> Terima pesanan baru</label><button class="btn" type="submit">Simpan pengaturan</button></form><div class="panel"><div class="toolbar"><div><h2>Rekening pembayaran</h2><p class="tiny">Dipakai saat PAYMENT_MODE = manual.</p></div></div>${d.banks.map(b=>`<div class="bank-row"><span><strong>${esc(b.name)}</strong><small>${esc(b.number)} · ${esc(b.holder)}</small></span><button class="text-btn" data-edit-bank="${esc(b.id)}">Edit</button></div>`).join('')}</div></div>`;
  }

  return `<div class="toolbar"><div><h2>Aktivitas</h2><p class="tiny">Audit log perubahan penting.</p></div></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Record</th></tr></thead><tbody>${d.audit.map(a=>`<tr><td>${dt(a.timestamp)}</td><td>${esc(a.actor)}</td><td>${esc(a.action.replaceAll('_',' '))}</td><td>${esc(a.record_id||'')}</td></tr>`).join('')}</tbody></table></div>`;
}

function editProduct(id){
  const p = state.admin.products.find(x=>x.id===id) || {id:'',name:'',category:'Digital',duration:'1 bulan',price:10000,description:'',benefits:[],terms:'',stock:-1,active:true,badge:'',icon:'generic',fulfillmentMode:'manual'};
  openModal(p.id?'Edit produk':'Tambah produk', `<form id="productForm" data-id="${esc(p.id)}"><label class="field">Nama produk<input name="name" value="${esc(p.name)}" required></label><div class="row"><label class="field">Kategori<input name="category" value="${esc(p.category)}" required></label><label class="field">Durasi / paket<input name="duration" value="${esc(p.duration)}" required></label></div><div class="row"><label class="field">Harga<input name="price" type="number" min="1000" value="${p.price}" required></label><label class="field">Stok manual<input name="stock" type="number" min="-1" value="${p.stock}" required><small>-1 = tidak terbatas. Mode inventory memakai jumlah item tersedia.</small></label></div><label class="field">Deskripsi<input name="description" value="${esc(p.description)}"></label><label class="field">Benefit (satu per baris)<textarea name="benefits">${esc((p.benefits||[]).join('\n'))}</textarea></label><label class="field">Ketentuan<textarea name="terms">${esc(p.terms)}</textarea></label><div class="row"><label class="field">Badge<input name="badge" value="${esc(p.badge)}" placeholder="Favorit / Terlaris"></label><label class="field">Ikon<select name="icon">${['generic','netflix','youtube','ai','stars'].map(x=>`<option ${p.icon===x?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field">Mode pengiriman<select name="fulfillmentMode"><option value="manual" ${p.fulfillmentMode==='manual'?'selected':''}>Manual oleh admin</option><option value="inventory" ${p.fulfillmentMode==='inventory'?'selected':''}>Inventory otomatis</option></select></label><label class="check"><input name="active" type="checkbox" ${p.active?'checked':''}> Tampilkan produk di toko</label><button class="btn full" type="submit">Simpan produk</button></form>`);
}

function editBank(id){
  const b = state.admin.banks.find(x=>x.id===id); if(!b) return;
  openModal('Edit rekening', `<form id="bankForm" data-id="${esc(b.id)}"><label class="field">Nama bank<input name="name" value="${esc(b.name)}" required></label><label class="field">Nomor rekening<input name="number" value="${esc(b.number)}" required></label><label class="field">Atas nama<input name="holder" value="${esc(b.holder)}" required></label><label class="check"><input name="active" type="checkbox" ${b.active?'checked':''}> Aktif untuk checkout</label><button class="btn full" type="submit">Simpan rekening</button></form>`);
}

function adminOrderModal(id){
  const o = state.admin.orders.find(x=>x.id===id); if(!o) return;
  const controls = o.status==='review' ? `<label class="field">Tindakan<select name="status"><option value="processing">Pembayaran diterima → proses</option><option value="pending_payment">Minta bukti ulang</option><option value="cancelled">Batalkan</option></select></label><label class="check"><input type="checkbox" name="confirmPayment"> Saya sudah mencocokkan dana masuk.</label>` : o.status==='pending_payment' ? `<label class="field">Tindakan<select name="status"><option value="cancelled">Batalkan pesanan</option><option value="processing">Tandai dibayar & proses</option></select></label><label class="check"><input type="checkbox" name="confirmPayment"> Jika memproses: pembayaran sudah diterima.</label>` : o.status==='processing' ? `<input type="hidden" name="status" value="completed"><label class="field">Detail produk / instruksi<textarea name="delivery" required>${esc(o.delivery||'')}</textarea></label>` : '';
  openModal('Pesanan ' + o.id, `<div class="notice"><strong>${esc(o.productName)}</strong><br>${esc(o.name)} · ${esc(o.email)}<br>${money(o.total)} · ${statusLabel[o.status]||o.status}</div>${o.hasProof?`<button class="btn light small" data-proof="${esc(o.id)}">Lihat bukti transfer</button>`:''}${controls?`<form id="orderForm" data-id="${esc(o.id)}" class="stack" style="margin-top:14px">${controls}<label class="field">Catatan pelanggan<textarea name="note">${esc(o.note||'')}</textarea></label><button class="btn full" type="submit">Simpan perubahan</button></form>`:o.status==='completed'?`<div class="panel"><strong>Detail terkirim</strong><pre class="delivery">${esc(o.delivery||'')}</pre></div>`:'<p class="tiny">Tidak ada tindakan manual yang diperlukan pada status ini.</p>'}`);
}

async function refreshAdmin(){
  state.admin = await api('adminData');
  const target = $('#adminContent'); if(target) target.innerHTML = adminContent();
}

async function route(){
  if(!state.catalog) await loadCatalog();
  const hash = (location.hash || '#katalog').slice(1);
  if(hash==='katalog' || hash==='') app.innerHTML = catalogPage();
  else if(hash==='bantuan') app.innerHTML = helpPage();
  else if(hash.startsWith('checkout/')) app.innerHTML = checkoutPage(decodeURIComponent(hash.slice(9)));
  else if(hash==='pesanan' || hash.startsWith('pesanan/')){
    if(state.user?.role==='user') state.orders = await api('orders');
    app.innerHTML = hash==='pesanan' ? ordersPage() : orderDetail(decodeURIComponent(hash.slice(8)));
  }
  else if(hash==='admin') app.innerHTML = await adminPage();
  else { location.hash='#katalog'; return; }
  window.scrollTo({top:0,behavior:'instant'});
}

$('#accountBtn').addEventListener('click', accountModal);

app.addEventListener('input', e => {
  if(e.target.id==='search'){ state.search=e.target.value; $('#productGrid').innerHTML=productCards(); }
  if(e.target.id==='adminOrderSearch'){ state.adminOrderSearch=e.target.value; $('#adminContent').innerHTML=adminContent(); setTimeout(()=>{const el=$('#adminOrderSearch'); if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}},0); }
  if(e.target.id==='customerSearch'){ state.customerSearch=e.target.value; $('#adminContent').innerHTML=adminContent(); setTimeout(()=>{const el=$('#customerSearch');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length)}},0); }
});

app.addEventListener('change', e => {
  if(e.target.id==='adminOrderStatus'){ state.adminOrderStatus=e.target.value; $('#adminContent').innerHTML=adminContent(); }
  if(e.target.id==='inventoryProductFilter'){ state.inventoryProduct=e.target.value; $('#adminContent').innerHTML=adminContent(); }
  if(e.target.id==='inventoryStatusFilter'){ state.inventoryStatus=e.target.value; $('#adminContent').innerHTML=adminContent(); }
  if(e.target.id==='checkoutQuantity'){
    const form=e.target.closest('#checkoutForm'); const p=state.catalog.products.find(x=>x.id===form?.dataset.product); const out=$('#checkoutTotal'); if(p&&out) out.textContent=money(Number(p.price)*Number(e.target.value||1));
  }
  if(e.target.id==='checkoutChannel'){
    const form=e.target.closest('#checkoutForm'); const phoneInput=form?.elements?.phone; if(phoneInput) phoneInput.required=e.target.value==='whatsapp';
  }
});

document.addEventListener('click', async e => {
  const product = e.target.closest('[data-product]'); if(product){ productModal(product.dataset.product); return; }
  const chip = e.target.closest('[data-filter]'); if(chip){ state.filter=chip.dataset.filter; app.innerHTML=catalogPage(); document.getElementById('produk')?.scrollIntoView(); return; }
  if(e.target.closest('[data-open-login]')){ openModal('Masuk pelanggan',loginForm(false)); return; }
  const tab = e.target.closest('[data-admin-tab]'); if(tab){ state.adminTab=tab.dataset.adminTab; $('#adminContent').innerHTML=adminContent(); return; }
  const editP = e.target.closest('[data-edit-product]'); if(editP){ editProduct(editP.dataset.editProduct); return; }
  const editB = e.target.closest('[data-edit-bank]'); if(editB){ editBank(editB.dataset.editBank); return; }
  const ao = e.target.closest('[data-admin-order]'); if(ao){ adminOrderModal(ao.dataset.adminOrder); return; }
  const checkout = e.target.closest('[data-checkout]'); if(checkout){
    const id=checkout.dataset.checkout; const p=state.catalog?.products?.find(x=>x.id===id);
    if(!p){msg('Produk tidak ditemukan.');return;}
    if(!state.catalog.settings.storeOpen){msg('Toko sedang menutup pesanan baru.');return;}
    if(p.stock===0){msg('Stok produk sedang habis.');return;}
    state.pendingCheckout=id; closeModal();
    if(!state.user || state.user.role!=='user'){openModal('Masuk untuk checkout',loginForm(false)+`<p class="tiny center">Setelah berhasil masuk, kamu akan langsung kembali ke checkout ${esc(p.name)}.</p>`);return;}
    state.pendingCheckout=''; location.hash='#checkout/'+encodeURIComponent(id); if((location.hash||'')==='#checkout/'+encodeURIComponent(id)) await route(); return;
  }
  const checkoutLogin=e.target.closest('[data-checkout-login]'); if(checkoutLogin){state.pendingCheckout=checkoutLogin.dataset.checkoutLogin;openModal('Masuk untuk checkout',loginForm(false));return;}
  const pay = e.target.closest('[data-pay]'); if(pay){ try{const r=await api('retryPayment',{orderId:pay.dataset.pay}); if(r.paymentUrl) location.href=r.paymentUrl;}catch(err){msg(err.message)} return; }
  const cancel = e.target.closest('[data-cancel]'); if(cancel){ if(confirm('Batalkan pesanan ini?')){try{await api('cancelOrder',{orderId:cancel.dataset.cancel});state.orders=await api('orders');await route();msg('Pesanan dibatalkan.')}catch(err){msg(err.message)}}return; }
  const proof = e.target.closest('[data-proof]'); if(proof){ try{const r=await api('getProof',{orderId:proof.dataset.proof}); const url=`data:${r.mime};base64,${r.base64}`; window.open(url,'_blank','noopener,noreferrer');}catch(err){msg(err.message)} return; }
  const copy = e.target.closest('[data-copy]'); if(copy){ try{await navigator.clipboard.writeText(copy.dataset.copy);msg('Berhasil disalin.')}catch{msg('Tidak bisa menyalin otomatis.')} return; }
  const toggle = e.target.closest('[data-inventory-toggle]'); if(toggle){ try{await api('inventorySetStatus',{inventoryId:toggle.dataset.inventoryToggle,status:toggle.dataset.nextStatus});await refreshAdmin();msg('Status inventory diperbarui.')}catch(err){msg(err.message)} return; }
  const quick = e.target.closest('[data-quick]'); if(quick){ const q=quick.dataset.quick;if(q==='add-product'){editProduct('');return;}if(q==='inventory'){state.adminTab='inventory';$('#adminContent').innerHTML=adminContent();return;}if(q==='review'){state.adminTab='orders';state.adminOrderStatus='review';$('#adminContent').innerHTML=adminContent();return;}if(q==='settings'){state.adminTab='settings';$('#adminContent').innerHTML=adminContent();return;} }
  if(e.target.closest('[data-admin-refresh]')){ try{await refreshAdmin();msg('Data admin diperbarui.')}catch(err){msg(err.message)} return; }
});

document.addEventListener('click', async e => {
  if(e.target.closest('[data-register]')){ openModal('Daftar akun',registerForm()); return; }
  if(e.target.closest('[data-logout]')){ try{await api('logout');}catch{} state.token='';state.user=null;state.admin=null;localStorage.removeItem('uply_token');setAccount();closeModal();location.hash='#katalog';msg('Kamu sudah keluar.'); }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const b = f.querySelector('[type=submit]');
  if(b){ b.disabled=true; b.dataset.old=b.textContent; b.textContent='Sebentar…'; }
  try{
    const fd = new FormData(f); const g=k=>String(fd.get(k)||'');
    if(f.id==='userLogin'){
      const r=await api('login',{email:g('email'),password:g('password')});state.token=r.token;state.user=r.user;localStorage.setItem('uply_token',r.token);setAccount();closeModal();msg('Berhasil masuk.');if(state.pendingCheckout){const id=state.pendingCheckout;state.pendingCheckout='';location.hash='#checkout/'+encodeURIComponent(id);await route();}else await route();
    } else if(f.id==='register'){
      if(g('password')!==g('password2')) throw Error('Ulangi password harus sama.');
      const r=await api('register',{name:g('name'),email:g('email'),password:g('password')});state.token=r.token;state.user=r.user;localStorage.setItem('uply_token',r.token);setAccount();closeModal();msg('Akun berhasil dibuat.');if(state.pendingCheckout){const id=state.pendingCheckout;state.pendingCheckout='';location.hash='#checkout/'+encodeURIComponent(id);await route();}else await route();
    } else if(f.id==='adminLogin'){
      const r=await api('adminLogin',{email:g('email'),password:g('password')});state.token=r.token;state.user=r.user;localStorage.setItem('uply_token',r.token);setAccount();msg('Login admin berhasil.');await route();
    } else if(f.id==='checkoutForm'){
      if(!fd.has('agree')) throw Error('Centang persetujuan ketentuan produk terlebih dahulu.');
      if(g('channel')==='whatsapp' && !g('phone').trim()) throw Error('Isi nomor WhatsApp jika detail ingin dikirim lewat WhatsApp.');
      if(state.catalog.settings.paymentMode==='manual' && !g('bankId')) throw Error('Belum ada rekening pembayaran aktif. Hubungi admin.');
      const req=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
      const r=await api('createOrder',{productId:f.dataset.product,requestId:req,quantity:Number(g('quantity')),name:g('name'),phone:g('phone'),channel:g('channel'),bankId:g('bankId'),agree:true});
      state.orders=await api('orders');
      if(r.paymentUrl){msg('Pesanan dibuat. Membuka pembayaran…');setTimeout(()=>location.assign(r.paymentUrl),650)}
      else{location.hash='#pesanan/'+encodeURIComponent(r.order.id);await route();msg('Pesanan berhasil dibuat. Lanjutkan pembayaran.')}
    } else if(f.id==='proofForm'){
      const file=f.elements.proof.files[0];if(!file)throw Error('Pilih file bukti.');if(file.size>1100000)throw Error('Ukuran bukti maksimal sekitar 1 MB.');
      const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});
      await api('uploadProof',{orderId:f.dataset.order,fileName:file.name,mime:file.type,base64});state.orders=await api('orders');await route();msg('Bukti pembayaran dikirim.');
    } else if(f.id==='productForm'){
      await api('saveProduct',{product:{id:f.dataset.id,name:g('name'),category:g('category'),duration:g('duration'),price:Number(g('price')),stock:Number(g('stock')),description:g('description'),benefits:g('benefits').split('\n').map(x=>x.trim()).filter(Boolean),terms:g('terms'),badge:g('badge'),icon:g('icon'),fulfillmentMode:g('fulfillmentMode'),active:fd.has('active')}});
      closeModal();await refreshAdmin();state.catalog=null;msg('Produk disimpan.');
    } else if(f.id==='bankForm'){
      await api('saveBank',{bank:{id:f.dataset.id,name:g('name'),number:g('number'),holder:g('holder'),active:fd.has('active')}});closeModal();await refreshAdmin();state.catalog=null;msg('Rekening disimpan.');
    } else if(f.id==='settingsForm'){
      await api('saveSettings',{settings:{storeName:g('storeName'),whatsapp:g('whatsapp'),hours:g('hours'),paymentHours:Number(g('paymentHours')),notice:g('notice'),storeOpen:fd.has('storeOpen')}});await refreshAdmin();state.catalog=null;msg('Pengaturan disimpan.');
    } else if(f.id==='inventoryAddForm'){
      await api('inventoryAdd',{productId:g('productId'),itemValue:g('itemValue'),note:g('note'),status:g('status')});f.reset();await refreshAdmin();msg('1 item inventory berhasil ditambahkan.');
    } else if(f.id==='inventoryBulkForm'){
      const items=g('items').split('\n').map(x=>x.trim()).filter(Boolean);await api('inventoryImport',{productId:g('productId'),items});f.reset();await refreshAdmin();msg(`${items.length} item inventory ditambahkan.`);
    } else if(f.id==='orderForm'){
      await api('updateOrder',{orderId:f.dataset.id,status:g('status'),delivery:g('delivery'),note:g('note'),confirmPayment:fd.has('confirmPayment')});closeModal();await refreshAdmin();msg('Pesanan diperbarui.');
    }
  } catch(err){ msg(err.message); }
  finally { if(b){ b.disabled=false; b.textContent=b.dataset.old || 'Simpan'; } }
});

window.addEventListener('hashchange', ()=>route().catch(e=>{app.innerHTML=`<div class="empty">${esc(e.message)}</div>`}));

async function start(){
  $('#year').textContent = new Date().getFullYear();
  try { await loadCatalog(); await restore(); setAccount(); await route(); }
  catch(e){ app.innerHTML = `<section class="page"><div class="wrap"><div class="notice error"><strong>Website belum terhubung dengan benar.</strong><br>${esc(e.message)}</div><p class="tiny">Periksa Environment Variables, database, dan deployment Vercel.</p></div></section>`; }
}
start();
