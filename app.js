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
  claims: [],
  customerNotifications: [],
  admin: null,
  adminTab: 'overview',
  search: '',
  filter: 'Semua',
  adminOrderSearch: '',
  adminOrderStatus: 'all',
  customerSearch: '',
  inventoryProduct: 'all',
  inventoryStatus: 'all',
  pendingCheckout: '',
  pendingVariantId: '',
  checkoutVariantId: '',
  checkoutQty: 1,
  appliedVoucher: null,
  reportFrom: '',
  reportTo: '',
  cart: (()=>{ try{return JSON.parse(localStorage.getItem('uply_cart')||'null')}catch{return null} })()
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
const claimStatusLabel={submitted:'Diajukan',review:'Sedang dicek',processing:'Diproses',approved:'Disetujui',rejected:'Ditolak',resolved:'Selesai'};
const claimCategoryLabel={kendala_produk:'Produk bermasalah',login:'Tidak bisa login',garansi:'Claim garansi',aktivasi:'Aktivasi gagal',lainnya:'Lainnya'};
const dateInput=v=>v?new Date(v).toISOString().slice(0,16):'';
const futureDate=v=>v&&new Date(v).getTime()>Date.now();
function inventoryTargets(products=[]){
  return products.flatMap(p=>{const vars=(p.allVariants||[]).filter(v=>v.active);return vars.length?vars.map(v=>({key:`${p.id}::${v.id}`,productId:p.id,variantId:v.id,label:`${p.name} · ${v.name}`,stock:v.stock})): [{key:`${p.id}::`,productId:p.id,variantId:'',label:p.name,stock:p.stock}];});
}

const themeLabel = {system:'Sesuai perangkat',light:'Terang',dark:'Gelap'};
function resolvedTheme(mode){ return mode==='system' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : mode; }
function applyTheme(mode){
  const safe=['system','light','dark'].includes(mode)?mode:'system';
  localStorage.setItem('uply_theme',safe);
  document.documentElement.dataset.themeMode=safe;
  document.documentElement.dataset.theme=resolvedTheme(safe);
  const btn=$('#themeBtn'); if(btn){btn.textContent=safe==='light'?'☀':safe==='dark'?'☾':'◐';btn.title='Tema: '+themeLabel[safe];}
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((localStorage.getItem('uply_theme')||'system')==='system') applyTheme('system')});
function themeModal(){
  const current=localStorage.getItem('uply_theme')||'system';
  openModal('Tema tampilan',`<p class="tiny">Pilih tampilan yang paling nyaman. Pilihan akan disimpan di perangkat ini.</p><div class="theme-options">${[['system','◐','Sesuai perangkat','Mengikuti tema Windows, Android, iOS, atau browser.'],['light','☀','Terang','Tampilan putih dan cerah.'],['dark','☾','Gelap','Lebih nyaman di kondisi minim cahaya.']].map(([v,i,t,d])=>`<button type="button" class="theme-option ${current===v?'active':''}" data-theme-value="${v}"><b>${i}</b><span><strong>${t}</strong><small>${d}</small></span>${current===v?'<em>Aktif</em>':''}</button>`).join('')}</div>`);
}
function saveCart(){
  if(state.cart) localStorage.setItem('uply_cart',JSON.stringify(state.cart)); else localStorage.removeItem('uply_cart');
  updateCartUI();
}
function cartProduct(){ return state.cart ? state.catalog?.products?.find(p=>p.id===state.cart.productId) : null; }
function productVariant(p,variantId=''){ return p?.variants?.find(v=>v.id===variantId)||null; }
function cartVariant(){ const p=cartProduct(); return p&&state.cart?.variantId?productVariant(p,state.cart.variantId):null; }
function variantPrice(p,v){ return Number(v?.price ?? p?.price ?? 0); }
function variantStock(p,v){ return Number(v ? v.stock : p?.stock); }
function productPriceText(p){ return p?.hasVariants&&Number(p.priceMax)>Number(p.priceMin)?`${money(p.priceMin)} – ${money(p.priceMax)}`:money(p?.priceMin??p?.price); }
function updateCartUI(){
  const count=$('#cartCount'); if(count){const n=state.cart?.qty||0;count.textContent=n;count.hidden=!n;}
  const body=$('#cartDrawerBody'); if(body) body.innerHTML=cartHTML();
}
function cartHTML(){
  const p=cartProduct();
  if(!p) return `<div class="empty compact"><div class="cart-empty-icon">🛒</div><h3>Keranjang masih kosong</h3><p>Pilih produk yang kamu butuhkan lalu tambahkan ke keranjang.</p><button class="btn full" type="button" data-cart-shop>Mulai Belanja</button></div>`;
  const v=cartVariant();
  if(p.hasVariants && !v) return `<div class="empty compact"><h3>Varian perlu dipilih ulang</h3><p>Varian di keranjang sudah tidak tersedia. Pilih varian baru dari halaman produk.</p><button class="btn full" type="button" data-view-product="${esc(p.id)}">Pilih Varian</button></div>`;
  const stock=variantStock(p,v); const qty=Math.max(1,Math.min(Number(state.cart.qty)||1,stock>0?Number(stock):5));
  const unitPrice=variantPrice(p,v); const subtotal=unitPrice*qty;
  const voucher=(state.appliedVoucher?.productId===p.id&&Number(state.appliedVoucher.qty)===qty)?state.appliedVoucher:null;
  const discount=Number(voucher?.discount||0), total=Math.max(0,subtotal-discount);
  return `<div class="koala-cart-shell">
    <div class="cart-item koala-cart-item">
      <div class="cart-item-cover thumb-cart">${productThumb(p,'cart-thumb-img')}</div>
      <div class="cart-item-info"><small>${esc(p.category)}</small><strong>${esc(p.name)}</strong><span>${esc(v?.name||p.duration)}${v?.subtitle?` · ${esc(v.subtitle)}`:''}</span><div class="qty-control"><button type="button" data-cart-minus>−</button><b>${qty}</b><button type="button" data-cart-plus>+</button></div></div>
      <div class="cart-item-price"><button type="button" class="text-btn danger-text" data-cart-remove>Hapus</button><strong>${money(subtotal)}</strong></div>
    </div>
    <div class="koala-voucher">
      <label><span>🎁 Kode Voucher</span><div><input id="cartVoucher" placeholder="Masukkan kode voucher"><button type="button" data-cart-voucher>Pakai</button></div></label>
    </div>
    <div class="cart-summary">
      <div><span>Subtotal (${qty} item)</span><strong>${money(subtotal)}</strong></div>
      ${discount?`<div><span>Voucher ${esc(voucher.code)}</span><strong style="color:#079467">-${money(discount)}</strong></div>`:''}
      <div class="cart-total"><span>Total</span><strong>${money(total)}</strong></div>
      <button class="btn full" type="button" data-cart-checkout>Lanjut ke Checkout →</button>
      <button class="text-btn full" type="button" data-cart-close>Lanjutkan Belanja</button>
    </div>
  </div>`;
}
function openCart(){ updateCartUI(); const d=$('#cartDrawer'),b=$('#cartBackdrop'); if(d){d.classList.add('open');d.setAttribute('aria-hidden','false')} if(b){b.hidden=false;requestAnimationFrame(()=>b.classList.add('show'))} document.body.classList.add('drawer-open'); }
function closeCart(){ const d=$('#cartDrawer'),b=$('#cartBackdrop'); if(d){d.classList.remove('open');d.setAttribute('aria-hidden','true')} if(b){b.classList.remove('show');setTimeout(()=>b.hidden=true,180)} document.body.classList.remove('drawer-open'); }
function addToCart(productId,qty=1,variantId=''){
  const p=state.catalog?.products?.find(x=>x.id===productId); if(!p) return msg('Produk tidak ditemukan.');
  const v=p.hasVariants?productVariant(p,variantId):null;
  if(p.hasVariants&&!v) return msg('Pilih varian produk terlebih dahulu.');
  const stock=variantStock(p,v); if(stock===0)return msg('Varian yang dipilih sedang habis.');
  const max=stock>0?Math.min(5,Number(stock)):5; const q=Math.max(1,Math.min(Number(qty)||1,max));
  if(state.cart && (state.cart.productId!==productId||String(state.cart.variantId||'')!==String(variantId||''))) msg('Keranjang diganti dengan produk/varian yang baru dipilih.');
  if(!state.cart || state.cart.productId!==productId || String(state.cart.variantId||'')!==String(variantId||'') || Number(state.cart.qty)!==q) state.appliedVoucher=null;
  state.cart={productId,variantId:v?.id||'',qty:q}; saveCart(); openCart();
}

function msg(message){
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(msg.t);
  msg.t = setTimeout(() => toast.hidden = true, 4600);
}

function openModal(title, html){
  modalBody.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="x" data-close aria-label="Tutup">✕</button></div><div class="modal-content">${html}</div>`;
  if(!modal.open) modal.showModal();
}
function closeModal(){ if (modal.open) modal.close(); modal.classList.remove('admin-order-dialog'); }

modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
  if (e.target.closest('[data-close]')) closeModal();
});

function setAccount(){
  const b = $('#accountBtn');
  b.textContent = state.user ? (state.user.role === 'admin' ? 'Admin' : state.user.name.split(' ')[0]) : 'Masuk';
  applyTheme(localStorage.getItem('uply_theme')||'system');
  updateCartUI();
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

function icon(p){ return `<span class="mark">${({netflix:'N',youtube:'▶',ai:'AI',stars:'★'}[p.icon] || 'U')}</span>`; }
function defaultThumbFor(p){
  const id=String(p?.id||p?.productId||'').toLowerCase(); const name=String(p?.name||p?.productName||'').toLowerCase();
  if(id.includes('netflix')||name.includes('netflix')) return '/assets/products/netflix.svg';
  if(id.includes('google')||name.includes('google')||name.includes('gemini')) return '/assets/products/google-ai.svg';
  if(id.includes('youtube')||name.includes('youtube')) return '/assets/products/youtube.svg';
  if(id.includes('imei')||name.includes('imei')) return '/assets/products/imei.svg';
  if(id.includes('stars-19200')||name.includes('19.200')) return '/assets/products/stars-19200.svg';
  if(id.includes('stars-12800')||name.includes('12.800')) return '/assets/products/stars-12800.svg';
  if(id.includes('stars')||name.includes('facebook stars')) return '/assets/products/stars-6400.svg';
  return '/assets/products/default.svg';
}
function productThumb(p,cls='product-thumb-img'){ const fallback=defaultThumbFor(p); const src=esc(p.thumbnail||p.productThumbnail||fallback); return `<img class="${cls}" src="${src}" data-product-thumb data-fallback="${esc(fallback)}" alt="${esc(p.name||p.productName||'Produk Uply Digital')}" loading="lazy">`; }
function mediaKindLabel(kind){return ({benefit:'Benefit',warranty:'Garansi',claim:'Claim Garansi',activation:'Cara Aktivasi',tutorial:'Tutorial',info:'Informasi',other:'Lainnya'})[kind]||'Informasi';}
function productMediaThumb(m,cls='detail-mini-thumb'){return `<img class="${cls}" src="${esc(m.src||'/assets/products/default.svg')}" data-product-media-img data-media-id="${esc(m.id||'')}" alt="${esc(m.title||mediaKindLabel(m.kind))}" loading="lazy">`;}
document.addEventListener('error',e=>{ const img=e.target; if(!(img instanceof HTMLImageElement)) return; if(img.matches('[data-product-thumb]')){const fallback=img.dataset.fallback||'/assets/products/default.svg';if(img.dataset.fallbackTried==='1'){if(!img.src.endsWith('/assets/products/default.svg'))img.src='/assets/products/default.svg';return;}img.dataset.fallbackTried='1';img.src=fallback;return;} if(img.matches('[data-product-media-img]')&&img.dataset.mediaFallback!=='1'){img.dataset.mediaFallback='1';img.src='/assets/products/default.svg';}},true);
function status(s){ return `<span class="status ${esc(s)}">${esc(statusLabel[s] || s)}</span>`; }
function inventoryStatus(s){ return `<span class="status inv-${esc(s)}">${esc(inventoryStatusLabel[s] || s)}</span>`; }

function hero(){
  const products = state.catalog?.products || [];
  const accountCta = state.user
    ? `<a class="koala-hero-secondary" href="${state.user.role==='admin'?'#admin':'#dashboard'}">${state.user.role==='admin'?'Panel Admin':'Dashboard Saya'}</a>`
    : `<button class="koala-hero-secondary" type="button" data-open-register>Daftar Gratis</button>`;
  return `<section class="koala-home-hero">
    <div class="koala-dot-bg"></div>
    <div class="wrap koala-hero-inner">
      <div class="koala-hero-kicker">✦ PROVIDER PRODUK DIGITAL</div>
      <h1>Dapatkan <span>Premium Digital</span><br>dengan Harga Terbaik</h1>
      <p>Nikmati produk digital pilihan untuk streaming, produktivitas, top up, dan kebutuhan lainnya dengan proses yang mudah serta dukungan admin.</p>
      <div class="koala-hero-actions">
        <button class="koala-hero-primary" type="button" data-scroll-products>Lihat Produk</button>
        ${accountCta}
      </div>
      <div class="koala-hero-stats">
        <span><b>${Math.max(24,products.length)}</b><small>Produk Digital</small></span>
        <span><b>Fast</b><small>Proses Pesanan</small></span>
        <span><b>Support</b><small>Bantuan Admin</small></span>
      </div>
    </div>
  </section>`;
}
function productCards(){
  const arr = state.catalog.products.filter(p =>
    (state.filter === 'Semua' || p.category === state.filter) &&
    `${p.name} ${p.category} ${p.duration}`.toLowerCase().includes(state.search.toLowerCase())
  );
  if (!arr.length) return `<div class="empty market-empty" style="grid-column:1/-1"><b>⌕</b><h3>Produk tidak ditemukan</h3><p>Coba kata kunci atau kategori lainnya.</p></div>`;
  return arr.map((p,i) => {
    const sold = p.bestSeller ? (12000 + i*947) : (1800 + i*613);
    const stock=p.stock===0?'<span class="market-stock is-off">● Habis</span>':p.stock>0&&p.stock<=3?`<span class="market-stock is-low">● Sisa ${p.stock}</span>`:'<span class="market-stock">● Tersedia</span>';
    const badge=p.bestSeller?'TERLARIS':(p.badge|| (i%2===0?'HOT':'POPULER'));
    const benefits=(p.benefits||[]).slice(0,3);
    return `<article class="market-card" style="--delay:${Math.min(i,8)*45}ms">
      <button class="market-media" type="button" data-view-product="${esc(p.id)}" aria-label="Lihat ${esc(p.name)}">
        ${productThumb(p,'market-thumb')}
        <span class="market-promo">✦ s.d. -${Math.min(5,2+(i%4))}K</span>
        <span class="market-badge">★ ${esc(badge)}</span>
        ${stock}
      </button>
      <div class="market-card-body">
        <span class="market-category">${esc(p.category)}</span>
        <h3>${esc(p.name)}</h3>
        <div class="market-social"><span>★ 0</span><span>♙ ${new Intl.NumberFormat('id-ID',{notation:'compact'}).format(sold)}</span></div>
        <div class="market-features">${benefits.map(x=>`<span>${esc(truncate(x,26))}</span>`).join('')}${benefits.length>2?'<em>+2</em>':''}</div>
        <div class="market-price">${productPriceText(p)}</div>
        <button class="market-buy" type="button" data-view-product="${esc(p.id)}" ${p.stock===0?'disabled':''}>Beli Sekarang</button>
      </div>
    </article>`;
  }).join('');
}
function valueSection(){
  return `<section class="value-section"><div class="wrap"><div class="section-kicker">Kenapa Uply Digital?</div><div class="value-grid">
    <article><span>01</span><h3>Praktis</h3><p>Pilih produk dan selesaikan checkout tanpa alur yang berbelit.</p></article>
    <article><span>02</span><h3>Transparan</h3><p>Status pesanan bisa dipantau langsung dari akun pelanggan.</p></article>
    <article><span>03</span><h3>Siap membantu</h3><p>Kalau butuh bantuan, admin tetap tersedia untuk proses yang memerlukan pengecekan.</p></article>
  </div></div></section>`;
}

function categoryIcon(name){
  const n=String(name||'').toLowerCase();
  if(n.includes('stream')) return '▶';
  if(n.includes('ai')||n.includes('produkt')) return '✦';
  if(n.includes('top')) return '★';
  if(n.includes('perangkat')) return '◇';
  return '▦';
}
function popularCategories(){
  const counts={}; for(const p of state.catalog.products) counts[p.category]=(counts[p.category]||0)+1;
  const cats=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!cats.length) return '';
  const iconMap={
    'Streaming':'▶','AI & Produktivitas':'✦','Top Up':'★','Perangkat':'◇',
    'Digital':'▦','Productivity Tools':'▣','Security':'◇','Music Streaming':'♫',
    'Creative':'✎','Entertainment':'▤'
  };
  return `<section class="koala-category-section"><div class="wrap">
    <div class="koala-section-title"><span>KATEGORI POPULER</span><h2>Jelajahi kategori produk digital</h2><p>Temukan produk sesuai kebutuhanmu.</p></div>
    <div class="koala-category-grid">${cats.map(([c,n])=>`<button type="button" class="koala-category-card" data-filter="${esc(c)}"><b>${iconMap[c]||categoryIcon(c)}</b><strong>${esc(c)}</strong><small>${n} produk</small></button>`).join('')}</div>
  </div></section>`;
}
function trustStrip(){
  return `<section class="koala-benefit-section"><div class="wrap">
    <div class="koala-section-title center"><span>BENEFIT EKSKLUSIF</span><h2>Keuntungan yang Akan Anda Dapatkan</h2><p>Nikmati pengalaman belanja digital yang lebih mudah, aman, dan transparan di Uply Digital.</p></div>
    <div class="koala-benefit-grid">
      <article><b>◉</b><h3>Harga lebih hemat</h3><p>Produk digital pilihan dengan harga yang jelas sebelum checkout.</p></article>
      <article><b>◇</b><h3>Proses lebih ringkas</h3><p>Alur pembelian dibuat sederhana dari pilih produk sampai pesanan diproses.</p></article>
      <article><b>✓</b><h3>Status transparan</h3><p>Pantau status order langsung dari dashboard pelanggan.</p></article>
      <article><b>☏</b><h3>Support admin</h3><p>Bantuan admin tersedia untuk proses manual maupun kendala pesanan.</p></article>
    </div>
  </div></section>`;
}
function promoSection(){
  return `<section class="koala-platform"><div class="wrap">
    <div class="koala-platform-card">
      <span class="koala-dark-kicker">UNTUK TOKO DIGITAL</span>
      <h2>Kelola kebutuhan digitalmu dalam satu tempat.</h2>
      <p>Belanja produk, pantau pesanan, cek status pembayaran, dan kelola akun melalui dashboard Uply Digital.</p>
      <div class="koala-platform-chips"><span>✓ Dashboard pelanggan</span><span>✓ Status pesanan real-time</span><span>✓ Pembayaran terintegrasi</span><span>✓ Dukungan admin</span></div>
      <button class="koala-yellow-btn" type="button" data-scroll-products>Lihat Produk Lengkap →</button>
    </div>
  </div></section>`;
}
function socialProofSection(){
  return `<section class="koala-blog-section"><div class="wrap">
    <div class="koala-section-title center"><span>BLOG & ARTIKEL</span><h2>Tetap Update dengan Artikel Terbaru</h2><p>Tips singkat seputar produk digital, keamanan akun, dan cara menggunakan layanan premium dengan lebih nyaman.</p></div>
    <div class="koala-blog-grid">
      <article><div class="koala-blog-cover">UPLY<br>DIGITAL</div><small>Tips Digital</small><h3>Cara menjaga akun premium tetap aman</h3><p>Gunakan password unik, hindari membagikan OTP, dan cek perangkat yang sedang login.</p><a href="#bantuan">Baca Selengkapnya →</a></article>
      <article><div class="koala-blog-cover alt">BELANJA<br>AMAN</div><small>Panduan</small><h3>Kenali alur pesanan sebelum checkout</h3><p>Pelajari status pembayaran, pemrosesan, sampai pesanan selesai dari dashboard.</p><a href="#bantuan">Baca Selengkapnya →</a></article>
      <article><div class="koala-blog-cover dark">SUPPORT<br>UPLY</div><small>Bantuan</small><h3>Apa yang harus dilakukan jika order terkendala?</h3><p>Siapkan ID pesanan dan hubungi support agar proses pengecekan lebih cepat.</p><a href="#bantuan">Baca Selengkapnya →</a></article>
    </div>
  </div></section>`;
}
function faqSection(){
  return `<section class="koala-faq"><div class="wrap">
    <div class="koala-section-title center"><span>FAQ</span><h2>Pertanyaan yang Sering Diajukan</h2><p>Temukan jawaban untuk pertanyaan umum sebelum melakukan pembelian.</p></div>
    <div class="koala-faq-list">
      <details><summary><span><b>Pembelian</b> Bagaimana cara pembelian dan pembayaran?</span><em>⌄</em></summary><p>Pilih produk, masuk ke akun, isi data checkout, lalu selesaikan pembayaran yang tersedia. Status order akan tampil di menu Pesanan.</p></details>
      <details><summary><span><b>Keamanan</b> Apakah produk aman digunakan?</span><em>⌄</em></summary><p>Setiap produk memiliki ketentuan masing-masing. Baca deskripsi dan ketentuan sebelum membeli. Jangan pernah membagikan OTP, PIN, atau recovery code.</p></details>
      <details><summary><span><b>Garansi</b> Berapa lama masa aktif dan garansi?</span><em>⌄</em></summary><p>Durasi dan ketentuan garansi ditampilkan pada detail produk dan dapat berbeda untuk setiap layanan.</p></details>
      <details><summary><span><b>Support</b> Bagaimana jika mengalami kendala?</span><em>⌄</em></summary><p>Hubungi support Uply Digital dan sertakan ID pesanan agar admin dapat melakukan pengecekan lebih cepat.</p></details>
      <details><summary><span><b>Harga</b> Mengapa harga produk dapat berubah?</span><em>⌄</em></summary><p>Harga mengikuti ketersediaan produk, provider, dan promo yang sedang berlaku.</p></details>
    </div>
  </div></section>`;
}
function catalogPage(){
  const cats = ['Semua', ...new Set(state.catalog.products.map(p=>p.category))];
  return hero()+`<section id="produk" class="koala-products-section"><div class="wrap">
    <div class="koala-section-title center"><span>PRODUK DIGITAL PREMIUM</span><h2>Koleksi Produk Premium dengan Harga Terjangkau</h2><p>Pilih produk digital premium dari berbagai kategori. Informasi stok, benefit, dan harga ditampilkan secara transparan.</p></div>
    <div class="koala-filter-row">${cats.slice(0,7).map(c=>`<button class="koala-filter ${state.filter===c?'active':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="koala-search-row"><div class="koala-search"><span>⌕</span><input id="search" placeholder="Cari produk digital…" value="${esc(state.search)}"></div><span>${state.catalog.products.length} produk tersedia</span></div>
    ${state.catalog.settings.notice?`<div class="notice">${esc(state.catalog.settings.notice)}</div>`:''}
    ${!state.catalog.settings.storeOpen?`<div class="notice warn">Toko sedang menutup pesanan baru.</div>`:''}
    <div class="grid product-grid-v11 v18-product-grid koala-product-grid" id="productGrid">${productCards()}</div>
    <div class="koala-more"><button class="koala-yellow-btn" type="button" data-scroll-products>✦ Lihat Semua Produk</button><small>Menampilkan produk digital yang tersedia di Uply Digital.</small></div>
  </div></section>`+promoSection()+trustStrip()+socialProofSection()+faqSection()+popularCategories();
}
function helpPage(){
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Bantuan</div><h1>Belanja lebih jelas.</h1><p>Pembayaran bisa transfer manual atau otomatis melalui Midtrans Snap, tergantung pengaturan toko.</p></div>
  <div class="guide-grid">
    <div class="panel guide-card"><b>01</b><h3>Buat akun</h3><p>Daftar sekali menggunakan email dan password.</p></div>
    <div class="panel guide-card"><b>02</b><h3>Pilih & checkout</h3><p>Pilih produk, isi kontak penerima, lalu buat pesanan.</p></div>
    <div class="panel guide-card"><b>03</b><h3>Bayar & pantau</h3><p>Selesaikan pembayaran lalu pantau status sampai produk diterima.</p></div>
  </div></div></section>`;
}

function paymentMethodsPage(){
  const methods=state.catalog?.paymentMethods||[]; const banks=state.catalog?.banks||[]; const s=state.catalog?.settings||{};
  const cards=methods.map(m=>{let body='';if(m.id==='midtrans')body='<p>Pembayaran otomatis melalui Midtrans. Channel yang tampil mengikuti metode yang aktif pada akun merchant.</p>';else if(m.id==='qris_manual')body=`<p>Scan QRIS Uply Digital, bayar sesuai nominal invoice, lalu upload bukti pembayaran.</p>${s.qrisManualReady?'<img class="payment-page-qris" src="/api/qris-image" alt="QRIS Uply Digital">':''}`;else if(m.id==='manual')body=`<p>Transfer manual ke salah satu rekening berikut.</p><div class="payment-bank-list">${banks.map(b=>`<div><strong>${esc(b.name)}</strong><span>${esc(b.number)}</span><small>${esc(b.holder)}</small></div>`).join('')}</div>`;else if(m.id==='balance')body='<p>Gunakan Saldo Uply yang tersedia di akun. Saldo dapat dipakai sebagian atau seluruhnya saat checkout.</p>';return `<article class="payment-info-card"><div class="payment-info-icon">${m.id==='midtrans'?'⚡':m.id==='qris_manual'?'▣':m.id==='balance'?'S':'B'}</div><div><h3>${esc(m.label)}</h3><span class="payment-type-chip">${esc(m.type)}</span>${body}</div></article>`}).join('');
  return `<section class="page payment-page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Metode Pembayaran</div><h1>Pilih cara bayar yang paling nyaman.</h1><p>Halaman ini khusus informasi pembayaran dan tidak lagi diarahkan ke halaman Bantuan.</p></div><div class="payment-info-grid">${cards||'<div class="notice warn">Belum ada metode pembayaran aktif. Hubungi admin.</div>'}</div><div class="panel payment-security"><h2>Keamanan pembayaran</h2><p>Selalu cocokkan nominal dan ID pesanan sebelum membayar. Untuk pembayaran manual, unggah bukti dari halaman detail pesanan.</p><a class="btn light" href="#bantuan">Buka Pusat Bantuan</a></div></div></section>`;
}

function warrantyCenterPage(){
  if(!state.user||state.user.role!=='user') return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Garansi</div><h1>Pusat Klaim Garansi</h1><p>Masuk untuk melihat masa garansi dan mengajukan klaim.</p></div><div class="panel" style="max-width:520px"><button class="btn full" data-open-login>Masuk pelanggan</button></div></div></section>`;
  const completed=state.orders.filter(o=>o.status==='completed');
  const eligible=completed.filter(o=>futureDate(o.warrantyUntil)); const expired=completed.filter(o=>o.warrantyUntil&&!futureDate(o.warrantyUntil));
  const claimCards=(state.claims||[]).map(c=>`<article class="claim-card"><div><small>${esc(c.id)}</small><h3>${esc(c.productName)}</h3><p>${esc(c.variantName||'')}</p></div><span class="claim-status ${esc(c.status)}">${esc(claimStatusLabel[c.status]||c.status)}</span><div class="claim-meta"><span>${esc(claimCategoryLabel[c.category]||c.category)}</span><span>${dt(c.createdAt)}</span></div>${c.adminNote?`<div class="notice"><strong>Catatan admin</strong><br>${esc(c.adminNote)}</div>`:''}</article>`).join('');
  const warrantyCards=eligible.map(o=>`<article class="warranty-order-card"><div class="warranty-product"><img src="${esc(o.productThumbnail||'/assets/products/default.svg')}" alt=""><div><small>${esc(o.id)}</small><strong>${esc(o.productName)}</strong><span>${esc(o.variantName||o.duration)}</span></div></div><div class="warranty-expire"><span>Garansi aktif sampai</span><strong>${new Date(o.warrantyUntil).toLocaleDateString('id-ID',{dateStyle:'medium'})}</strong><small>${o.warrantyDays} hari</small></div><button class="btn small" type="button" data-new-claim="${esc(o.id)}">Ajukan Klaim</button></article>`).join('');
  return `<section class="page warranty-page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Warranty Center</div><h1>Klaim garansi lebih rapi.</h1><p>Gunakan ID pesanan, jelaskan kendala, dan upload screenshot. Semua progress tersimpan di akun.</p></div><div class="warranty-stats"><article><span>Garansi aktif</span><strong>${eligible.length}</strong></article><article><span>Klaim aktif</span><strong>${(state.claims||[]).filter(c=>!['rejected','resolved'].includes(c.status)).length}</strong></article><article><span>Garansi berakhir</span><strong>${expired.length}</strong></article></div><div class="panel"><div class="panel-title"><div><h2>Pesanan bergaransi</h2><p>Hanya pesanan selesai dengan garansi aktif yang dapat diklaim.</p></div></div><div class="warranty-order-list">${warrantyCards||'<div class="empty compact">Belum ada pesanan dengan garansi aktif.</div>'}</div></div><div class="panel"><div class="panel-title"><div><h2>Riwayat klaim</h2><p>Pantau balasan dan status penanganan admin.</p></div></div><div class="claim-list">${claimCards||'<div class="empty compact">Belum ada klaim garansi.</div>'}</div></div></div></section>`;
}

function claimModal(orderId){
  const o=state.orders.find(x=>x.id===orderId); if(!o)return;
  openModal('Ajukan Klaim Garansi',`<form id="claimForm" data-order-id="${esc(o.id)}"><div class="notice"><strong>${esc(o.productName)}</strong><br>${esc(o.variantName||o.duration)} · Garansi sampai ${o.warrantyUntil?new Date(o.warrantyUntil).toLocaleDateString('id-ID',{dateStyle:'medium'}):'-'}</div><label class="field">Jenis kendala<select name="category">${Object.entries(claimCategoryLabel).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label class="field">Jelaskan kendala<textarea name="description" minlength="10" maxlength="1800" required placeholder="Contoh: akun tidak dapat login sejak hari ini, sudah mencoba ulang aplikasi."></textarea></label><label class="field">Screenshot kendala <small>Opsional</small><input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG/PNG/WebP maksimal ±1,3 MB.</small></label><div class="notice warn"><strong>Jangan kirim OTP, PIN, recovery code, atau kode 2FA.</strong></div><button class="btn full" type="submit">Kirim Klaim</button></form>`);
}

function loginForm(admin=false){
  if (admin) return `<form id="adminLogin"><label class="field">Email admin<input name="email" type="email" required autocomplete="username"></label><label class="field">Password admin<input name="password" type="password" required minlength="8" autocomplete="current-password"></label><button class="btn full" type="submit">Masuk Panel Admin</button></form>`;
  return `<form id="userLogin"><label class="field">Email<input name="email" type="email" required autocomplete="email"></label><label class="field">Password<input name="password" type="password" required minlength="8" autocomplete="current-password"></label><button class="btn full" type="submit">Masuk</button><p class="tiny center">Belum punya akun? <button type="button" class="text-btn" data-register>Daftar akun</button></p></form>`;
}

function registerForm(){
  return `<form id="register"><label class="field">Nama<input name="name" required minlength="2"></label><label class="field">Email<input name="email" type="email" required></label><label class="field">Password<input name="password" type="password" required minlength="8"></label><label class="field">Ulangi password<input name="password2" type="password" required minlength="8"></label><button class="btn full" type="submit">Daftar & Masuk</button></form>`;
}

function accountModal(){
  if (!state.user){ openModal('Masuk ke Uply Digital', loginForm(false)); return; }
  const userActions=state.user.role==='admin'
    ? `<a class="btn" href="#admin" data-close>Panel Admin</a>`
    : `<a class="btn" href="#dashboard" data-close>Dashboard Saya</a><a class="btn light" href="#pesanan" data-close>Pesanan Saya</a><a class="btn light" href="#akun" data-close>Kelola Akun</a>`;
  openModal('Akun Uply Digital', `<div class="account-summary"><div class="account-avatar">${esc((state.user.name||'U').slice(0,1).toUpperCase())}</div><div><strong>${esc(state.user.name)}</strong><small>${esc(state.user.email)}</small></div></div><div class="stack account-actions">${userActions}<button class="btn danger" data-logout>Keluar dari akun</button></div>`);
}
function productModal(id){
  const p = state.catalog.products.find(x=>x.id===id); if(!p) return;
  const unavailable = !state.catalog.settings.storeOpen || p.stock===0;
  const reason = !state.catalog.settings.storeOpen ? 'Toko sedang menutup pesanan baru.' : p.stock===0 ? 'Stok produk sedang habis.' : 'Kamu bisa lanjut ke checkout.';
  openModal(p.name, `<div class="cover ${esc(p.icon)} modal-cover">${icon(p)}<strong>${esc(p.duration)}</strong></div><p>${esc(p.description)}</p><ul class="benefits">${(p.benefits||[]).map(x=>`<li>✓ ${esc(x)}</li>`).join('')}</ul><div class="notice"><strong>Ketentuan</strong><br>${esc(p.terms)}</div><div class="checkout-ready ${unavailable?'is-off':''}">${esc(reason)}</div><div class="card-foot"><div><div class="price">${money(p.price)}</div><div class="tiny">${p.stock===-1?'Stok tersedia':p.stock>0?`Stok ${p.stock}`:'Stok habis'}</div></div><button class="btn" data-checkout="${esc(p.id)}" ${unavailable?'disabled':''}>Lanjut checkout</button></div>`);
}
function productDetailPage(id){
  const p=state.catalog.products.find(x=>x.id===id);
  if(!p) return `<section class="page"><div class="wrap empty"><h2>Produk tidak ditemukan</h2><a class="btn" href="#katalog">Kembali ke produk</a></div></section>`;
  const variants=p.variants||[];
  const firstVariant=variants.find(v=>Number(v.stock)!==0)||variants[0]||null;
  const selectedStock=variantStock(p,firstVariant), selectedPrice=variantPrice(p,firstVariant);
  const stockText=selectedStock===-1?'Stok tersedia':selectedStock>0?`${selectedStock} unit tersedia`:'Stok habis';
  const maxQty=selectedStock>0?Math.max(1,Math.min(5,selectedStock)):5;
  const unavailable=!state.catalog.settings.storeOpen||(p.hasVariants?!variants.some(v=>Number(v.stock)!==0):p.stock===0);
  const variantList=p.hasVariants?`<div class="variant-section"><div class="v18-block-head"><strong>Pilih varian</strong><span>${variants.filter(v=>Number(v.stock)!==0).length} varian tersedia</span></div><div class="variant-list">${variants.map((v,i)=>{const sold=Number(v.stock)===0;const save=Number(v.compareAtPrice)>Number(v.price)?Number(v.compareAtPrice)-Number(v.price):0;return `<label class="variant-card ${sold?'soldout':''} ${v.id===firstVariant?.id?'selected':''}"><input type="radio" name="detailVariant" value="${esc(v.id)}" data-price="${v.price}" data-stock="${v.stock}" data-name="${esc(v.name)}" ${v.id===firstVariant?.id?'checked':''} ${sold?'disabled':''}><span class="variant-radio"></span><span class="variant-copy"><b>${esc(v.name)}</b><small>${esc(v.subtitle||'Paket digital Uply')}</small><em>${v.stock===-1?'Stok tersedia':sold?'Stok Habis':`${v.stock} unit tersedia`}</em></span><span class="variant-price"><strong>${money(v.price)}</strong>${v.compareAtPrice>v.price?`<del>${money(v.compareAtPrice)}</del>`:''}</span>${sold?'<i class="variant-badge sold">Stok Habis</i>':v.badge?`<i class="variant-badge">${esc(v.badge)}</i>`:save?`<i class="variant-badge">Hemat ${money(save)}</i>`:''}</label>`}).join('')}</div></div>`:`<div class="v18-package-block"><div class="v18-block-head"><strong>Pilih paket</strong><span>${esc(stockText)}</span></div><label class="v18-package selected"><input type="radio" checked><span><b>${esc(p.duration)}</b><small>${esc((p.benefits||[])[0]||'Paket digital Uply')}</small></span><strong>${money(p.price)}</strong></label></div>`;
  return `<section class="page v18-detail-page"><div class="wrap">
    <div class="breadcrumb v18-breadcrumb"><a href="#katalog">Beranda</a><span>›</span><a href="#katalog">${esc(p.category)}</a><span>›</span><b>${esc(p.name)}</b></div>
    <div class="v18-detail-grid">
      <div class="v18-detail-media">${(()=>{const gallery=(p.gallery||[]).filter(x=>x.active!==false);const mainSrc=esc(p.thumbnail||defaultThumbFor(p));const thumbs=[`<button class="active" type="button" data-gallery-select data-src="${mainSrc}" data-title="${esc(p.name)}" data-caption="Thumbnail utama produk">${productThumb(p,'detail-mini-thumb')}<small>Produk</small></button>`,...gallery.map(m=>`<button type="button" data-gallery-select data-src="${esc(m.src)}" data-title="${esc(m.title||mediaKindLabel(m.kind))}" data-caption="${esc(m.caption||'')}">${productMediaThumb(m)}<small>${esc(m.title||mediaKindLabel(m.kind))}</small></button>`)].join('');return `<div class="v18-main-shot"><img id="detailGalleryMain" class="detail-main-thumb" src="${mainSrc}" data-product-thumb data-fallback="${esc(defaultThumbFor(p))}" alt="${esc(p.name)}"><span class="v18-badge">${esc(p.bestSeller?'Best Seller':(p.badge||'Pilihan Uply'))}</span></div><div class="v18-mini-gallery ${gallery.length?'has-media':''}">${thumbs}</div><div id="detailGalleryInfo" class="v18-gallery-info"><strong>${esc(p.name)}</strong><small>Geser/pilih gambar untuk melihat benefit, tutorial aktivasi, atau cara claim garansi.</small></div>`})()}<div class="v18-media-note"><b>🔒</b><span><strong>Transaksi lebih aman</strong><small>Data pesanan tersimpan di akun pelanggan.</small></span></div></div>
      <div class="v18-detail-info">
        <div class="v18-detail-category"><span>${esc(p.category)}</span><span class="v18-rating">★ 4.9 <small>Produk Uply</small></span></div>
        <h1>${esc(p.name)}</h1><p class="v18-detail-desc">${esc(p.description)}</p>
        <div class="v18-feature-cards">${(p.benefits||[]).slice(0,4).map((x,i)=>`<article><b>${['✓','⚡','◆','◈'][i]||'✓'}</b><span>${esc(x)}</span></article>`).join('')}</div>
        ${p.requiresLoginCredentials?'<div class="notice warn"><strong>Proses manual via login.</strong><br>Data login diminta saat checkout dan disimpan terenkripsi. Jangan pernah kirim OTP, recovery code, PIN, atau kode 2FA.</div>':''}
        ${variantList}
        <div class="v18-buy-box"><div><small>Harga</small><strong id="detailPrice">${money(selectedPrice)}</strong><span id="detailStock" class="${selectedStock===0?'stock-out':'v18-stock'}">● ${esc(stockText)}</span></div><div class="qty-control"><button type="button" data-detail-minus>−</button><b id="detailQty">1</b><button type="button" data-detail-plus data-max="${maxQty}">+</button></div><button class="btn dark" type="button" data-add-cart="${esc(p.id)}" ${unavailable?'disabled':''}>+ Keranjang</button><button class="btn" type="button" data-order-now="${esc(p.id)}" ${unavailable?'disabled':''}>Beli Sekarang →</button></div>
        <div class="v18-purchase-trust"><span>✓ Status order jelas</span><span>✓ Support admin</span><span>✓ Ketentuan transparan</span>${p.warrantyDays>0?`<span>✓ Garansi hingga ${p.warrantyDays} hari</span>`:''}</div>
      </div>
    </div>
    <div class="v18-detail-lower"><section class="panel v18-description"><span class="v18-mini-kicker">Tentang produk</span><h2>Detail ${esc(p.name)}</h2><p>${esc(p.description)}</p><h3>Yang kamu dapatkan</h3><div class="v18-benefit-list">${(p.benefits||[]).map(x=>`<span>✓ ${esc(x)}</span>`).join('')}</div><div class="notice"><strong>Ketentuan & Garansi</strong><br>${esc(p.terms)}</div></section><aside class="panel v18-side-faq"><span class="v18-mini-kicker">Sebelum membeli</span><h3>Informasi penting</h3><details open><summary>Bagaimana prosesnya?</summary><p>Setelah pembayaran terverifikasi, order masuk ke tahap pemrosesan sesuai jenis produk.</p></details><details><summary>Bagaimana melihat status?</summary><p>Buka Dashboard atau Pesanan Saya setelah login.</p></details><details><summary>Butuh bantuan?</summary><p>Gunakan tombol support di website dan sertakan ID pesanan.</p></details></aside></div>
  </div></section>`;
}
function checkoutPage(id,variantId=''){
  const p = state.catalog.products.find(x=>x.id===id);
  if(!p) return `<section class="page"><div class="wrap empty"><h2>Produk tidak tersedia</h2><p>Produk mungkin sudah dinonaktifkan.</p><a class="btn" href="#katalog">Kembali ke produk</a></div></section>`;
  const v=p.hasVariants?productVariant(p,variantId||state.checkoutVariantId):null;
  if(p.hasVariants&&!v) return `<section class="page"><div class="wrap empty"><h2>Pilih varian terlebih dahulu</h2><p>Produk ini memiliki beberapa pilihan harga dan stok.</p><a class="btn" href="#produk/${encodeURIComponent(p.id)}">Pilih Varian</a></div></section>`;
  state.checkoutVariantId=v?.id||'';
  const stock=variantStock(p,v),unitPrice=variantPrice(p,v);
  if(!state.catalog.settings.storeOpen) return `<section class="page"><div class="wrap empty"><h2>Checkout sedang ditutup</h2><p>Admin sedang menutup pesanan baru.</p><a class="btn" href="#katalog">Kembali ke katalog</a></div></section>`;
  if(stock===0) return `<section class="page"><div class="wrap empty"><h2>Stok varian sedang habis</h2><p>Pilih varian atau produk lain.</p><a class="btn" href="#produk/${encodeURIComponent(p.id)}">Pilih varian lain</a></div></section>`;
  if(!state.user || state.user.role!=='user'){
    state.pendingCheckout = id; state.pendingVariantId=v?.id||'';
    return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Checkout</div><h1>Masuk untuk melanjutkan</h1><p>Checkout hanya menggunakan akun pelanggan agar pesanan dapat dipantau.</p></div><div class="panel" style="max-width:520px"><button class="btn full" data-checkout-login="${esc(id)}" data-variant-id="${esc(v?.id||'')}">Masuk / Daftar Pelanggan</button></div></div></section>`;
  }
  if(state.appliedVoucher?.productId!==p.id || String(state.appliedVoucher?.variantId||'')!==String(v?.id||'')) state.appliedVoucher=null;
  const methods=(state.catalog.paymentMethods||[]).filter(m=>m.id!=='balance');
  const maxQty = stock > 0 ? Math.max(1, Math.min(5, Number(stock))) : 5;
  const initialQty=Math.max(1,Math.min(maxQty,Number(state.checkoutQty||1)));
  const firstMethod=methods[0]?.id||'';
  const payCards=methods.map((m,i)=>`<label class="payment-option smart-pay-card"><input type="radio" name="paymentMethod" value="${esc(m.id)}" ${i===0?'checked':''}><span><b><i class="pay-mark ${esc(m.id)}">${m.id==='midtrans'?'M':m.id==='qris_manual'?'QR':'B'}</i>${esc(m.label)}</b><small>${m.id==='midtrans'?'Otomatis: status dibaca dari gateway dan webhook.':m.id==='qris_manual'?'Scan QRIS toko lalu upload bukti pembayaran.':'Transfer ke rekening toko lalu upload bukti.'}</small></span><em>${m.id==='midtrans'?'Otomatis':'Manual'}</em></label>`).join('');
  const bankBlock=state.catalog.banks?.length?`<div class="payment-subpanel" data-pay-panel="manual" ${firstMethod!=='manual'?'hidden':''}><small>Pilih rekening tujuan</small>${state.catalog.banks.map((b,i)=>`<label class="payment-option"><input type="radio" name="bankId" value="${esc(b.id)}" ${i===0?'checked':''}><span><b>${esc(b.name)}</b><small>${esc(b.number)} · ${esc(b.holder)}</small></span></label>`).join('')}</div>`:'';
  const qrisBlock=`<div class="payment-subpanel qris-checkout-box" data-pay-panel="qris_manual" ${firstMethod!=='qris_manual'?'hidden':''}><img src="/api/qris-image?v=${Date.now()}" alt="QRIS Uply Digital"><div><strong>${esc(state.catalog.settings.qrisName||'QRIS Manual')}</strong><small>Bayar sesuai nominal yang tertera lalu upload bukti dari detail pesanan.</small></div></div>`;
  const subtotal=unitPrice*initialQty, discount=state.appliedVoucher?.discount||0;
  const balance=Number(state.user.balance||0);
  const externalReady=methods.length>0;
  return `<section class="page checkout-page"><div class="wrap checkout-wrap"><a class="breadcrumb" href="#produk/${encodeURIComponent(p.id)}">← Kembali ke Produk</a><div class="checkout-title"><div><div class="section-kicker">Checkout Uply Digital</div><h1>Selesaikan pesananmu</h1><p>Voucher, saldo, dan metode pembayaran diproses server-side agar nominal tetap aman.</p></div><span class="checkout-secure">🔒 Checkout aman</span></div>
    <form id="checkoutForm" data-product-id="${esc(p.id)}" data-variant-id="${esc(v?.id||'')}" class="checkout-layout">
      <div class="stack">
        <section class="checkout-section panel"><div class="section-label">METODE PEMBAYARAN</div>${payCards||'<div class="notice warn">Belum ada metode pembayaran eksternal aktif. Kamu tetap dapat checkout jika saldo Uply mencukupi seluruh total.</div>'}${bankBlock}${qrisBlock}</section>
        <section class="checkout-section panel voucher-checkout"><div class="section-label">VOUCHER & SALDO</div><label class="field">Kode voucher<div class="inline-action"><input id="checkoutVoucher" name="voucherCode" value="${esc(state.appliedVoucher?.code||'')}" placeholder="Contoh: UPLY10"><button type="button" class="btn light small" data-checkout-voucher>Terapkan</button></div><small id="voucherHint">${state.appliedVoucher?`Voucher ${esc(state.appliedVoucher.code)} aktif · hemat ${money(state.appliedVoucher.discount)}`:'Voucher akan diverifikasi ke server sebelum digunakan.'}</small></label>${state.catalog.settings.balancePaymentEnabled?`<label class="balance-toggle"><input type="checkbox" name="useBalance" id="useBalance" ${balance>0?'':'disabled'}><span><b>Gunakan Saldo Uply</b><small>Saldo tersedia: ${money(balance)}</small></span></label>`:''}</section>
${p.requiresLoginCredentials?`<section class="checkout-section panel credential-section"><div class="section-label">LOGIN AKUN UNTUK PROSES TOP UP</div><div class="credential-notice"><strong>Proses manual oleh admin</strong><p>Masukkan email dan password akun tujuan. Data disimpan terenkripsi dan dihapus otomatis setelah pesanan selesai/dibatalkan.</p><b>Jangan masukkan OTP, recovery code, PIN keamanan, atau kode 2FA.</b></div><label class="field">Email login akun<input name="accountEmail" type="email" autocomplete="off" required placeholder="email akun tujuan"></label><label class="field">Password akun<input name="accountPassword" type="password" autocomplete="new-password" required minlength="4" maxlength="200" placeholder="Password akun tujuan"></label></section>`:''}
        <section class="checkout-section panel"><div class="section-label">KONTAK</div><div class="row"><label class="field">Nama Lengkap<input name="name" required minlength="2" maxlength="80" value="${esc(state.user.name)}"></label><label class="field">Email<input value="${esc(state.user.email)}" readonly><small>Email dari akun Uply Digital.</small></label></div><label class="field">WhatsApp<input name="phone" type="tel" maxlength="24" placeholder="Contoh: 081234567890"><small>Wajib jika detail dikirim melalui WhatsApp.</small></label><label class="field">Kirim detail melalui<select name="channel" id="checkoutChannel"><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select></label><label class="field">Catatan untuk admin <small>Opsional</small><textarea name="customerNote" maxlength="800" placeholder="Contoh: mohon proses untuk region Indonesia atau informasi tambahan lainnya."></textarea></label></section>
      </div>
      <aside class="panel checkout-summary-card"><div class="section-label">RINGKASAN PESANAN</div><div class="summary-product"><div class="summary-cover thumb-summary">${productThumb(p,'summary-thumb')}</div><div><strong>${esc(p.name)}</strong><span>${esc(v?.name||p.duration)}${v?.subtitle?` · ${esc(v.subtitle)}`:''}</span></div></div><label class="field checkout-quantity-field">Jumlah<div class="checkout-qty-stepper"><button type="button" data-checkout-minus aria-label="Kurangi jumlah">−</button><input name="quantity" id="checkoutQuantity" type="number" min="1" max="${maxQty}" value="${initialQty}" readonly inputmode="numeric" aria-label="Jumlah produk"><button type="button" data-checkout-plus data-max="${maxQty}" aria-label="Tambah jumlah">+</button></div><small>Maksimal ${maxQty} item untuk varian ini.</small></label><div class="summary-row"><span>Harga satuan</span><strong>${money(unitPrice)}</strong></div><div class="summary-row"><span>Subtotal</span><strong id="checkoutSubtotal">${money(subtotal)}</strong></div><div class="summary-row discount-row" id="checkoutDiscountRow" ${discount?'':'hidden'}><span>Voucher</span><strong id="checkoutDiscount">-${money(discount)}</strong></div><div class="summary-row" id="checkoutBalanceRow" hidden><span>Saldo Uply</span><strong id="checkoutBalanceUsed">-Rp0</strong></div><div class="summary-row total"><span>Total pembayaran</span><strong id="checkoutTotal">${money(Math.max(0,subtotal-discount))}</strong></div><label class="check"><input type="checkbox" name="agree" required> Saya sudah memeriksa detail kontak dan menyetujui ketentuan produk.</label><div id="checkoutError" class="form-inline-error" hidden></div><button class="btn full checkout-submit" type="submit" ${!externalReady?'disabled':''}>Lanjut ke Pembayaran →</button><p class="tiny center">Diskon dan saldo dihitung ulang oleh server sebelum order dibuat.</p></aside>
    </form>
  </div></section>`;
}
function checkoutRecalc(){
  const form=$('#checkoutForm'); if(!form)return;
  const p=state.catalog?.products?.find(x=>x.id===form.dataset.productId);if(!p)return;
  const v=form.dataset.variantId?productVariant(p,form.dataset.variantId):null;
  const qty=Number(form.elements.quantity?.value||1),subtotal=variantPrice(p,v)*qty;
  const discount=(state.appliedVoucher?.productId===p.id&&String(state.appliedVoucher?.variantId||'')===String(v?.id||'')&&Number(state.appliedVoucher.qty)===qty)?Number(state.appliedVoucher.discount||0):0;
  const after=Math.max(0,subtotal-discount),useBalance=!!form.elements.useBalance?.checked,balanceUsed=useBalance?Math.min(Number(state.user?.balance||0),after):0,total=Math.max(0,after-balanceUsed);
  if($('#checkoutSubtotal')) $('#checkoutSubtotal').textContent=money(subtotal);
  if($('#checkoutDiscountRow')) $('#checkoutDiscountRow').hidden=!discount;
  if($('#checkoutDiscount')) $('#checkoutDiscount').textContent='-'+money(discount);
  if($('#checkoutBalanceRow')) $('#checkoutBalanceRow').hidden=!balanceUsed;
  if($('#checkoutBalanceUsed')) $('#checkoutBalanceUsed').textContent='-'+money(balanceUsed);
  if($('#checkoutTotal')) $('#checkoutTotal').textContent=money(total);
  const submit=form.querySelector('.checkout-submit'); const external=!!form.querySelector('input[name="paymentMethod"]:checked'); if(submit) submit.disabled=total>0&&!external;
}

function setCheckoutQty(next){
  const form=$('#checkoutForm'); const input=$('#checkoutQuantity'); if(!form||!input) return;
  const max=Math.max(1,Number(input.max)||5); const qty=Math.max(1,Math.min(max,Number(next)||1));
  if(state.appliedVoucher && Number(state.appliedVoucher.qty)!==qty){state.appliedVoucher=null;const h=$('#voucherHint');if(h)h.textContent='Jumlah berubah. Terapkan voucher kembali.';}
  input.value=String(qty); state.checkoutQty=qty; checkoutRecalc();
}

function togglePaymentPanels(){
  const selected=document.querySelector('#checkoutForm input[name="paymentMethod"]:checked')?.value||'';
  document.querySelectorAll('[data-pay-panel]').forEach(el=>el.hidden=el.dataset.payPanel!==selected);
}

function memberStatusHTML(completedCount, spent, currentTier='customer'){
  const map={customer:{name:'Customer',pct:Math.min(28,completedCount*9),next:`${Math.max(0,3-completedCount)} order lagi menuju Member`,desc:'Level awal pelanggan Uply Digital.'},member:{name:'Member',pct:55,next:`${Math.max(0,10-completedCount)} order lagi menuju Reseller`,desc:'Benefit untuk pelanggan aktif.'},reseller:{name:'Reseller',pct:82,next:`${Math.max(0,30-completedCount)} order lagi menuju VIP`,desc:'Level untuk transaksi rutin dan kebutuhan lebih besar.'},vip:{name:'VIP',pct:100,next:'Level tertinggi',desc:'Level pelanggan dengan aktivitas tertinggi.'}};
  const tier=map[currentTier]||map.customer;
  return `<div class="member-card" id="memberStatus"><div class="member-top"><div><span class="section-kicker">Role Connector Otomatis</span><h2>${tier.name}</h2><p>${tier.desc}</p></div><span class="member-badge">★ ${tier.name}</span></div><div class="member-progress"><div><span style="width:${tier.pct}%"></span></div><small>${tier.next}</small></div><div class="member-benefits"><span class="${['customer','member','reseller','vip'].includes(currentTier)?'active':''}"><b>Customer</b><small>Mulai belanja</small></span><span class="${['member','reseller','vip'].includes(currentTier)?'active':''}"><b>Member</b><small>3+ order / Rp250rb</small></span><span class="${['reseller','vip'].includes(currentTier)?'active':''}"><b>Reseller</b><small>10+ order / Rp1jt</small></span><span class="${currentTier==='vip'?'active':''}"><b>VIP</b><small>30+ order / Rp3jt</small></span></div></div>`;
}

function customerDashboard(){
  if(!state.user || state.user.role!=='user') return `<section class="page customer-shell"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Dashboard Pelanggan</div><h1>Masuk untuk melihat akunmu</h1><p>Pantau transaksi, pesanan, dan status pembelian dari satu tempat.</p></div><div class="panel" style="max-width:520px"><button class="btn full" data-open-login>Masuk pelanggan</button></div></div></section>`;
  const completed=state.orders.filter(o=>o.status==='completed');
  const active=state.orders.filter(o=>['pending_payment','review','processing'].includes(o.status));
  const spent=completed.reduce((n,o)=>n+Number(o.subtotal||o.total||0)-Number(o.discount||0),0);
  const recent=state.orders.slice(0,6);
  return `<section class="page customer-shell"><div class="wrap customer-layout">
    <aside class="customer-sidebar">
      <div class="customer-profile"><div class="customer-avatar">${esc((state.user.name||'U').slice(0,1).toUpperCase())}</div><div><strong>${esc(state.user.name)}</strong><small>${esc(state.user.email)}</small></div></div>
      <nav><a class="active" href="#dashboard">⌂ Dashboard</a><button type="button" data-member-scroll>✦ Status Member</button><a href="#pesanan">≡ Pesanan Saya</a><a href="#garansi">◇ Garansi & Klaim</a><a href="#akun">⚙ Kelola Akun</a><button type="button" data-scroll-products>▦ Belanja Produk</button><a href="#pembayaran">▣ Metode Pembayaran</a><a href="#bantuan">? Bantuan</a></nav>
    </aside>
    <div class="customer-main">
      <div class="customer-welcome"><div><div class="section-kicker">Akun Pelanggan</div><h1>Halo, ${esc(state.user.name.split(' ')[0])} 👋</h1><p>Selamat datang kembali di Uply Digital.</p></div><button class="btn light small" type="button" data-scroll-products>Belanja Sekarang</button></div>
      <div class="customer-stats four"><article><span>Saldo Uply</span><strong>${money(state.user.balance||0)}</strong><small>Bisa dipakai saat checkout</small></article><article><span>Total transaksi</span><strong>${state.orders.length}</strong><small>${active.length} masih berjalan</small></article><article><span>Pesanan selesai</span><strong>${completed.length}</strong><small>Produk berhasil diterima</small></article><article><span>Total belanja selesai</span><strong>${money(spent)}</strong><small>Akumulasi order selesai</small></article></div>
      ${memberStatusHTML(completed.length,spent,state.user.membershipTier||'customer')}
      ${(state.customerNotifications||[]).length?`<div class="panel customer-notifications"><div class="panel-title"><div><h2>Notifikasi</h2><p>Update pembayaran, pesanan, dan garansi.</p></div><button class="text-btn" type="button" data-read-customer-notifications>Tandai dibaca</button></div><div class="notification-list">${(state.customerNotifications||[]).slice(0,6).map(n=>`<div class="notification-item ${n.is_read?'read':''}"><span class="notif-dot"></span><div><strong>${esc(n.title)}</strong><p>${esc(n.message||'')}</p><small>${dt(n.created_at)}</small></div></div>`).join('')}</div></div>`:''}
      <div class="panel customer-orders-panel"><div class="panel-title"><div><h2>Order terbaru</h2><p>Riwayat transaksi terakhir akunmu.</p></div><a class="text-btn" href="#pesanan">Lihat semua</a></div>${recent.length?`<div class="customer-order-table">${recent.map(o=>`<a class="customer-order-row" href="#pesanan/${encodeURIComponent(o.id)}"><div><small>${esc(o.id)}</small><strong>${esc(o.productName)}</strong><span>${dt(o.createdAt)}</span></div><div><strong>${money(o.total)}</strong>${status(o.status)}</div><b>›</b></a>`).join('')}</div>`:`<div class="empty compact"><p>Belum ada pesanan.</p><button class="btn small" data-scroll-products>Mulai belanja</button></div>`}</div>
    </div>
  </div></section>`;
}

function accountPage(){
  if(!state.user || state.user.role!=='user') return `<section class="page account-page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Akun</div><h1>Kelola akun Uply Digital</h1><p>Masuk untuk mengubah profil dan keamanan akun.</p></div><div class="panel" style="max-width:520px"><button class="btn full" data-open-login>Masuk pelanggan</button></div></div></section>`;
  const initials=esc((state.user.name||'U').split(/\s+/).map(x=>x[0]||'').slice(0,2).join('').toUpperCase());
  const joined=state.user.created_at||state.user.createdAt;
  return `<section class="page account-page"><div class="wrap account-layout-v26">
    <aside class="account-sidebar-v26">
      <div class="account-hero-v26"><div class="account-avatar-v26">${initials}</div><div><span>Akun Uply Digital</span><strong>${esc(state.user.name)}</strong><small>${esc(state.user.email)}</small></div></div>
      <nav class="account-nav-v26">
        <a href="#dashboard"><svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-8Z"/></svg>Dashboard</a>
        <a href="#pesanan"><svg viewBox="0 0 24 24"><path d="M7 6h13M7 12h13M7 18h13M4 6h.01M4 12h.01M4 18h.01"/></svg>Pesanan Saya</a>
        <a class="active" href="#akun"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 20c.7-4.2 3.2-6 7-6s6.3 1.8 7 6"/></svg>Kelola Akun</a>
        <button type="button" data-theme-open><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>Tema Tampilan</button>
        <button class="danger" type="button" data-logout><svg viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/></svg>Logout</button>
      </nav>
    </aside>
    <div class="account-content-v26">
      <div class="account-title-v26"><div><span class="section-kicker">Pengaturan akun</span><h1>Profil & keamanan</h1><p>Kelola informasi akun dan password dengan aman.</p></div><div class="account-status-v26"><span>● Aktif</span><small>${joined?`Bergabung ${esc(new Date(joined).toLocaleDateString('id-ID',{month:'long',year:'numeric'}))}`:'Akun pelanggan'}</small></div></div>
      <section class="account-card-v26">
        <div class="account-card-head-v26"><div class="account-icon-v26">ID</div><div><h2>Informasi akun</h2><p>Data ini digunakan untuk invoice, checkout, dan notifikasi pesanan.</p></div></div>
        <form id="profileForm" class="account-form-v26">
          <div class="row"><label class="field">Nama lengkap<input name="name" value="${esc(state.user.name)}" minlength="2" maxlength="80" required></label><label class="field">Nomor WhatsApp<input name="phone" value="${esc(state.user.phone||'')}" inputmode="tel" placeholder="08xxxxxxxxxx"></label></div>
          <label class="field">Alamat email<input name="email" type="email" value="${esc(state.user.email)}" required></label>
          <div class="account-form-actions-v26"><button class="btn" type="submit">Simpan perubahan</button><a class="btn light" href="#dashboard">Kembali ke dashboard</a></div>
        </form>
      </section>
      <section class="account-card-v26">
        <div class="account-card-head-v26"><div class="account-icon-v26">••</div><div><h2>Keamanan</h2><p>Gunakan password unik minimal 8 karakter.</p></div></div>
        <form id="passwordForm" class="account-form-v26">
          <label class="field">Password saat ini<input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <div class="row"><label class="field">Password baru<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label><label class="field">Ulangi password baru<input name="newPassword2" type="password" autocomplete="new-password" minlength="8" maxlength="72" required></label></div>
          <div class="account-form-actions-v26"><button class="btn" type="submit">Ubah password</button><button class="btn light" type="button" data-logout-all>Logout dari semua perangkat</button></div>
        </form>
      </section>
      <section class="account-card-v26 account-danger-v26"><div class="account-card-head-v26"><div class="account-icon-v26">↪</div><div><h2>Keluar dari akun</h2><p>Gunakan tombol ini jika memakai perangkat bersama.</p></div></div><button class="btn danger" type="button" data-logout>Logout akun</button></section>
    </div>
  </div></section>`;
}

function ordersPage(){
  if(!state.user || state.user.role!=='user') return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Pesanan</div><h1>Pantau pesananmu</h1><p>Masuk untuk melihat riwayat pesanan.</p></div><div class="panel" style="max-width:520px"><button class="btn" data-open-login>Masuk pelanggan</button></div></div></section>`;
  if(!state.orders.length) return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Pesanan</div><h1>Belum ada pesanan</h1><p>Produk digital pertamamu menunggu.</p></div><a class="btn" href="#katalog">Lihat produk</a></div></section>`;
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Pesanan</div><h1>Pesanan saya</h1><p>${state.orders.length} pesanan tersimpan di akunmu.</p></div><div class="orders">${state.orders.map(o=>`<article class="order"><div class="order-thumb">${productThumb(o,'order-thumb-img')}</div><div><span class="tiny">${esc(o.id)} · ${dt(o.createdAt)}</span><h3>${esc(o.productName)}</h3><span class="tiny">${esc(o.variantName||o.duration)} · ${o.quantity} produk</span></div><div><strong>${money(o.total)}</strong><br>${status(o.status)}</div><a class="btn light small" href="#pesanan/${encodeURIComponent(o.id)}">Lihat detail</a></article>`).join('')}</div></div></section>`;
}

function invoicePaymentState(o){
  if(o.status==='cancelled') return {label:'Dibatalkan', cls:'cancelled'};
  if(o.paymentVerifiedAt || ['processing','completed'].includes(o.status)) return {label:'Pembayaran terverifikasi', cls:'completed'};
  if(o.paymentSubmittedAt || o.hasProof || o.status==='review') return {label:'Pembayaran dikirim', cls:'review'};
  return {label:'Menunggu pembayaran', cls:'pending_payment'};
}

function invoiceNumber(o){ return 'INV-' + String(o.id||'').replace(/^UPL-/,''); }
function invoiceChip(ps){ return `<span class="status ${esc(ps.cls)}">${esc(ps.label)}</span>`; }
function invoiceDate(v){ return v ? dt(v) : '—'; }
function paymentMethod(o){
  if(o.paymentMode==='midtrans') return `Midtrans${o.paymentData?.method?' · '+o.paymentData.method:''}`;
  if(o.paymentMode==='qris_manual') return 'QRIS Manual';
  if(o.paymentMode==='balance') return 'Saldo Uply';
  if(o.paymentMode==='xendit') return 'Xendit (order lama)';
  if(o.bank?.name) return `Transfer ${o.bank.name}`;
  return o.paymentMode||'Transfer bank';
}
function invoiceVisible(o){
  return !!(o.paymentSubmittedAt || o.paymentVerifiedAt || o.hasProof || ['review','processing','completed'].includes(o.status));
}
function invoiceHTML(o){
  const ps=invoicePaymentState(o);
  const processLabel=o.status==='completed'?'Pesanan selesai':o.status==='processing'?'Sedang diproses':o.status==='review'?'Menunggu verifikasi admin':statusLabel[o.status]||o.status;
  return `<div class="panel invoice-card" id="invoice-${esc(o.id)}">
    <div class="invoice-head"><div><span class="invoice-kicker">Invoice Uply Digital</span><h2>${esc(invoiceNumber(o))}</h2><p>${esc(o.id)}</p></div><div class="invoice-actions">${invoiceChip(ps)}<button class="btn light small" data-print-invoice="${esc(o.id)}">Cetak / Simpan PDF</button></div></div>
    <div class="invoice-meta">
      <div><span>Tanggal pesanan</span><strong>${esc(invoiceDate(o.createdAt))}</strong></div>
      <div><span>Metode pembayaran</span><strong>${esc(paymentMethod(o))}</strong></div>
      <div><span>Status pembayaran</span><strong>${esc(ps.label)}</strong></div>
      <div><span>Status pesanan</span><strong>${esc(processLabel)}</strong></div>
    </div>
    <div class="invoice-timeline">
      <div class="${o.paymentSubmittedAt||o.hasProof||o.paymentVerifiedAt?'done':''}"><b>1</b><span><strong>Pembayaran dikirim</strong><small>${esc(invoiceDate(o.paymentSubmittedAt))}</small></span></div>
      <div class="${o.paymentVerifiedAt?'done':''}"><b>2</b><span><strong>Pembayaran terverifikasi</strong><small>${esc(invoiceDate(o.paymentVerifiedAt))}</small></span></div>
      <div class="${o.processingAt||o.status==='completed'?'done':''}"><b>3</b><span><strong>Diproses</strong><small>${esc(invoiceDate(o.processingAt))}</small></span></div>
      <div class="${o.completedAt||o.status==='completed'?'done':''}"><b>4</b><span><strong>Selesai</strong><small>${esc(invoiceDate(o.completedAt))}</small></span></div>
    </div>
    <div class="invoice-customer"><div><span>Ditagihkan kepada</span><strong>${esc(o.name)}</strong><small>${esc(o.email)}${o.phone?` · ${esc(o.phone)}`:''}</small></div>${o.bank?`<div><span>Rekening tujuan</span><strong>${esc(o.bank.name)}</strong><small>${esc(o.bank.number)} · ${esc(o.bank.holder)}</small></div>`:''}${o.paymentMode==='qris_manual'?`<div><span>QRIS</span><strong>${esc(state.catalog?.settings?.qrisName||'QRIS Manual')}</strong><small>Verifikasi manual oleh admin</small></div>`:''}</div>
    <div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody><tr><td><div class="invoice-product-cell">${productThumb(o,'invoice-product-thumb')}<span><strong>${esc(o.productName)}</strong><small>${esc(o.variantName||o.duration)}</small></span></div></td><td>${money(o.price)}</td><td>${o.quantity}</td><td>${money(o.subtotal||o.price*o.quantity)}</td></tr></tbody><tfoot>${o.discount?`<tr><td colspan="3">Voucher ${esc(o.voucherCode||'')}</td><td>-${money(o.discount)}</td></tr>`:''}${o.balanceUsed?`<tr><td colspan="3">Saldo Uply</td><td>-${money(o.balanceUsed)}</td></tr>`:''}<tr><td colspan="3">Total pembayaran</td><td>${money(o.total)}</td></tr></tfoot></table></div>
    <p class="invoice-footnote">Invoice ini mengikuti status pesanan terbaru. Simpan nomor invoice untuk bantuan pelanggan.</p>
  </div>`;
}

function printInvoice(orderId){
  const o=state.orders.find(x=>x.id===orderId); if(!o){msg('Invoice tidak ditemukan.');return;}
  const ps=invoicePaymentState(o); const inv=invoiceNumber(o); const method=paymentMethod(o);
  const line=(label,value)=>`<tr><td>${esc(label)}</td><td>${esc(value||'—')}</td></tr>`;
  const w=window.open('','_blank','width=900,height=900'); if(!w){msg('Izinkan pop-up browser untuk mencetak invoice.');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv)}</title><style>body{font-family:Arial,sans-serif;color:#0b1936;margin:36px}.brand{font-size:24px;font-weight:800;margin-bottom:28px}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0b1936;padding-bottom:18px}.top h1{margin:4px 0;font-size:28px}.muted{color:#667085}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.box{border:1px solid #dfe5ee;border-radius:12px;padding:16px}.box h3{margin-top:0}.meta{width:100%;border-collapse:collapse}.meta td{padding:6px 0;vertical-align:top}.meta td:first-child{color:#667085;width:42%}.items{width:100%;border-collapse:collapse;margin-top:24px}.items th,.items td{border-bottom:1px solid #dfe5ee;padding:12px 8px;text-align:left}.items th{font-size:12px;color:#667085}.items td:last-child,.items th:last-child{text-align:right}.total{font-size:20px;font-weight:800}.status{display:inline-block;padding:7px 10px;border-radius:999px;background:#eef4ff;font-weight:700}.foot{margin-top:30px;color:#667085;font-size:12px}@media print{button{display:none}}</style></head><body><div class="brand">Uply Digital</div><div class="top"><div><div class="muted">Invoice</div><h1>${esc(inv)}</h1><div class="muted">Order ${esc(o.id)}</div></div><div><span class="status">${esc(ps.label)}</span></div></div><div class="grid"><div class="box"><h3>Pelanggan</h3><strong>${esc(o.name)}</strong><div>${esc(o.email)}</div>${o.phone?`<div>${esc(o.phone)}</div>`:''}</div><div class="box"><h3>Detail transaksi</h3><table class="meta">${line('Tanggal order',invoiceDate(o.createdAt))}${line('Metode',method)}${line('Pembayaran dikirim',invoiceDate(o.paymentSubmittedAt))}${line('Pembayaran terverifikasi',invoiceDate(o.paymentVerifiedAt))}${line('Diproses',invoiceDate(o.processingAt))}${line('Selesai',invoiceDate(o.completedAt))}</table></div></div><table class="items"><thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody><tr><td><div style="display:flex;gap:10px;align-items:center"><img src="${esc(o.productThumbnail||'/assets/products/default.svg')}" style="width:52px;height:52px;border-radius:10px;object-fit:cover"><div><strong>${esc(o.productName)}</strong><div class="muted">${esc(o.variantName||o.duration)}</div></div></div></td><td>${money(o.price)}</td><td>${o.quantity}</td><td>${money(o.total)}</td></tr></tbody><tfoot><tr><td colspan="3" class="total">Total</td><td class="total">${money(o.total)}</td></tr></tfoot></table><p class="foot">Invoice dibuat dari status pesanan Uply Digital terbaru. Nomor invoice: ${esc(inv)}.</p><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
  w.document.close();
}

function orderDetail(id){
  const o = state.orders.find(x=>x.id===id);
  if(!o) return `<section class="page"><div class="wrap empty">Pesanan tidak ditemukan.</div></section>`;
  let pay='';
  if(o.status==='pending_payment' && o.paymentMode==='manual' && o.bank){
    pay=`<div class="panel"><h2>Pembayaran transfer</h2><div class="bank"><strong>${esc(o.bank.name)}</strong><div class="bank-number">${esc(o.bank.number)}</div><span>Atas nama ${esc(o.bank.holder)}</span></div><p>Total transfer: <strong>${money(o.total)}</strong></p><form id="proofForm" data-order="${esc(o.id)}"><label class="field">Bukti transfer (JPG/PNG/PDF maksimal ±1MB)<input type="file" name="proof" accept="image/jpeg,image/png,application/pdf" required></label><button class="btn" type="submit">Unggah bukti</button></form></div>`;
  }
  if(o.status==='pending_payment' && o.paymentMode==='qris_manual'){
    pay=`<div class="panel"><h2>Pembayaran QRIS Manual</h2><div class="qris-order-pay"><img src="/api/qris-image?v=${Date.now()}" alt="QRIS"><div><strong>${esc(state.catalog?.settings?.qrisName||'QRIS Manual')}</strong><p>Scan QRIS lalu bayar tepat <b>${money(o.total)}</b>.</p><small>Setelah bayar, upload bukti agar admin dapat memverifikasi.</small></div></div><form id="proofForm" data-order="${esc(o.id)}"><label class="field">Bukti pembayaran (JPG/PNG/PDF maksimal ±1MB)<input type="file" name="proof" accept="image/jpeg,image/png,application/pdf" required></label><button class="btn" type="submit">Unggah bukti</button></form></div>`;
  }
  if(o.status==='pending_payment' && o.paymentMode==='midtrans'){
    const pd=o.paymentData||{};
    const instruction=pd.paymentUrl?`<a class="btn full" href="${esc(pd.paymentUrl)}" rel="noopener">Bayar aman melalui Midtrans →</a><p class="tiny center">Metode pembayaran yang aktif di akun Midtrans akan tampil di halaman Snap Checkout.</p>`:'';
    pay=`<div class="panel"><h2>Pembayaran otomatis · Midtrans</h2><p>Status gateway: <strong>${esc(o.gatewayStatus||'belum dibuat')}</strong></p>${instruction}<div class="button-row">${!instruction?`<button class="btn" data-pay="${esc(o.id)}">Buat pembayaran</button>`:''}<button class="btn light" data-sync-pay="${esc(o.id)}">↻ Cek status pembayaran</button></div>${pd.transactionId?`<p class="tiny">ID transaksi: ${esc(pd.transactionId)}</p>`:''}<p class="tiny">Jika pembayaran sudah dilakukan tetapi status belum berubah, gunakan Cek status pembayaran.</p></div>`;
  }
  if(o.status==='pending_payment' && o.paymentMode==='xendit'){
    pay=`<div class="notice warn"><strong>Order gateway versi lama.</strong><br>V25 menggunakan sistem pembayaran yang aktif pada konfigurasi toko. Jangan lanjutkan link gateway lama. Batalkan order ini lalu buat order baru agar pembayaran dibuat melalui Midtrans.</div>`;
  }
  const invoice=invoiceVisible(o)?invoiceHTML(o):'';
  const progressNotice=o.status==='review'?`<div class="notice ok"><strong>Bukti pembayaran sudah diterima.</strong><br>Invoice sementara sudah tersedia dan akan diperbarui setelah admin memverifikasi pembayaran.</div>`:o.status==='processing'?`<div class="notice ok"><strong>Pembayaran terverifikasi.</strong><br>Pesanan sedang diproses. Invoice sudah diperbarui otomatis.</div>`:o.status==='completed'?`<div class="notice ok"><strong>Pesanan selesai.</strong><br>Invoice final dan detail produk sudah tersedia di bawah.</div>`:'';
  const timeline=[['Order dibuat',o.createdAt,true],['Pembayaran dikirim',o.paymentSubmittedAt,!!o.paymentSubmittedAt],['Pembayaran terverifikasi',o.paymentVerifiedAt,!!o.paymentVerifiedAt],['Sedang diproses',o.processingAt,!!o.processingAt],['Pesanan selesai',o.completedAt,!!o.completedAt]].map(([label,time,done],i)=>`<div class="order-timeline-step ${done?'done':''}"><b>${done?'✓':i+1}</b><span><strong>${label}</strong><small>${time?dt(time):'Menunggu'}</small></span></div>`).join('');
  const warranty=o.status==='completed'&&o.warrantyDays>0?`<div class="panel warranty-summary ${futureDate(o.warrantyUntil)?'active':'expired'}"><div><span>Garansi produk</span><strong>${futureDate(o.warrantyUntil)?'Aktif':'Berakhir'}</strong><small>${o.warrantyUntil?`Sampai ${new Date(o.warrantyUntil).toLocaleDateString('id-ID',{dateStyle:'medium'})}`:`${o.warrantyDays} hari`}</small></div>${futureDate(o.warrantyUntil)?`<button class="btn small" type="button" data-new-claim="${esc(o.id)}">Ajukan Klaim</button>`:`<a class="btn light small" href="#garansi">Riwayat Garansi</a>`}</div>`:'';
  return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">${esc(o.id)}</div><h1>${esc(o.productName)}</h1><p>${dt(o.createdAt)} · ${status(o.status)}</p></div>${progressNotice}<div class="order-detail-grid"><div class="stack">${pay}<div class="panel"><div class="panel-title"><div><h2>Timeline Pesanan</h2><p>Status terbaru tersimpan otomatis.</p></div></div><div class="order-timeline">${timeline}</div></div>${warranty}${o.note?`<div class="notice">${esc(o.note)}</div>`:''}${o.status==='completed'?`<div class="panel"><h2>Detail produk</h2><pre class="delivery">${esc(o.delivery)}</pre></div>`:''}</div><aside class="panel order-summary-sticky"><h2>Ringkasan</h2><p>${esc(o.variantName||o.duration)} · ${o.quantity} produk</p><div class="order-breakdown"><span>Subtotal <b>${money(o.subtotal||o.price*o.quantity)}</b></span>${o.discount?`<span>Voucher ${esc(o.voucherCode||'')} <b>-${money(o.discount)}</b></span>`:''}${o.balanceUsed?`<span>Saldo Uply <b>-${money(o.balanceUsed)}</b></span>`:''}</div><div class="price">${money(o.total)}</div><p class="tiny">Penerima: ${esc(o.name)}<br>${esc(o.email)}${o.phone?`<br>${esc(o.phone)}`:''}</p>${o.saleApplied?'<span class="sale-applied-chip">Harga promo diterapkan</span>':''}${o.status==='pending_payment'?`<button class="btn danger small" data-cancel="${esc(o.id)}">Batalkan pesanan</button>`:''}</aside></div>${invoice}</div></section>`;
}

async function adminPage(){
  if(!state.user || state.user.role!=='admin') return `<section class="page"><div class="wrap"><div class="page-head"><div class="eyebrow dark">Panel Admin</div><h1>Kelola Uply Digital</h1><p>Masuk menggunakan email dan password admin dari Vercel Environment Variables.</p></div><div class="panel" style="max-width:520px">${loginForm(true)}</div></div></section>`;
  state.admin = await api('adminData');
  const tabs = [['overview','Ringkasan'],['orders','Pesanan'],['warranty','Garansi'],['products','Produk'],['inventory','Inventory'],['vouchers','Voucher'],['balance','Saldo'],['customers','Pelanggan'],['reports','Laporan'],['payments','Monitor Pembayaran'],['settings','Pembayaran & Toko'],['docs','Dokumentasi'],['audit','Aktivitas']];
  return `<section class="page admin-page"><div class="wrap"><div class="page-head admin-title-row"><div><div class="eyebrow dark">Panel Admin</div><h1>Ruang kelola toko</h1><p>${esc(state.admin.admin.email)} · pembayaran <strong>${esc(state.admin.settings.paymentMode)}</strong></p></div><div class="admin-head-actions"><button class="btn light small" data-admin-refresh>↻ Perbarui</button><a class="btn small" href="#katalog">Lihat toko</a></div></div><div class="admin-layout"><aside class="admin-nav">${tabs.map(([id,l])=>`<button data-admin-tab="${id}" class="${state.adminTab===id?'active':''}">${l}</button>`).join('')}</aside><div id="adminContent">${adminContent()}</div></div></div></section>`;
}

function lowStockProducts(d){
  return d.products.filter(p => {
    if(!p.active) return false;
    const threshold=Number(p.lowStockThreshold||3);
    if(p.fulfillmentMode==='inventory') return Number(p.stock) <= threshold;
    return Number(p.stock) !== -1 && Number(p.stock) <= threshold;
  });
}

function ordersTable(orders){
  if(!orders.length) return `<div class="empty panel">Tidak ada pesanan pada filter ini.</div>`;
  const rows=orders.map(o=>`<tr><td><strong>${esc(o.id)}</strong><br><span class="tiny">${dt(o.createdAt)}</span></td><td>${esc(o.name)}<br><span class="tiny">${esc(o.email)}</span></td><td>${esc(o.productName)}<br><span class="tiny">${esc(o.variantName||o.duration)} · ${o.quantity}</span></td><td><strong>${money(o.total)}</strong></td><td>${status(o.status)}</td><td><button class="text-btn admin-open-order" data-admin-order="${esc(o.id)}">Buka</button></td></tr>`).join('');
  const cards=orders.map(o=>`<article class="admin-order-card">
    <div class="admin-order-card-top"><span><small>${dt(o.createdAt)}</small><strong>${esc(o.id)}</strong></span>${status(o.status)}</div>
    <div class="admin-order-card-body"><div><small>Pelanggan</small><strong>${esc(o.name)}</strong><span>${esc(o.email)}</span></div><div><small>Produk</small><strong>${esc(o.productName)}</strong><span>${esc(o.variantName||o.duration)} · ${o.quantity}</span></div></div>
    <div class="admin-order-card-foot"><strong>${money(o.total)}</strong><button class="btn small admin-card-action" data-admin-order="${esc(o.id)}">${['review','pending_payment','processing'].includes(o.status)?'Periksa & proses':'Lihat detail'} →</button></div>
  </article>`).join('');
  return `<div class="admin-orders-desktop table-wrap"><table><thead><tr><th>Pesanan</th><th>Pelanggan</th><th>Produk</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="admin-orders-mobile">${cards}</div>`;
}

function adminContent(){
  const d = state.admin;
  if(state.adminTab==='overview'){
    const rev = d.orders.filter(o=>['processing','completed'].includes(o.status)).reduce((a,o)=>a+Number(o.subtotal||o.total||0)-Number(o.discount||0),0);
    const todayKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
    const today=d.analytics?.daily?.find(x=>x.day===todayKey)||{orders:0,revenue:0};
    const availableInventory = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.available||0),0);
    const low = lowStockProducts(d);
    const paidCount=d.orders.filter(o=>['processing','completed'].includes(o.status)).length, completedCount=d.orders.filter(o=>o.status==='completed').length;
    const payRate=d.orders.length?Math.round(paidCount/d.orders.length*100):0, completeRate=d.orders.length?Math.round(completedCount/d.orders.length*100):0;
    const unread=(d.notifications||[]).filter(n=>!n.is_read);
    const maxDaily=Math.max(1,...(d.analytics?.daily||[]).map(x=>Number(x.revenue||0)));
    const chart=(d.analytics?.daily||[]).slice(-14).map(x=>`<div class="mini-bar-col"><i style="height:${Math.max(5,Math.round(Number(x.revenue||0)/maxDaily*100))}%"></i><small>${x.day.slice(5)}</small><b>${money(x.revenue)}</b></div>`).join('');
    return `<div class="stats business-kpis"><div class="stat"><span class="tiny">Omzet terverifikasi</span><strong>${money(rev)}</strong><small>Semua transaksi dibayar</small></div><div class="stat"><span class="tiny">Estimasi laba</span><strong>${money(d.analytics?.profit||0)}</strong><small>Net sales dikurangi harga modal</small></div><div class="stat"><span class="tiny">Omzet hari ini</span><strong>${money(today.revenue)}</strong><small>${today.orders} order dibuat</small></div><div class="stat"><span class="tiny">Perlu dicek</span><strong>${d.orders.filter(o=>o.status==='review').length}</strong><small>Bukti/manual payment</small></div><div class="stat"><span class="tiny">Pelanggan</span><strong>${d.customers.length}</strong><small>${d.customers.filter(c=>['reseller','vip'].includes(c.membershipTier)).length} reseller/VIP</small></div><div class="stat"><span class="tiny">Stok menipis</span><strong>${low.length}</strong><small>${availableInventory} inventory siap kirim</small></div><div class="stat"><span class="tiny">Notifikasi</span><strong>${unread.length}</strong><small>Belum dibaca</small></div></div>
    <div class="panel funnel-panel"><div class="panel-title"><div><h2>Funnel & Konversi</h2><p>Order dibuat → pembayaran terverifikasi → selesai.</p></div><button class="text-btn" data-admin-tab="reports">Buka laporan</button></div><div class="funnel-grid"><span><b>${d.orders.length}</b><small>Order dibuat</small></span><span><b>${paidCount}</b><small>Pembayaran terverifikasi · ${payRate}%</small></span><span><b>${completedCount}</b><small>Selesai · ${completeRate}%</small></span></div></div>
    <div class="admin-grid-2"><div class="panel"><div class="panel-title"><div><h2>Omzet 14 hari</h2><p>Auto recap berdasarkan transaksi terverifikasi.</p></div></div><div class="mini-bar-chart">${chart||'<div class="empty compact">Belum ada data penjualan.</div>'}</div></div>
    <div class="panel"><div class="panel-title"><div><h2>Produk terlaris</h2><p>Ranking berdasarkan omzet order selesai.</p></div></div><div class="rank-list">${(d.analytics?.topProducts||[]).slice(0,6).map((x,i)=>`<div><b>${i+1}</b><span><strong>${esc(x.name||x.product_id)}</strong><small>${x.units} unit · ${x.completed} order</small></span><em>${money(x.revenue)}</em></div>`).join('')||'<div class="empty compact">Belum ada penjualan selesai.</div>'}</div></div></div>
    <div class="admin-grid-2"><div class="panel"><div class="toolbar"><div><h2>Quick actions</h2><p class="tiny">Akses tugas operasional utama.</p></div></div><div class="quick-actions"><button class="quick" data-quick="add-product"><b>＋</b><span>Tambah produk<small>Buat produk baru</small></span></button><button class="quick" data-quick="inventory"><b>▣</b><span>Tambah inventory<small>Siapkan auto delivery</small></span></button><button class="quick" data-quick="review"><b>✓</b><span>Cek pembayaran<small>${d.orders.filter(o=>o.status==='review').length} perlu dicek</small></span></button><button class="quick" data-admin-tab="vouchers"><b>🎟</b><span>Kelola voucher<small>${d.vouchers?.filter(v=>v.active).length||0} aktif</small></span></button></div></div>
    <div class="panel"><div class="toolbar"><div><h2>Notification Center</h2><p class="tiny">Order, pembayaran, dan stok yang perlu perhatian.</p></div>${unread.length?'<button class="text-btn" data-read-notifications>Baca semua</button>':''}</div><div class="notification-list">${(d.notifications||[]).slice(0,8).map(n=>`<div class="notification-item ${n.is_read?'read':''}"><span class="notif-dot"></span><div><strong>${esc(n.title)}</strong><p>${esc(n.message||'')}</p><small>${dt(n.created_at)}</small></div></div>`).join('')||'<div class="empty compact">Belum ada notifikasi.</div>'}</div></div></div>
    <div class="admin-grid-2"><div class="panel"><div class="toolbar"><div><h2>Alert stok</h2><p class="tiny">Smart stock management menggunakan threshold per produk.</p></div><button class="text-btn" data-admin-tab="inventory">Buka inventory</button></div>${low.length?`<div class="alert-list">${low.slice(0,8).map(p=>`<div><span><strong>${esc(p.name)}</strong><small>${p.fulfillmentMode==='inventory'?'Inventory otomatis':'Stok manual'} · batas ${p.lowStockThreshold||3}</small></span><b>${p.stock===0?'Habis':`Sisa ${p.stock}`}</b></div>`).join('')}</div>`:`<div class="notice ok">Semua stok dalam kondisi aman.</div>`}</div>
    <div class="panel"><div class="panel-title"><div><h2>Payment mix</h2><p>Ringkasan penggunaan metode pembayaran.</p></div></div><div class="payment-mix-list">${(d.analytics?.paymentMix||[]).map(x=>`<div><span><b>${esc(x.payment_mode||'manual')}</b><small>${x.orders} order</small></span><strong>${money(x.revenue)}</strong></div>`).join('')||'<div class="empty compact">Belum ada transaksi.</div>'}</div></div></div>
    <div class="toolbar section-toolbar"><div><h2>Pesanan terbaru</h2><p class="tiny">Aktivitas order terbaru dari pelanggan.</p></div><button class="text-btn" data-admin-tab="orders">Lihat semua</button></div>${ordersTable(d.orders.slice(0,8))}`;
  }

  if(state.adminTab==='orders'){
    const needle = state.adminOrderSearch.toLowerCase();
    const filtered = d.orders.filter(o => (state.adminOrderStatus==='all'||o.status===state.adminOrderStatus) && `${o.id} ${o.name} ${o.email} ${o.productName}`.toLowerCase().includes(needle));
    return `<div class="toolbar"><div><h2>Pesanan</h2><p class="tiny">Cari berdasarkan ID, pelanggan, email, atau produk.</p></div><span class="pill-count">${filtered.length} hasil</span></div><div class="filter-bar"><input id="adminOrderSearch" class="search" placeholder="Cari pesanan…" value="${esc(state.adminOrderSearch)}"><select id="adminOrderStatus" class="select">${[['all','Semua status'],...Object.entries(statusLabel)].map(([v,l])=>`<option value="${v}" ${state.adminOrderStatus===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>${ordersTable(filtered)}`;
  }

  if(state.adminTab==='products'){
    return `<div class="toolbar"><div><h2>Katalog produk</h2><p class="tiny">Satu produk bisa punya banyak varian harga/stok agar katalog tetap rapi. Produk yang dihapus akan diamankan bila sudah punya riwayat transaksi.</p></div><button class="btn small" data-edit-product="">Tambah produk</button></div><div class="table-wrap"><table><thead><tr><th>Produk</th><th>Harga</th><th>Varian / Stok</th><th>Pengiriman</th><th>Status</th><th></th></tr></thead><tbody>${d.products.map(p=>{const vars=p.allVariants||[],gallery=p.allGallery||p.gallery||[];return `<tr><td><div class="admin-product-cell">${productThumb(p,'admin-product-thumb')}<span><strong>${esc(p.name)}</strong><br><span class="tiny">${esc(p.category)} · ${esc(p.duration)}</span>${p.featured?'<br><span class="badge">Unggulan</span>':''}${p.requiresLoginCredentials?'<br><span class="mode-chip">Login manual</span>':''}</span></div></td><td>${productPriceText(p)}</td><td>${vars.length?`<strong>${vars.length} varian</strong><br><span class="tiny">${vars.filter(v=>v.active&&v.stock!==0).length} tersedia</span>`:(p.stock===-1?'Tanpa batas':p.stock)}</td><td>${p.fulfillmentMode==='inventory'?'<span class="mode-chip auto">Inventory otomatis</span>':'<span class="mode-chip">Manual admin</span>'}</td><td>${p.active?'<span class="status completed">Aktif</span>':'<span class="status cancelled">Diarsipkan</span>'}</td><td><div class="table-actions"><button class="text-btn" data-edit-product="${esc(p.id)}">Edit</button><button class="text-btn" data-manage-gallery="${esc(p.id)}">Galeri (${gallery.length})</button><button class="text-btn" data-manage-variants="${esc(p.id)}">Varian (${vars.length})</button>${p.fulfillmentMode==='inventory'?`<button class="text-btn" data-goto-inventory="${esc(p.id)}">Inventory</button>`:(!vars.length?`<button class="text-btn" data-stock-product="${esc(p.id)}">${p.stock===-1?'Atur stok':'Tambah stok'}</button>`:'')}${p.active?`<button class="text-btn danger-text" data-delete-product="${esc(p.id)}">Hapus</button>`:`<button class="text-btn" data-restore-product="${esc(p.id)}">Pulihkan</button><button class="text-btn danger-text" data-delete-product="${esc(p.id)}">Hapus permanen</button>`}</div></td></tr>`}).join('')}</tbody></table></div>`;
  }

  if(state.adminTab==='inventory'){
    const inventoryProducts=d.products.filter(p=>p.fulfillmentMode==='inventory');
    const targets=inventoryTargets(inventoryProducts);
    const items = (d.inventoryItems||[]).filter(i => (state.inventoryProduct==='all'||i.productId===state.inventoryProduct) && (state.inventoryStatus==='all'||i.status===state.inventoryStatus));
    const available = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.available||0),0);
    const delivered = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.delivered||0),0);
    const disabled = Object.values(d.inventory||{}).reduce((n,x)=>n+Number(x.disabled||0),0);
    return `<div class="stats inventory-stats"><div class="stat"><span class="tiny">Tersedia</span><strong>${available}</strong></div><div class="stat"><span class="tiny">Terkirim</span><strong>${delivered}</strong></div><div class="stat"><span class="tiny">Nonaktif</span><strong>${disabled}</strong></div></div>
    <div class="admin-grid-2 inventory-grid"><div class="panel"><div class="panel-title"><div><h2>Tambah inventory</h2><p>Input item satu per satu supaya stok lebih mudah dikontrol.</p></div><span class="tag-new">Utama</span></div>${inventoryProducts.length?`<form id="inventoryAddForm"><label class="field">Produk / Varian<select name="targetKey" required>${targets.map(t=>`<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}</select><small>Jika produk memiliki varian, inventory disimpan khusus untuk varian tersebut.</small></label><label class="field">Kode / link / detail akun<textarea name="itemValue" rows="4" maxlength="5000" required placeholder="Contoh: https://link-aktivasi... atau kode lisensi..."></textarea></label><label class="field">Catatan internal <small>Opsional, hanya terlihat admin.</small><input name="note" maxlength="300" placeholder="Contoh: batch Oktober / profil 2"></label><label class="field">Status<select name="status"><option value="available">Tersedia</option><option value="disabled">Nonaktif</option></select></label><button class="btn full" type="submit">＋ Tambah 1 Item</button></form>`:`<div class="notice">Belum ada produk dengan mode <strong>Inventory Otomatis</strong>. Untuk produk manual, tambah stok dari menu Produk.</div>`}</div>
    <div class="panel"><h2>Ringkasan per produk</h2><div class="inventory-product-list">${inventoryProducts.map(p=>`<div><span><strong>${esc(p.name)}</strong><small>Auto-delivery aktif</small></span><span class="inv-counts"><b>${d.inventory[p.id]?.available||0}</b> tersedia · ${d.inventory[p.id]?.delivered||0} terkirim</span></div>`).join('')||'<div class="empty">Belum ada produk dengan mode Inventory Otomatis.</div>'}</div>${inventoryProducts.length?`<details class="bulk-box"><summary>Import banyak sekaligus (opsional)</summary><form id="inventoryBulkForm"><label class="field">Produk / Varian<select name="targetKey">${targets.map(t=>`<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}</select></label><label class="field">Satu item per baris<textarea name="items" placeholder="kode-001
kode-002
kode-003"></textarea></label><button class="btn light" type="submit">Import daftar</button></form></details>`:''}</div></div>
    <div class="toolbar section-toolbar"><div><h2>Daftar inventory</h2><p class="tiny">Item terbaru dan status penggunaannya.</p></div><span class="pill-count">${items.length} item</span></div><div class="filter-bar"><select id="inventoryProductFilter" class="select"><option value="all">Semua produk</option>${inventoryProducts.map(p=>`<option value="${esc(p.id)}" ${state.inventoryProduct===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select><select id="inventoryStatusFilter" class="select">${[['all','Semua status'],['available','Tersedia'],['delivered','Terkirim'],['disabled','Nonaktif']].map(([v,l])=>`<option value="${v}" ${state.inventoryStatus===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="table-wrap"><table><thead><tr><th>Produk</th><th>Item</th><th>Catatan</th><th>Status</th><th>Order</th><th>Ditambahkan</th><th></th></tr></thead><tbody>${items.map(i=>`<tr><td><strong>${esc(i.productName||i.productId)}</strong>${i.variantName?`<br><span class="tiny">${esc(i.variantName)}</span>`:''}</td><td><code class="inventory-value">${esc(truncate(i.itemValue,54))}</code><br><button class="text-btn tiny-btn" data-copy="${esc(i.itemValue)}">Salin</button></td><td>${esc(i.note||'—')}</td><td>${inventoryStatus(i.status)}</td><td>${esc(i.orderId||'—')}</td><td>${dt(i.createdAt)}</td><td>${i.status==='delivered'?'<span class="tiny">Terkunci</span>':`<button class="text-btn" data-inventory-toggle="${esc(i.id)}" data-next-status="${i.status==='available'?'disabled':'available'}">${i.status==='available'?'Nonaktifkan':'Aktifkan'}</button>`}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Belum ada inventory.</td></tr>'}</tbody></table></div>`;
  }


  if(state.adminTab==='vouchers'){
    const active=(d.vouchers||[]).filter(v=>v.active).length;
    return `<div class="toolbar"><div><h2>Smart Voucher System</h2><p class="tiny">Atur diskon nominal/persen, minimum transaksi, kuota, pelanggan baru, kategori, dan produk tertentu.</p></div><button class="btn small" data-edit-voucher="">Buat voucher</button></div><div class="stats four"><div class="stat"><span class="tiny">Voucher aktif</span><strong>${active}</strong></div><div class="stat"><span class="tiny">Total voucher</span><strong>${d.vouchers?.length||0}</strong></div><div class="stat"><span class="tiny">Pemakaian</span><strong>${(d.vouchers||[]).reduce((n,v)=>n+Number(v.used||0),0)}</strong></div><div class="stat"><span class="tiny">Diskon tercatat</span><strong>${money(d.orders.reduce((n,o)=>n+Number(o.discount||0),0))}</strong></div></div><div class="voucher-admin-grid">${(d.vouchers||[]).map(v=>`<article class="voucher-admin-card ${v.active?'':'disabled'}"><div class="voucher-admin-head"><span><b>${esc(v.code)}</b><small>${esc(v.name||v.code)}</small></span><span class="status ${v.active?'completed':'cancelled'}">${v.active?'Aktif':'Nonaktif'}</span></div><strong>${v.discount_type==='percent'?`${v.discountValue}%`:`${money(v.discountValue)}`} OFF</strong><div class="voucher-meta"><span>Min. ${money(v.minSpend)}</span><span>Maks. ${v.maxDiscount?money(v.maxDiscount):'—'}</span><span>Terpakai ${v.used}${v.usageLimit?` / ${v.usageLimit}`:''}</span><span>Per user ${v.perUserLimit}x</span></div><div class="voucher-actions"><button class="text-btn" data-edit-voucher="${esc(v.code)}">Edit</button><button class="text-btn" data-toggle-voucher="${esc(v.code)}" data-active="${v.active?'false':'true'}">${v.active?'Nonaktifkan':'Aktifkan'}</button></div></article>`).join('')||'<div class="empty panel">Belum ada voucher. Buat voucher pertama untuk promo toko.</div>'}</div>`;
  }

  if(state.adminTab==='balance'){
    const totalBalance=(d.customers||[]).reduce((n,c)=>n+Number(c.balance||0),0);
    return `<div class="toolbar"><div><h2>Balance System</h2><p class="tiny">Saldo internal untuk refund, bonus, cashback, atau pembayaran checkout.</p></div></div><div class="stats four"><div class="stat"><span class="tiny">Saldo beredar</span><strong>${money(totalBalance)}</strong></div><div class="stat"><span class="tiny">Pelanggan bersaldo</span><strong>${d.customers.filter(c=>Number(c.balance)>0).length}</strong></div><div class="stat"><span class="tiny">Mutasi tercatat</span><strong>${d.balanceLedger?.length||0}</strong></div><div class="stat"><span class="tiny">Saldo dipakai order</span><strong>${money(d.orders.reduce((n,o)=>n+Number(o.balanceUsed||0),0))}</strong></div></div><div class="admin-grid-2"><div class="panel"><h2>Saldo pelanggan</h2><div class="balance-customer-list">${d.customers.slice(0,100).map(c=>`<div><span><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></span><b>${money(c.balance)}</b><button class="btn light small" data-balance-user="${esc(c.id)}">Atur</button></div>`).join('')}</div></div><div class="panel"><h2>Mutasi terbaru</h2><div class="ledger-list">${(d.balanceLedger||[]).slice(0,80).map(l=>`<div><span><strong>${esc(l.name||l.email||l.user_id)}</strong><small>${esc(l.type)} · ${dt(l.created_at)}${l.note?` · ${esc(l.note)}`:''}</small></span><b class="${Number(l.amount)>=0?'plus':'minus'}">${Number(l.amount)>=0?'+':''}${money(l.amount)}</b></div>`).join('')||'<div class="empty compact">Belum ada mutasi saldo.</div>'}</div></div></div>`;
  }

  if(state.adminTab==='warranty'){
    const claims=d.claims||[]; const active=claims.filter(c=>!['rejected','resolved'].includes(c.status));
    return `<div class="toolbar"><div><h2>Warranty / Claim Center</h2><p class="tiny">Kelola klaim garansi pelanggan tanpa harus pindah ke WhatsApp.</p></div><span class="pill-count">${active.length} aktif</span></div><div class="stats four"><div class="stat"><span class="tiny">Total klaim</span><strong>${claims.length}</strong></div><div class="stat"><span class="tiny">Menunggu dicek</span><strong>${claims.filter(c=>c.status==='submitted').length}</strong></div><div class="stat"><span class="tiny">Diproses</span><strong>${claims.filter(c=>['review','processing','approved'].includes(c.status)).length}</strong></div><div class="stat"><span class="tiny">Selesai</span><strong>${claims.filter(c=>c.status==='resolved').length}</strong></div></div><div class="claim-admin-list">${claims.map(c=>`<article class="claim-admin-card"><div class="claim-admin-head"><span><small>${esc(c.id)} · ${dt(c.createdAt)}</small><strong>${esc(c.productName)}</strong><em>${esc(c.variantName||'')}</em></span><span class="claim-status ${esc(c.status)}">${esc(claimStatusLabel[c.status]||c.status)}</span></div><div class="claim-admin-grid"><div><small>Pelanggan</small><strong>${esc(c.customerName||'-')}</strong><span>${esc(c.customerEmail||'')}</span></div><div><small>Jenis kendala</small><strong>${esc(claimCategoryLabel[c.category]||c.category)}</strong><span>Order ${esc(c.orderId)}</span></div></div><p>${esc(c.description)}</p>${c.adminNote?`<div class="notice"><strong>Catatan admin</strong><br>${esc(c.adminNote)}</div>`:''}<div class="claim-admin-actions">${c.hasScreenshot?`<button class="btn light small" type="button" data-claim-screenshot="${esc(c.id)}">Lihat screenshot</button>`:''}<button class="btn small" type="button" data-edit-claim="${esc(c.id)}">Proses klaim</button></div></article>`).join('')||'<div class="empty panel">Belum ada klaim garansi.</div>'}</div>`;
  }

  if(state.adminTab==='payments'){
    const attempts=d.paymentAttempts||[], events=d.paymentEvents||[]; const errors=attempts.filter(x=>String(x.status).toLowerCase()==='error').length+events.filter(x=>x.error).length;
    return `<div class="toolbar"><div><h2>Payment Monitor</h2><p class="tiny">Pantau percobaan gateway, webhook, dan order yang gagal dibuat pembayarannya.</p></div><span class="pill-count">${errors} error</span></div><div class="stats four"><div class="stat"><span class="tiny">Percobaan gateway</span><strong>${attempts.length}</strong></div><div class="stat"><span class="tiny">Pending</span><strong>${attempts.filter(x=>['pending','creating'].includes(String(x.status).toLowerCase())).length}</strong></div><div class="stat"><span class="tiny">Error</span><strong>${errors}</strong></div><div class="stat"><span class="tiny">Webhook events</span><strong>${events.length}</strong></div></div><div class="panel"><div class="panel-title"><div><h3>Percobaan pembayaran terbaru</h3><p>Gunakan sinkronisasi untuk mengecek ulang transaksi Midtrans.</p></div></div><div class="payment-monitor-list">${attempts.slice(0,80).map(x=>`<article><div><small>${dt(x.createdAt)}</small><strong>${esc(x.orderId)}</strong><span>${esc(x.productName||'')} · ${esc(x.customerName||'')}</span></div><div><span class="status ${String(x.status).toLowerCase()==='error'?'cancelled':'processing'}">${esc(x.status||'unknown')}</span><strong>${money(x.orderTotal||0)}</strong>${x.provider==='midtrans'?`<button class="text-btn" data-admin-sync-payment="${esc(x.orderId)}">Cek ulang</button>`:''}</div></article>`).join('')||'<div class="empty compact">Belum ada percobaan gateway.</div>'}</div></div><div class="panel"><h3>Webhook / payment events</h3><div class="payment-event-list">${events.slice(0,80).map(x=>`<div><span><strong>${esc(x.orderId)}</strong><small>${dt(x.createdAt)}</small></span><em>${x.error?esc(x.error):x.processedAt?'Processed':'Pending'}</em></div>`).join('')||'<div class="empty compact">Belum ada event pembayaran.</div>'}</div></div>`;
  }

  if(state.adminTab==='reports'){
    const completed=d.orders.filter(o=>o.status==='completed');
    const gross=completed.reduce((n,o)=>n+Number(o.subtotal||o.total||0),0), discounts=completed.reduce((n,o)=>n+Number(o.discount||0),0), net=gross-discounts, cost=completed.reduce((n,o)=>n+Number(o.costPrice||0)*Number(o.quantity||1),0), profit=net-cost;
    return `<div class="toolbar"><div><h2>Reporting System</h2><p class="tiny">Rekap penjualan, produk, pembayaran, voucher, dan status transaksi.</p></div><button class="btn small" data-export-report>Export CSV</button></div><div class="stats four"><div class="stat"><span class="tiny">Gross sales selesai</span><strong>${money(gross)}</strong></div><div class="stat"><span class="tiny">Harga modal</span><strong>${money(cost)}</strong></div><div class="stat"><span class="tiny">Estimasi laba</span><strong>${money(profit)}</strong></div><div class="stat"><span class="tiny">Margin</span><strong>${net?Math.round(profit/net*100):0}%</strong></div></div><div class="admin-grid-2"><div class="panel"><h2>30 hari terakhir</h2><div class="report-daily-list">${(d.analytics?.daily||[]).slice().reverse().map(x=>`<div><span>${esc(x.day)}</span><span>${x.orders} order</span><strong>${money(x.revenue)}</strong></div>`).join('')||'<div class="empty compact">Belum ada data.</div>'}</div></div><div class="panel"><h2>Produk</h2><div class="rank-list">${(d.analytics?.topProducts||[]).map((x,i)=>`<div><b>${i+1}</b><span><strong>${esc(x.name||x.product_id)}</strong><small>${x.units} unit · ${x.completed} selesai</small></span><em>${money(x.revenue)}</em></div>`).join('')||'<div class="empty compact">Belum ada data.</div>'}</div></div></div><div class="panel"><h2>Payment & Status Recap</h2><div class="report-grid">${(d.analytics?.paymentMix||[]).map(x=>`<div><small>${esc(x.payment_mode)}</small><strong>${x.orders}</strong><span>${money(x.revenue)}</span></div>`).join('')}${Object.entries(statusLabel).map(([k,l])=>`<div><small>${esc(l)}</small><strong>${d.orders.filter(o=>o.status===k).length}</strong><span>order</span></div>`).join('')}</div></div>`;
  }

  if(state.adminTab==='docs'){
    return `<div class="toolbar"><div><h2>Dokumentasi Lengkap</h2><p class="tiny">Panduan operasional singkat langsung di Panel Admin.</p></div></div><div class="docs-grid">
      <details open><summary>1. Proses Pesanan</summary><p><b>Menunggu pembayaran</b> → pelanggan membayar. Manual payment masuk <b>Periksa pembayaran</b>. Setelah dana cocok, admin centang konfirmasi lalu ubah ke <b>Sedang diproses</b>. Setelah detail produk terkirim, ubah ke <b>Selesai</b>.</p></details>
      <details><summary>2. Varian Produk</summary><p>Satu produk dapat memiliki banyak paket tanpa membuat kartu produk berulang. Masuk <b>Produk → Varian</b>, lalu tambah nama varian, keterangan, harga, harga coret, stok, badge, urutan dan status. Varian habis otomatis tidak dapat dipilih pelanggan. Produk di katalog hanya tampil satu kali dan harga berubah menjadi rentang jika harga variannya berbeda.</p></details>
      <details><summary>3. Auto Delivery</summary><p>Ubah produk ke <b>Inventory Otomatis</b>, lalu isi kode/link satu item per baris di menu Inventory. Setelah pembayaran otomatis terverifikasi, sistem mengambil inventory tersedia dengan lock database dan menyelesaikan pesanan.</p></details>
      <details><summary>4. Smart Stock</summary><p>Produk manual memakai angka stok. Produk inventory memakai jumlah item tersedia. Atur batas stok menipis pada Edit Produk. Dashboard akan memberi alert saat melewati threshold.</p></details>
      <details><summary>5. Voucher</summary><p>Buat voucher dari menu Voucher. Atur diskon persen/nominal, minimum transaksi, maksimal diskon, kuota global, limit per user, kategori/produk, tanggal aktif, dan aturan pelanggan baru.</p></details>
      <details><summary>6. Balance System</summary><p>Admin dapat tambah/kurangi saldo pelanggan. Semua mutasi masuk ledger. Pelanggan dapat memakai saldo pada checkout; jika order dibatalkan sebelum pembayaran, saldo otomatis dikembalikan.</p></details>
      <details><summary>7. Role Connector</summary><p>Mode otomatis: Customer → Member (3 order/Rp250rb) → Reseller (10 order/Rp1jt) → VIP (30 order/Rp3jt). Admin dapat override manual atau mengembalikan ke mode Auto.</p></details>
      <details><summary>8. Multi Payment</summary><p>Metode dapat diaktifkan bersamaan: Midtrans otomatis, transfer bank manual, QRIS manual, dan saldo. Midtrans membutuhkan payment channel aktif di merchant. QRIS gambar statis tetap membutuhkan verifikasi admin.</p></details>
      <details><summary>9. Reporting</summary><p>Menu Laporan berisi gross sales, diskon, net sales, penjualan 30 hari, produk terlaris, payment mix, dan export CSV untuk rekonsiliasi.</p></details>
      <details><summary>10. Keamanan Top Up</summary><p>Email/password akun pelanggan disimpan terenkripsi dengan CREDENTIAL_ENCRYPTION_KEY. Admin hanya dapat membukanya setelah pembayaran terverifikasi. Jangan pernah meminta OTP, PIN, recovery code, atau kode 2FA.</p></details>
      <details><summary>11. Warranty / Claim Center</summary><p>Atur durasi garansi di produk atau varian. Setelah order selesai, sistem membuat tanggal akhir garansi otomatis. Customer dapat mengajukan klaim dari menu Garansi & Klaim, upload screenshot, lalu memantau status penanganan admin.</p></details>
      <details><summary>12. Flash Sale Scheduler</summary><p>Isi Harga Flash Sale, waktu mulai, dan berakhir pada Produk/Varian. Harga promo aktif otomatis pada rentang tersebut dan diverifikasi kembali oleh backend saat checkout.</p></details>
      <details><summary>13. Harga Modal & Profit</summary><p>Isi Harga Modal pada produk/varian. Saat order dibuat, modal disnapshot ke order. Menu Laporan menghitung estimasi modal, laba, dan margin dari order selesai.</p></details>
      <details><summary>14. Payment Monitor</summary><p>Menu Monitor Pembayaran menampilkan percobaan Midtrans dan webhook. Gunakan Cek ulang untuk sinkronisasi transaksi Midtrans jika customer sudah bayar tetapi status belum berubah.</p></details>
      <details><summary>15. Backup & Audit</summary><p>Semua perubahan penting masuk menu Aktivitas. Gunakan backup/restore dari Neon untuk database production sebelum perubahan besar atau migrasi.</p></details>
    </div>`;
  }

  if(state.adminTab==='customers'){
    const needle = state.customerSearch.toLowerCase();
    const customers = d.customers.filter(c=>`${c.name} ${c.email} ${c.phone||''} ${c.membershipTier||''}`.toLowerCase().includes(needle));
    return `<div class="toolbar"><div><h2>Pelanggan & Role Connector</h2><p class="tiny">Kelola saldo, role, dan aktivitas pelanggan.</p></div><span class="pill-count">${customers.length} pelanggan</span></div><div class="filter-bar"><input id="customerSearch" class="search" placeholder="Cari nama / email / role…" value="${esc(state.customerSearch)}"></div><div class="table-wrap"><table><thead><tr><th>Pelanggan</th><th>Role</th><th>Saldo</th><th>Order</th><th>Total belanja</th><th></th></tr></thead><tbody>${customers.map(c=>`<tr><td><strong>${esc(c.name)}</strong><br><span class="tiny">${esc(c.email)}${c.phone?` · ${esc(c.phone)}`:''}</span></td><td><span class="role-chip ${esc(c.membershipTier)}">${esc(c.membershipTier)}</span>${c.membershipManual?'<br><small>manual</small>':'<br><small>otomatis</small>'}</td><td><strong>${money(c.balance)}</strong></td><td>${c.ordersCount}<br><small>${c.completedCount} selesai</small></td><td>${money(c.spent)}</td><td><div class="table-actions"><button class="text-btn" data-balance-user="${esc(c.id)}">Saldo</button><button class="text-btn" data-tier-user="${esc(c.id)}">Role</button></div></td></tr>`).join('')}</tbody></table></div><div class="customer-admin-cards">${customers.map(c=>`<article><div><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></div><span class="role-chip ${esc(c.membershipTier)}">${esc(c.membershipTier)}</span><div class="customer-mini-stats"><span>Saldo <b>${money(c.balance)}</b></span><span>Order <b>${c.ordersCount}</b></span><span>Belanja <b>${money(c.spent)}</b></span></div><div class="customer-card-actions"><button class="btn light small" data-balance-user="${esc(c.id)}">Atur Saldo</button><button class="btn light small" data-tier-user="${esc(c.id)}">Atur Role</button></div></article>`).join('')}</div>`;
  }

  if(state.adminTab==='settings'){
    const s = d.settings;
    return `<div class="admin-grid-2"><form id="settingsForm" class="panel"><h2>Pengaturan toko</h2><label class="field">Nama toko<input name="storeName" value="${esc(s.storeName||'Uply Digital')}" required></label><label class="field">WhatsApp admin<input name="whatsapp" value="${esc(s.whatsapp||'')}" placeholder="628123456789"></label><label class="field">Jam layanan<input name="hours" value="${esc(s.hours||'')}"></label><label class="field">Batas pembayaran (jam)<input name="paymentHours" type="number" min="1" max="72" value="${Number(s.paymentHours)||24}"></label><label class="field">Pengumuman toko<textarea name="notice">${esc(s.notice||'')}</textarea></label><label class="field">Banner promo homepage<textarea name="promoBanner" maxlength="180">${esc(s.promoBanner||'')}</textarea></label><div class="setting-switches"><label class="check"><input name="storeOpen" type="checkbox" ${s.storeOpen?'checked':''}> Terima pesanan baru</label><label class="check"><input name="midtransPaymentEnabled" type="checkbox" ${s.midtransPaymentEnabled?'checked':''}> Midtrans otomatis</label><label class="check"><input name="manualPaymentEnabled" type="checkbox" ${s.manualPaymentEnabled?'checked':''}> Transfer / QRIS manual</label><label class="check"><input name="balancePaymentEnabled" type="checkbox" ${s.balancePaymentEnabled?'checked':''}> Pembayaran Saldo Uply</label><label class="check"><input name="autoRoleEnabled" type="checkbox" ${s.autoRoleEnabled?'checked':''}> Role Connector otomatis</label></div><div class="qris-admin-box"><h3>QRIS Manual</h3><label class="field">Nama QRIS<input name="qrisName" value="${esc(s.qrisName||'QRIS Manual')}"></label><label class="field">Upload gambar QRIS<input type="file" name="qrisFile" accept="image/png,image/jpeg,image/webp"><small>Dipakai sebagai pembayaran manual. Status tidak otomatis tanpa API/webhook provider.</small></label>${s.qrisManualReady?`<div class="qris-preview-admin"><img src="/api/qris-image?v=${Date.now()}" alt="QRIS"><label class="check"><input type="checkbox" name="clearQris"> Hapus QRIS tersimpan</label></div>`:''}</div><button class="btn" type="submit">Simpan pengaturan</button></form><div class="stack"><div class="panel"><div class="toolbar"><div><h2>Multi Payment Gateway</h2><p class="tiny">Metode aktif muncul bersamaan di checkout.</p></div></div><div class="payment-health">${(s.paymentMethods||[]).map(m=>`<div><span>${m.id==='midtrans'?'⚡':m.id==='balance'?'💰':m.id==='qris_manual'?'▣':'🏦'}</span><div><strong>${esc(m.label)}</strong><small>${esc(m.type)}</small></div><b>Aktif</b></div>`).join('')||'<div class="notice warn">Belum ada metode pembayaran aktif.</div>'}</div><div class="notice"><strong>Midtrans:</strong> channel seperti QRIS/VA/e-wallet tetap harus aktif di dashboard merchant Midtrans.</div></div><div class="panel"><div class="toolbar"><div><h2>Rekening pembayaran</h2><p class="tiny">Untuk transfer manual.</p></div></div>${d.banks.map(b=>`<div class="bank-row"><span><strong>${esc(b.name)}</strong><small>${esc(b.number)} · ${esc(b.holder)}</small></span><button class="text-btn" data-edit-bank="${esc(b.id)}">Edit</button></div>`).join('')}</div></div></div>`;
  }


  return `<div class="toolbar"><div><h2>Aktivitas</h2><p class="tiny">Audit log perubahan penting.</p></div></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Record</th></tr></thead><tbody>${d.audit.map(a=>`<tr><td>${dt(a.timestamp)}</td><td>${esc(a.actor)}</td><td>${esc(a.action.replaceAll('_',' '))}</td><td>${esc(a.record_id||'')}</td></tr>`).join('')}</tbody></table></div>`;
}

function deleteProductModal(productId){
  const p=state.admin?.products?.find(x=>x.id===productId); if(!p)return;
  const archived=!p.active;
  openModal(archived?'Hapus permanen produk':'Hapus produk', `<div class="delete-product-confirm"><div class="delete-product-icon">!</div><h3>${esc(p.name)}</h3><p>${archived?'Produk ini sudah diarsipkan. Jika tidak memiliki riwayat pesanan atau inventory, sistem akan menghapusnya permanen. Jika masih memiliki data terkait, produk tetap diamankan sebagai arsip.':'Produk akan langsung hilang dari toko. Jika produk sudah pernah dipesan atau mempunyai inventory, sistem akan mengarsipkannya agar invoice dan riwayat lama tidak rusak.'}</p><div class="notice warn"><strong>Aman untuk riwayat transaksi.</strong><br>Order lama tetap menyimpan nama, varian, harga, thumbnail, dan detail pesanan.</div><div class="button-row"><button type="button" class="btn danger" data-confirm-delete-product="${esc(p.id)}">${archived?'Hapus permanen jika aman':'Ya, hapus produk'}</button><button type="button" class="btn ghost" data-modal-close>Batal</button></div></div>`);
}
async function restoreProduct(productId){
  const r=await api('restoreProduct',{productId});
  await refreshAdmin(); await loadCatalog(); msg(`${r.name||'Produk'} berhasil dipulihkan.`);
}

function editProduct(id){
  const p = state.admin.products.find(x=>x.id===id) || {id:'',name:'',category:'Digital',duration:'1 bulan',price:10000,description:'',benefits:[],terms:'',stock:-1,active:true,badge:'',icon:'generic',fulfillmentMode:'manual',thumbnail:'',featured:false,requiresLoginCredentials:false,lowStockThreshold:3,costPrice:0,warrantyDays:0,salePrice:0,saleStartsAt:'',saleEndsAt:''};
  openModal(p.id?'Edit produk':'Tambah produk', `<form id="productForm" data-id="${esc(p.id)}"><label class="field">Nama produk<input name="name" value="${esc(p.name)}" required></label><div class="row"><label class="field">Kategori<input name="category" value="${esc(p.category)}" required><small>Kategori Top Up otomatis diproses manual.</small></label><label class="field">Durasi / paket<input name="duration" value="${esc(p.duration)}" required></label></div><div class="row"><label class="field">Harga normal<input name="price" type="number" min="1000" value="${Number(p.regularPrice||p.price||0)}" required></label><label class="field">Harga modal<input name="costPrice" type="number" min="0" value="${Number(p.costPrice||0)}"><small>Dipakai untuk laporan estimasi laba.</small></label></div><div class="row"><label class="field">Stok manual<input name="stock" type="number" min="-1" value="${p.stock}" required><small>-1 = tidak terbatas.</small></label><label class="field">Garansi (hari)<input name="warrantyDays" type="number" min="0" max="3650" value="${Number(p.warrantyDays||0)}"><small>0 = tanpa garansi otomatis.</small></label></div><label class="field">Batas stok menipis<input name="lowStockThreshold" type="number" min="0" max="999" value="${p.lowStockThreshold||3}"><small>Dashboard memberi alert jika stok ≤ angka ini.</small></label><section class="admin-subsection"><h3>Flash Sale Scheduler</h3><div class="row"><label class="field">Harga flash sale<input name="salePrice" type="number" min="0" value="${Number(p.salePrice||0)}" placeholder="0 = nonaktif"></label><label class="field">Mulai<input name="saleStartsAt" type="datetime-local" value="${dateInput(p.saleStartsAt)}"></label></div><label class="field">Berakhir<input name="saleEndsAt" type="datetime-local" value="${dateInput(p.saleEndsAt)}"></label><p class="tiny">Harga promo aktif otomatis hanya di rentang waktu yang kamu tentukan.</p></section><div class="thumbnail-upload-box"><div class="thumbnail-preview">${productThumb(p,'admin-thumb-preview')}</div><div class="thumbnail-upload-fields"><label class="field">Upload thumbnail<input name="thumbnailFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG, atau WebP · maksimal 1 MB. Upload baru akan mengganti thumbnail tersimpan.</small></label><label class="field">Atau URL/path thumbnail<input name="thumbnail" value="${esc(p.hasUploadedThumbnail?'':(p.thumbnail||''))}" placeholder="/assets/products/produk.svg atau https://..."><small>Boleh dikosongkan jika memakai file upload.</small></label></div>${p.hasUploadedThumbnail?`<label class="check compact-check"><input name="clearUploadedThumbnail" type="checkbox"> Hapus thumbnail upload yang tersimpan</label>`:''}</div><label class="field">Deskripsi<input name="description" value="${esc(p.description)}"></label><label class="field">Benefit (satu per baris)<textarea name="benefits">${esc((p.benefits||[]).join('\n'))}</textarea></label><label class="field">Ketentuan<textarea name="terms">${esc(p.terms)}</textarea></label><div class="row"><label class="field">Badge<input name="badge" value="${esc(p.badge)}" placeholder="Favorit / Promo"></label><label class="field">Ikon<select name="icon">${['generic','netflix','youtube','ai','stars'].map(x=>`<option ${p.icon===x?'selected':''}>${x}</option>`).join('')}</select></label></div><label class="field">Mode pengiriman<select name="fulfillmentMode"><option value="manual" ${p.fulfillmentMode==='manual'?'selected':''}>Manual oleh admin</option><option value="inventory" ${p.fulfillmentMode==='inventory'?'selected':''}>Inventory otomatis</option></select><small>Untuk kategori Top Up backend selalu memaksa mode Manual.</small></label><label class="check"><input name="requiresLoginCredentials" type="checkbox" ${p.requiresLoginCredentials?'checked':''}> Memerlukan email + password akun pelanggan untuk proses manual</label><label class="check"><input name="featured" type="checkbox" ${p.featured?'checked':''}> Jadikan produk unggulan di homepage</label><label class="check"><input name="active" type="checkbox" ${p.active?'checked':''}> Tampilkan produk di toko</label><button class="btn full" type="submit">Simpan produk</button></form>`);
}

function manageProductGallery(productId){
  const p=state.admin?.products?.find(x=>x.id===productId); if(!p)return;
  const gallery=p.allGallery||p.gallery||[];
  openModal('Galeri · '+p.name, `<div class="gallery-admin-shell"><div class="notice"><strong>Tambahkan beberapa gambar untuk satu produk.</strong><br>Gunakan untuk benefit, cara aktivasi, tutorial claim garansi, syarat garansi, atau informasi lain. Maksimal 12 gambar per produk.</div><div class="variant-admin-toolbar"><span>${gallery.length} gambar</span><button class="btn small" type="button" data-edit-media="" data-product-id="${esc(p.id)}">＋ Tambah Gambar</button></div><div class="gallery-admin-list">${gallery.map(m=>`<article class="gallery-admin-card ${m.active?'':'is-inactive'}"><div class="gallery-admin-thumb">${productMediaThumb(m,'gallery-admin-img')}</div><div class="gallery-admin-copy"><span class="variant-admin-title"><strong>${esc(m.title||mediaKindLabel(m.kind))}</strong><em>${esc(mediaKindLabel(m.kind))}</em></span><small>${esc(m.caption||'Tanpa keterangan')}</small><span class="variant-admin-meta">Urutan ${Number(m.sortOrder||0)} · ${m.active?'Aktif':'Nonaktif'}</span></div><div class="variant-admin-actions"><button class="text-btn" data-edit-media="${esc(m.id)}" data-product-id="${esc(p.id)}">Edit</button><button class="text-btn danger-text" data-delete-media="${esc(m.id)}" data-product-id="${esc(p.id)}">Hapus</button></div></article>`).join('')||'<div class="empty compact">Belum ada gambar tambahan. Thumbnail utama tetap digunakan sebagai gambar pertama.</div>'}</div><div class="notice ok"><strong>Saran urutan:</strong> 1 Benefit · 2 Cara Aktivasi · 3 Claim Garansi · 4 Ketentuan/Garansi.</div></div>`);
}

function editProductMedia(productId,mediaId=''){
  const p=state.admin?.products?.find(x=>x.id===productId); if(!p)return;
  const m=(p.allGallery||p.gallery||[]).find(x=>x.id===mediaId)||{id:'',kind:'benefit',title:'',caption:'',src:'',hasUploadedImage:false,sortOrder:(p.allGallery||p.gallery||[]).length+1,active:true};
  openModal(m.id?'Edit gambar galeri':'Tambah gambar galeri', `<form id="productMediaForm" data-product-id="${esc(p.id)}" data-id="${esc(m.id)}"><div class="gallery-form-preview">${m.src?productMediaThumb(m,'gallery-form-img'):`${productThumb(p,'gallery-form-img')}`}</div><div class="row"><label class="field">Jenis informasi<select name="kind">${[['benefit','Benefit'],['activation','Cara Aktivasi'],['claim','Claim Garansi'],['warranty','Garansi / Ketentuan'],['tutorial','Tutorial'],['info','Informasi'],['other','Lainnya']].map(([v,l])=>`<option value="${v}" ${m.kind===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Urutan<input name="sortOrder" type="number" value="${Number(m.sortOrder||0)}"></label></div><label class="field">Judul<input name="title" maxlength="80" value="${esc(m.title||'')}" placeholder="Contoh: Cara Claim Garansi"></label><label class="field">Keterangan singkat<textarea name="caption" maxlength="240" placeholder="Contoh: Hubungi admin dan sertakan ID pesanan + screenshot kendala.">${esc(m.caption||'')}</textarea></label><label class="field">Upload gambar<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG/PNG/WebP · maksimal ±1,3 MB. Disarankan rasio 1:1 atau 4:5 supaya nyaman di HP.</small></label><label class="field">Atau URL/path gambar<input name="imageUrl" value="${esc(m.hasUploadedImage?'':(m.src||''))}" placeholder="/assets/... atau https://..."><small>Boleh kosong jika upload file. Saat edit, gambar lama tetap dipakai jika tidak memilih file baru.</small></label>${m.hasUploadedImage?`<label class="check compact-check"><input name="clearUploadedImage" type="checkbox"> Hapus file upload lama dan gunakan URL di atas</label>`:''}<label class="check"><input name="active" type="checkbox" ${m.active?'checked':''}> Tampilkan gambar ini di halaman produk</label><button class="btn full" type="submit">Simpan gambar galeri</button></form>`);
}

function manageVariants(productId){
  const p=state.admin?.products?.find(x=>x.id===productId); if(!p)return;
  const variants=p.allVariants||[];
  openModal('Varian · '+p.name, `<div class="variant-admin-shell"><div class="notice"><strong>Gunakan varian untuk menggabungkan beberapa harga/paket dalam satu produk.</strong><br>Contoh: 1 hari, 3 hari, 7 hari, 1 bulan, private, 2 user 1 profil.</div><div class="variant-admin-toolbar"><span>${variants.length} varian</span><button class="btn small" type="button" data-edit-variant="" data-product-id="${esc(p.id)}">＋ Tambah Varian</button></div><div class="variant-admin-list">${variants.map(v=>`<article class="variant-admin-card ${v.active?'':'is-inactive'}"><div><span class="variant-admin-title"><strong>${esc(v.name)}</strong>${v.badge?`<em>${esc(v.badge)}</em>`:''}</span><small>${esc(v.subtitle||'Tanpa deskripsi')}</small><span class="variant-admin-meta">${money(v.price)}${v.compareAtPrice>v.price?` · <del>${money(v.compareAtPrice)}</del>`:''} · ${v.stock===-1?'stok ∞':`stok ${v.stock}`} · urutan ${v.sortOrder}</span></div><div class="variant-admin-actions"><button class="text-btn" data-edit-variant="${esc(v.id)}" data-product-id="${esc(p.id)}">Edit</button>${p.fulfillmentMode==='inventory'?`<button class="text-btn" data-goto-inventory="${esc(p.id)}">Inventory</button>`:`<button class="text-btn" data-stock-variant="${esc(v.id)}">Stok</button>`}<button class="text-btn danger-text" data-delete-variant="${esc(v.id)}">Hapus</button></div></article>`).join('')||'<div class="empty compact">Belum ada varian. Produk masih memakai harga/stok utama.</div>'}</div><div class="notice ok"><strong>Kompatibel dengan produk lama.</strong><br>Jika semua varian dihapus/nonaktif, produk otomatis kembali memakai harga dan stok utama.</div></div>`);
}

function editVariant(productId,variantId=''){
  const p=state.admin?.products?.find(x=>x.id===productId); if(!p)return;
  const v=(p.allVariants||[]).find(x=>x.id===variantId)||{id:'',name:'',subtitle:'',price:p.regularPrice||p.price||10000,compareAtPrice:0,stock:p.fulfillmentMode==='inventory'?0:-1,active:true,badge:'',sortOrder:(p.allVariants||[]).length,costPrice:0,warrantyDays:0,salePrice:0,saleStartsAt:'',saleEndsAt:''};
  openModal(v.id?'Edit varian':'Tambah varian', `<form id="variantForm" data-product-id="${esc(p.id)}" data-id="${esc(v.id)}"><div class="row"><label class="field">Nama varian<input name="name" value="${esc(v.name)}" required placeholder="Contoh: 1 Bulan"></label><label class="field">Urutan<input name="sortOrder" type="number" value="${Number(v.sortOrder||0)}"></label></div><label class="field">Deskripsi singkat<input name="subtitle" value="${esc(v.subtitle||'')}" maxlength="140" placeholder="Contoh: 1 profil untuk 1 pengguna"></label><div class="row"><label class="field">Harga normal<input name="price" type="number" min="1000" value="${Number(v.regularPrice||v.price||0)}" required></label><label class="field">Harga modal<input name="costPrice" type="number" min="0" value="${Number(v.costPrice||0)}"></label></div><div class="row"><label class="field">Harga coret <small>Opsional</small><input name="compareAtPrice" type="number" min="0" value="${Number(v.compareAtPrice||0)}"></label><label class="field">Garansi (hari)<input name="warrantyDays" type="number" min="0" max="3650" value="${Number(v.warrantyDays||0)}"><small>0 = mengikuti garansi produk utama.</small></label></div><div class="row"><label class="field">Stok<input name="stock" type="number" min="-1" value="${Number(v.stock)}" ${p.fulfillmentMode==='inventory'?'readonly':''}><small>${p.fulfillmentMode==='inventory'?'Dihitung dari Inventory per varian.':'-1 = tanpa batas.'}</small></label><label class="field">Badge <small>Opsional</small><input name="badge" value="${esc(v.badge||'')}" maxlength="40" placeholder="Hemat 13% / Terlaris"></label></div><section class="admin-subsection"><h3>Flash Sale Varian</h3><div class="row"><label class="field">Harga promo<input name="salePrice" type="number" min="0" value="${Number(v.salePrice||0)}" placeholder="0 = nonaktif"></label><label class="field">Mulai<input name="saleStartsAt" type="datetime-local" value="${dateInput(v.saleStartsAt)}"></label></div><label class="field">Berakhir<input name="saleEndsAt" type="datetime-local" value="${dateInput(v.saleEndsAt)}"></label></section><label class="check"><input name="active" type="checkbox" ${v.active?'checked':''}> Varian aktif dan bisa dipilih pelanggan</label><button class="btn full" type="submit">Simpan varian</button></form>`);
}

function adjustVariantStockModal(variantId){
  let p=null,v=null;for(const prod of state.admin?.products||[]){const found=(prod.allVariants||[]).find(x=>x.id===variantId);if(found){p=prod;v=found;break;}} if(!p||!v)return;
  if(p.fulfillmentMode==='inventory'){state.adminTab='inventory';state.inventoryProduct=p.id;closeModal();$('#adminContent').innerHTML=adminContent();return;}
  openModal('Atur stok · '+v.name, `<form id="variantStockForm" data-id="${esc(v.id)}"><div class="notice"><strong>${esc(p.name)}</strong><br>Stok varian saat ini: ${v.stock===-1?'Tanpa batas':v.stock}</div><label class="field">Aksi<select name="operation"><option value="add">Tambah stok</option><option value="subtract">Kurangi stok</option><option value="set">Set stok langsung</option></select></label><label class="field">Jumlah<input name="amount" type="number" min="-1" step="1" value="1" required><small>Untuk stok tanpa batas pilih Set stok lalu isi -1.</small></label><button class="btn full" type="submit">Simpan stok varian</button></form>`);
}

function adjustStockModal(id){
  const p=state.admin.products.find(x=>x.id===id); if(!p) return;
  if(p.fulfillmentMode==='inventory'){state.adminTab='inventory';state.inventoryProduct=id;$('#adminContent').innerHTML=adminContent();return;}
  openModal('Atur stok · '+p.name, `<form id="stockAdjustForm" data-id="${esc(p.id)}"><div class="notice"><strong>Stok saat ini:</strong> ${p.stock===-1?'Tanpa batas':p.stock}</div><label class="field">Aksi<select name="operation"><option value="add" ${p.stock!==-1?'selected':''}>Tambah stok</option><option value="subtract">Kurangi stok</option><option value="set" ${p.stock===-1?'selected':''}>Set stok langsung</option></select></label><label class="field">Jumlah<input name="amount" type="number" min="-1" step="1" value="${p.stock===-1?10:1}" required><small>Untuk menjadikan stok tanpa batas, pilih Set stok langsung lalu isi -1.</small></label><button class="btn full" type="submit">Simpan stok</button></form>`);
}

function editBank(id){
  const b = state.admin.banks.find(x=>x.id===id); if(!b) return;
  openModal('Edit rekening', `<form id="bankForm" data-id="${esc(b.id)}"><label class="field">Nama bank<input name="name" value="${esc(b.name)}" required></label><label class="field">Nomor rekening<input name="number" value="${esc(b.number)}" required></label><label class="field">Atas nama<input name="holder" value="${esc(b.holder)}" required></label><label class="check"><input name="active" type="checkbox" ${b.active?'checked':''}> Aktif untuk checkout</label><button class="btn full" type="submit">Simpan rekening</button></form>`);
}


function editVoucher(code=''){
  const v=(state.admin.vouchers||[]).find(x=>x.code===code)||{code:'',name:'',discount_type:'fixed',discountValue:10000,minSpend:0,maxDiscount:0,usageLimit:0,perUserLimit:1,category:'',productIds:[],new_customers_only:false,active:true,starts_at:'',ends_at:''};
  const dateVal=x=>x?new Date(x).toISOString().slice(0,16):'';
  openModal(v.code?'Edit voucher':'Buat voucher',`<form id="voucherForm" data-code="${esc(v.code)}"><div class="row"><label class="field">Kode voucher<input name="code" value="${esc(v.code)}" ${v.code?'readonly':''} required maxlength="40" placeholder="UPLY10"></label><label class="field">Nama campaign<input name="name" value="${esc(v.name||'')}" placeholder="Promo pelanggan baru"></label></div><div class="row"><label class="field">Jenis diskon<select name="discountType"><option value="fixed" ${v.discount_type==='fixed'?'selected':''}>Nominal</option><option value="percent" ${v.discount_type==='percent'?'selected':''}>Persen</option></select></label><label class="field">Nilai diskon<input name="discountValue" type="number" min="1" value="${v.discountValue||0}" required></label></div><div class="row"><label class="field">Minimum transaksi<input name="minSpend" type="number" min="0" value="${v.minSpend||0}"></label><label class="field">Maksimum diskon<input name="maxDiscount" type="number" min="0" value="${v.maxDiscount||0}"><small>0 = tanpa batas.</small></label></div><div class="row"><label class="field">Kuota total<input name="usageLimit" type="number" min="0" value="${v.usageLimit||0}"><small>0 = tanpa batas.</small></label><label class="field">Limit per user<input name="perUserLimit" type="number" min="1" value="${v.perUserLimit||1}"></label></div><div class="row"><label class="field">Kategori khusus<input name="category" value="${esc(v.category||'')}" placeholder="Kosong = semua"></label><label class="field">Produk khusus<select name="productIds" multiple size="5">${state.admin.products.map(p=>`<option value="${esc(p.id)}" ${(v.productIds||[]).includes(p.id)?'selected':''}>${esc(p.name)} · ${esc(p.duration)}</option>`).join('')}</select></label></div><div class="row"><label class="field">Mulai<input name="startsAt" type="datetime-local" value="${dateVal(v.starts_at)}"></label><label class="field">Berakhir<input name="endsAt" type="datetime-local" value="${dateVal(v.ends_at)}"></label></div><label class="check"><input name="newCustomersOnly" type="checkbox" ${v.new_customers_only?'checked':''}> Khusus pelanggan baru</label><label class="check"><input name="active" type="checkbox" ${v.active?'checked':''}> Voucher aktif</label><button class="btn full" type="submit">Simpan voucher</button></form>`);
}

function balanceAdjustModal(userId){
  const c=state.admin.customers.find(x=>x.id===userId);if(!c)return;
  openModal('Atur saldo · '+c.name,`<form id="balanceForm" data-user-id="${esc(c.id)}"><div class="notice"><strong>Saldo saat ini:</strong> ${money(c.balance||0)}</div><label class="field">Perubahan saldo<input name="amount" type="number" step="1000" required placeholder="50000"><small>Positif untuk tambah, negatif untuk kurangi. Contoh: 50000 atau -10000.</small></label><label class="field">Catatan<textarea name="note" maxlength="300" placeholder="Bonus, refund, koreksi saldo, dll"></textarea></label><button class="btn full" type="submit">Simpan perubahan saldo</button></form>`);
}

function tierModal(userId){
  const c=state.admin.customers.find(x=>x.id===userId);if(!c)return;
  openModal('Role pelanggan · '+c.name,`<form id="tierForm" data-user-id="${esc(c.id)}"><div class="notice"><strong>Role saat ini:</strong> ${esc(c.membershipTier||'customer')} · ${c.membershipManual?'manual':'otomatis'}</div><label class="field">Role<select name="tier"><option value="auto">Auto berdasarkan transaksi</option>${['customer','member','reseller','vip'].map(x=>`<option value="${x}" ${c.membershipManual&&c.membershipTier===x?'selected':''}>${x}</option>`).join('')}</select></label><p class="tiny">Auto: Member 3 order/Rp250rb · Reseller 10 order/Rp1jt · VIP 30 order/Rp3jt.</p><button class="btn full" type="submit">Simpan role</button></form>`);
}

function exportReportCSV(){
  const rows=state.admin?.orders||[];
  const header=['Order ID','Tanggal','Pelanggan','Email','Produk','Varian','Qty','Subtotal','Diskon','Voucher','Saldo','Total Dibayar','Payment','Status'];
  const csv=[header,...rows.map(o=>[o.id,dt(o.createdAt),o.name,o.email,o.productName,o.variantName||o.duration||'',o.quantity,o.subtotal||o.price*o.quantity,o.discount||0,o.voucherCode||'',o.balanceUsed||0,o.total,o.paymentMode,o.status])].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`uply-report-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function adminClaimModal(id){
  const c=(state.admin?.claims||[]).find(x=>x.id===id); if(!c) return;
  openModal('Klaim '+c.id,`<form id="adminClaimForm" data-id="${esc(c.id)}" class="stack"><div class="notice"><strong>${esc(c.productName)}</strong><br>${esc(c.variantName||'')} · Order ${esc(c.orderId)}<br><small>${esc(c.customerName||'')} · ${esc(c.customerEmail||'')}</small></div><div class="panel compact-panel"><small>Keluhan pelanggan</small><p>${esc(c.description)}</p></div><label class="field">Status klaim<select name="status">${Object.entries(claimStatusLabel).map(([v,l])=>`<option value="${v}" ${c.status===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label><label class="field">Catatan untuk pelanggan<textarea name="adminNote" maxlength="1200" placeholder="Jelaskan hasil pengecekan, penggantian akun, atau alasan penolakan.">${esc(c.adminNote||'')}</textarea></label>${c.hasScreenshot?`<button class="btn light" type="button" data-claim-screenshot="${esc(c.id)}">Lihat screenshot pelanggan</button>`:''}<button class="btn full" type="submit">Simpan status klaim</button></form>`);
}

function adminOrderModal(id){
  const o = state.admin.orders.find(x=>x.id===id); if(!o) return;
  const controls = o.status==='review' ? `<label class="field">Tindakan<select name="status"><option value="processing">Pembayaran diterima → proses</option><option value="pending_payment">Minta bukti ulang</option><option value="cancelled">Batalkan</option></select></label><label class="check admin-payment-check"><input type="checkbox" name="confirmPayment"> Saya sudah mencocokkan dana masuk.</label>` : o.status==='pending_payment' ? `<label class="field">Tindakan<select name="status"><option value="cancelled">Batalkan pesanan</option><option value="processing">Tandai dibayar & proses</option></select></label><label class="check admin-payment-check"><input type="checkbox" name="confirmPayment"> Jika memproses: pembayaran sudah diterima.</label>` : o.status==='processing' ? `<input type="hidden" name="status" value="completed"><label class="field">Detail produk / instruksi<textarea name="delivery" required>${esc(o.delivery||'')}</textarea></label>` : '';
  const d=document.querySelector('#modal'); if(d) d.classList.add('admin-order-dialog');
  openModal('Pesanan ' + o.id, `<div class="admin-order-modal"><div class="admin-order-summary"><div><small>Produk</small><strong>${esc(o.productName)}</strong><span>${esc(o.variantName||o.duration)} · ${o.quantity}</span></div><div><small>Pelanggan</small><strong>${esc(o.name)}</strong><span>${esc(o.email)}</span></div><div><small>Total</small><strong>${money(o.total)}</strong><span>${statusLabel[o.status]||o.status}</span></div></div>${o.hasProof?`<button class="btn light small" data-proof="${esc(o.id)}">Lihat bukti transfer</button>`:''}${o.hasCredentials&&o.status==='processing'?`<button class="btn light small" data-order-credentials="${esc(o.id)}">🔐 Lihat login akun</button><p class="tiny">Tersedia setelah pembayaran terverifikasi. Jangan minta OTP/recovery code.</p>`:o.hasCredentials?'<p class="tiny">🔐 Data login tersimpan terenkripsi dan baru dapat dibuka setelah pembayaran terverifikasi.</p>':''}${controls?`<form id="orderForm" data-id="${esc(o.id)}" class="stack admin-order-form" style="margin-top:14px">${controls}<label class="field">Catatan pelanggan<textarea name="note">${esc(o.note||'')}</textarea></label><div class="admin-confirm-bar"><button class="btn full" type="submit">Simpan perubahan</button></div></form>`:o.status==='completed'?`<div class="panel"><strong>Detail terkirim</strong><pre class="delivery">${esc(o.delivery||'')}</pre></div>`:'<p class="tiny">Tidak ada tindakan manual yang diperlukan pada status ini.</p>'}</div>`);
}

async function refreshAdmin(){
  state.admin = await api('adminData');
  const target = $('#adminContent'); if(target) target.innerHTML = adminContent();
}

function updateResponsiveNav(hash){
  const key = hash.startsWith('pesanan') ? 'pesanan' : (hash==='dashboard'||hash==='akun') ? 'dashboard' : 'katalog';
  document.querySelectorAll('[data-mobile-nav]').forEach(el=>el.classList.toggle('active',el.dataset.mobileNav===key));
  document.body.dataset.route = (hash.split('/')[0]||'katalog');
}

async function route(){
  if(!state.catalog) await loadCatalog();
  const hash = (location.hash || '#katalog').slice(1);
  updateResponsiveNav(hash);
  if(hash==='katalog' || hash==='') app.innerHTML = catalogPage();
  else if(hash.startsWith('produk/')) app.innerHTML = productDetailPage(decodeURIComponent(hash.slice(7)));
  else if(hash==='dashboard'){
    if(state.user?.role==='user'){
      [state.orders,state.customerNotifications]=await Promise.all([api('orders'),api('customerNotifications')]);
    }
    app.innerHTML = customerDashboard();
  }
  else if(hash==='akun'){ if(state.user?.role==='user') state.user=await api('me'); app.innerHTML = accountPage(); }
  else if(hash==='pembayaran') app.innerHTML = paymentMethodsPage();
  else if(hash==='garansi'){
    if(state.user?.role==='user') [state.orders,state.claims]=await Promise.all([api('orders'),api('claims')]);
    app.innerHTML = warrantyCenterPage();
  }
  else if(hash==='bantuan') app.innerHTML = helpPage();
  else if(hash.startsWith('checkout/')){const parts=hash.slice(9).split('/');app.innerHTML=checkoutPage(decodeURIComponent(parts[0]||''),decodeURIComponent(parts[1]||''));}
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
  if(e.target.name==='detailVariant'){
    const p=state.catalog?.products?.find(x=>location.hash.includes(encodeURIComponent(x.id))||location.hash.includes(x.id));
    const v=p?productVariant(p,e.target.value):null; if(!p||!v)return;
    document.querySelectorAll('.variant-card').forEach(el=>el.classList.toggle('selected',el.contains(e.target)));
    const price=$('#detailPrice'),stockEl=$('#detailStock'),qty=$('#detailQty'),plus=document.querySelector('[data-detail-plus]');
    if(price)price.textContent=money(v.price); const st=Number(v.stock); if(stockEl){stockEl.textContent='● '+(st===-1?'Stok tersedia':st>0?`${st} unit tersedia`:'Stok habis');stockEl.className=st===0?'stock-out':'v18-stock';}
    if(qty)qty.textContent='1'; if(plus)plus.dataset.max=String(st>0?Math.min(5,st):5);
  }
  if(e.target.id==='adminOrderStatus'){ state.adminOrderStatus=e.target.value; $('#adminContent').innerHTML=adminContent(); }
  if(e.target.id==='inventoryProductFilter'){ state.inventoryProduct=e.target.value; $('#adminContent').innerHTML=adminContent(); }
  if(e.target.id==='inventoryStatusFilter'){ state.inventoryStatus=e.target.value; $('#adminContent').innerHTML=adminContent(); }
  if(e.target.id==='checkoutQuantity'){
    if(state.appliedVoucher && Number(state.appliedVoucher.qty)!==Number(e.target.value||1)){state.appliedVoucher=null;const h=$('#voucherHint');if(h)h.textContent='Jumlah berubah. Terapkan voucher kembali.';}
    checkoutRecalc();
  }
  if(e.target.id==='useBalance') checkoutRecalc();
  if(e.target.name==='paymentMethod'){togglePaymentPanels();checkoutRecalc();}
  if(e.target.id==='checkoutChannel'){
    const form=e.target.closest('#checkoutForm'); const phoneInput=form?.elements?.phone; if(phoneInput) phoneInput.required=e.target.value==='whatsapp';
  }
});

document.addEventListener('click', async e => {
  if(e.target.closest('[data-theme-open]')){ themeModal(); return; }
  const themePick=e.target.closest('[data-theme-value]'); if(themePick){applyTheme(themePick.dataset.themeValue);closeModal();msg('Tema diubah ke '+themeLabel[themePick.dataset.themeValue]+'.');return;}
  if(e.target.closest('[data-cart-open]')){openCart();return;}
  if(e.target.closest('[data-cart-close]')){closeCart();return;}
  if(e.target.closest('[data-cart-shop]')){closeCart();location.hash='#katalog';setTimeout(()=>document.getElementById('produk')?.scrollIntoView({behavior:'smooth'}),120);return;}
  if(e.target.closest('[data-cart-remove]')){state.cart=null;state.appliedVoucher=null;saveCart();return;}
  if(e.target.closest('[data-cart-minus]')){if(state.cart){state.cart.qty=Math.max(1,Number(state.cart.qty||1)-1);state.appliedVoucher=null;saveCart();}return;}
  if(e.target.closest('[data-cart-plus]')){const p=cartProduct(),v=cartVariant();if(state.cart&&p){const st=variantStock(p,v);const max=st>0?Math.min(5,st):5;state.cart.qty=Math.min(max,Number(state.cart.qty||1)+1);state.appliedVoucher=null;saveCart();}return;}
  if(e.target.closest('[data-checkout-minus]')){const input=$('#checkoutQuantity');if(input)setCheckoutQty(Number(input.value||1)-1);return;}
  if(e.target.closest('[data-checkout-plus]')){const input=$('#checkoutQuantity');if(input)setCheckoutQty(Number(input.value||1)+1);return;}
  if(e.target.closest('[data-cart-checkout]')){const p=cartProduct(),v=cartVariant();if(!p)return;if(p.hasVariants&&!v){msg('Pilih varian ulang dari halaman produk.');return;}state.checkoutQty=Number(state.cart.qty)||1;state.checkoutVariantId=v?.id||'';state.pendingCheckout=p.id;state.pendingVariantId=v?.id||'';closeCart();if(!state.user||state.user.role!=='user'){openModal('Masuk untuk checkout',loginForm(false));return;}state.pendingCheckout='';state.pendingVariantId='';location.hash='#checkout/'+encodeURIComponent(p.id)+(v?'/'+encodeURIComponent(v.id):'');return;}
  if(e.target.closest('[data-mobile-menu]')){ const account=state.user?(state.user.role==='admin'?'<a class="market-menu-link primary" href="#admin" data-close>Panel Admin</a><button class="market-menu-link menu-danger" type="button" data-logout>Logout</button>':`<div class="mobile-account-mini"><div class="account-avatar">${esc((state.user.name||'U').slice(0,1).toUpperCase())}</div><div><strong>${esc(state.user.name)}</strong><small>${esc(state.user.email)}</small></div></div><a class="market-menu-link primary" href="#dashboard" data-close>Dashboard Saya</a><a class="market-menu-link" href="#pesanan" data-close>Pesanan Saya</a><a class="market-menu-link" href="#akun" data-close>Kelola Akun</a><button class="market-menu-link menu-danger" type="button" data-logout>Logout</button>`):'<button class="market-menu-link primary" type="button" data-open-login>Masuk / Daftar</button>'; openModal('Menu Uply Digital',`<div class="koala-menu-sheet"><nav class="market-mobile-menu"><a href="#katalog" data-close>Beranda</a><button type="button" data-scroll-products data-close>Produk</button><a href="#garansi" data-close>Ketentuan & Garansi</a><a href="#pesanan" data-close>Cek Status Pesanan</a><a href="#pembayaran" data-close>Metode Pembayaran</a><a href="#bantuan" data-close>Bantuan</a>${account}</nav><div class="koala-menu-footer"><small>Uply Digital</small><p>Belanja produk digital lebih simpel, aman, dan terpantau.</p><p>© ${new Date().getFullYear()} Uply Digital.</p></div></div>`); return; }
  if(e.target.closest('[data-support-open]')){const wa=String(state.catalog?.settings?.whatsapp||'').replace(/\D/g,'');openModal('Bantuan Uply Digital',`<div class="support-modal"><p>Butuh bantuan memilih produk atau memeriksa pesanan?</p><div class="stack">${wa?`<a class="btn full" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">Chat WhatsApp Admin</a>`:''}<a class="btn light full" href="#bantuan" data-close>Pusat Bantuan</a><a class="btn light full" href="#pesanan" data-close>Cek Pesanan Saya</a></div></div>`);return;}
  if(e.target.closest('[data-open-register]')){ if(state.user){location.hash=state.user.role==='admin'?'#admin':'#dashboard';return;} openModal('Daftar akun Uply Digital',registerForm()); return; }
  if(e.target.closest('[data-member-scroll]')){document.getElementById('memberStatus')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(e.target.closest('[data-scroll-products]')){ if((location.hash||'#katalog')!=='#katalog'){location.hash='#katalog';setTimeout(()=>document.getElementById('produk')?.scrollIntoView({behavior:'smooth'}),120);}else document.getElementById('produk')?.scrollIntoView({behavior:'smooth'}); return; }
  if(e.target.closest('[data-focus-products]')){ document.getElementById('produk')?.scrollIntoView({behavior:'smooth'}); document.getElementById('search')?.focus(); return; }
  const product = e.target.closest('[data-view-product]'); if(product){ location.hash='#produk/'+encodeURIComponent(product.dataset.viewProduct); return; }
  const galleryPick=e.target.closest('[data-gallery-select]'); if(galleryPick){const img=$('#detailGalleryMain'),info=$('#detailGalleryInfo');if(img&&galleryPick.dataset.src)img.src=galleryPick.dataset.src;document.querySelectorAll('[data-gallery-select]').forEach(b=>b.classList.toggle('active',b===galleryPick));if(info)info.innerHTML=`<strong>${esc(galleryPick.dataset.title||'Informasi produk')}</strong><small>${esc(galleryPick.dataset.caption||'')}</small>`;return;}
  if(e.target.closest('[data-detail-minus]')){const el=$('#detailQty');if(el)el.textContent=Math.max(1,Number(el.textContent||1)-1);return;}
  if(e.target.closest('[data-detail-plus]')){const el=$('#detailQty'),b=e.target.closest('[data-detail-plus]');if(el)el.textContent=Math.min(Number(b.dataset.max||5),Number(el.textContent||1)+1);return;}
  const addCart=e.target.closest('[data-add-cart]');if(addCart){const variantId=document.querySelector('input[name="detailVariant"]:checked')?.value||'';addToCart(addCart.dataset.addCart,Number($('#detailQty')?.textContent||1),variantId);return;}
  const orderNow=e.target.closest('[data-order-now]');if(orderNow){const id=orderNow.dataset.orderNow;const p=state.catalog.products.find(x=>x.id===id);const variantId=document.querySelector('input[name="detailVariant"]:checked')?.value||'';if(p?.hasVariants&&!variantId){msg('Pilih varian terlebih dahulu.');return;}state.checkoutQty=Number($('#detailQty')?.textContent||1);state.checkoutVariantId=variantId;state.pendingCheckout=id;state.pendingVariantId=variantId;if(!state.user||state.user.role!=='user'){openModal('Masuk untuk checkout',loginForm(false));return;}state.pendingCheckout='';state.pendingVariantId='';location.hash='#checkout/'+encodeURIComponent(id)+(variantId?'/'+encodeURIComponent(variantId):'');return;}
  const chip = e.target.closest('[data-filter]'); if(chip){ state.filter=chip.dataset.filter; app.innerHTML=catalogPage(); document.getElementById('produk')?.scrollIntoView(); return; }
  if(e.target.closest('[data-open-login]')){ openModal('Masuk pelanggan',loginForm(false)); return; }
  const tab = e.target.closest('[data-admin-tab]'); if(tab){ state.adminTab=tab.dataset.adminTab; $('#adminContent').innerHTML=adminContent(); return; }
  const editP = e.target.closest('[data-edit-product]'); if(editP){ editProduct(editP.dataset.editProduct); return; }
  const delP=e.target.closest('[data-delete-product]'); if(delP){deleteProductModal(delP.dataset.deleteProduct);return;}
  const confirmDelP=e.target.closest('[data-confirm-delete-product]'); if(confirmDelP){
    const r=await api('deleteProduct',{productId:confirmDelP.dataset.confirmDeleteProduct});closeModal();await refreshAdmin();await loadCatalog();msg(r.mode==='deleted'?'Produk dihapus permanen.':'Produk dihapus dari toko dan diarsipkan karena masih memiliki riwayat/data terkait.');return;
  }
  const restoreP=e.target.closest('[data-restore-product]'); if(restoreP){await restoreProduct(restoreP.dataset.restoreProduct);return;}
  const manageG=e.target.closest('[data-manage-gallery]'); if(manageG){manageProductGallery(manageG.dataset.manageGallery);return;}
  const editM=e.target.closest('[data-edit-media]'); if(editM){editProductMedia(editM.dataset.productId,editM.dataset.editMedia||'');return;}
  const delM=e.target.closest('[data-delete-media]'); if(delM){if(confirm('Hapus gambar galeri ini?')){try{await api('deleteProductMedia',{mediaId:delM.dataset.deleteMedia});await refreshAdmin();await loadCatalog();manageProductGallery(delM.dataset.productId);msg('Gambar galeri dihapus.');}catch(err){msg(err.message)}}return;}
  const manageV=e.target.closest('[data-manage-variants]'); if(manageV){manageVariants(manageV.dataset.manageVariants);return;}
  const editV=e.target.closest('[data-edit-variant]'); if(editV){editVariant(editV.dataset.productId,editV.dataset.editVariant||'');return;}
  const stockV=e.target.closest('[data-stock-variant]'); if(stockV){adjustVariantStockModal(stockV.dataset.stockVariant);return;}
  const delV=e.target.closest('[data-delete-variant]'); if(delV){if(confirm('Hapus varian ini? Jika pernah dipakai pada order, varian akan dinonaktifkan agar riwayat tetap aman.')){try{await api('deleteProductVariant',{variantId:delV.dataset.deleteVariant});await refreshAdmin();await loadCatalog();closeModal();msg('Varian diperbarui.');}catch(err){msg(err.message)}}return;}
  const stockP=e.target.closest('[data-stock-product]'); if(stockP){adjustStockModal(stockP.dataset.stockProduct);return;}
  const gotoInv=e.target.closest('[data-goto-inventory]'); if(gotoInv){state.adminTab='inventory';state.inventoryProduct=gotoInv.dataset.gotoInventory;$('#adminContent').innerHTML=adminContent();return;}
  const editB = e.target.closest('[data-edit-bank]'); if(editB){ editBank(editB.dataset.editBank); return; }
  const ao = e.target.closest('[data-admin-order]'); if(ao){ adminOrderModal(ao.dataset.adminOrder); return; }
  const checkout = e.target.closest('[data-checkout]'); if(checkout){
    const id=checkout.dataset.checkout; const p=state.catalog?.products?.find(x=>x.id===id);
    if(!p){msg('Produk tidak ditemukan.');return;}
    if(!state.catalog.settings.storeOpen){msg('Toko sedang menutup pesanan baru.');return;}
    if(p.stock===0){msg('Stok produk sedang habis.');return;}
    if(p.hasVariants){closeModal();location.hash='#produk/'+encodeURIComponent(id);msg('Pilih varian sebelum checkout.');return;}
    state.pendingCheckout=id; state.pendingVariantId=''; closeModal();
    if(!state.user || state.user.role!=='user'){openModal('Masuk untuk checkout',loginForm(false)+`<p class="tiny center">Setelah berhasil masuk, kamu akan langsung kembali ke checkout ${esc(p.name)}.</p>`);return;}
    state.pendingCheckout=''; location.hash='#checkout/'+encodeURIComponent(id); if((location.hash||'')==='#checkout/'+encodeURIComponent(id)) await route(); return;
  }
  const checkoutLogin=e.target.closest('[data-checkout-login]'); if(checkoutLogin){state.pendingCheckout=checkoutLogin.dataset.checkoutLogin;state.pendingVariantId=checkoutLogin.dataset.variantId||'';openModal('Masuk untuk checkout',loginForm(false));return;}
  const pay = e.target.closest('[data-pay]'); if(pay){ try{const r=await api('retryPayment',{orderId:pay.dataset.pay}); if(r.paymentUrl){location.href=r.paymentUrl;}else{state.orders=await api('orders');await route();msg(r.paymentData?.qrUrl?'Pembayaran Midtrans berhasil dibuat. Silakan lanjutkan ke halaman pembayaran.':'Instruksi pembayaran berhasil dibuat.');}}catch(err){msg(err.message)} return; }
  const syncPay=e.target.closest('[data-sync-pay]'); if(syncPay){try{const r=await api('syncPaymentStatus',{orderId:syncPay.dataset.syncPay});state.orders=await api('orders');await route();msg(r.state==='success'?'Pembayaran sudah terverifikasi.':'Status pembayaran diperbarui.');}catch(err){msg(err.message)}return;}
  const cancel = e.target.closest('[data-cancel]'); if(cancel){ if(confirm('Batalkan pesanan ini?')){try{await api('cancelOrder',{orderId:cancel.dataset.cancel});state.orders=await api('orders');state.user=await api('me');setAccount();await route();msg('Pesanan dibatalkan.')}catch(err){msg(err.message)}}return; }
  const cred = e.target.closest('[data-order-credentials]'); if(cred){ try{const r=await api('getOrderCredentials',{orderId:cred.dataset.orderCredentials});openModal('Login akun untuk proses',`<div class="notice warn"><strong>Data sensitif.</strong><br>Gunakan hanya untuk pesanan ini. Jangan meminta OTP, recovery code, atau kode 2FA.</div><label class="field">Email<input readonly value="${esc(r.email)}"></label><label class="field">Password<div class="copy-secret-row"><input readonly type="password" id="credentialPassword" value="${esc(r.password)}"><button class="btn light small" type="button" data-copy="${esc(r.password)}">Salin</button></div></label>`);}catch(err){msg(err.message)} return; }
  const proof = e.target.closest('[data-proof]'); if(proof){ try{const r=await api('getProof',{orderId:proof.dataset.proof}); const url=`data:${r.mime};base64,${r.base64}`; window.open(url,'_blank','noopener,noreferrer');}catch(err){msg(err.message)} return; }
  const printInv = e.target.closest('[data-print-invoice]'); if(printInv){ printInvoice(printInv.dataset.printInvoice); return; }
  const copy = e.target.closest('[data-copy]'); if(copy){ try{await navigator.clipboard.writeText(copy.dataset.copy);msg('Berhasil disalin.')}catch{msg('Tidak bisa menyalin otomatis.')} return; }
  const toggle = e.target.closest('[data-inventory-toggle]'); if(toggle){ try{await api('inventorySetStatus',{inventoryId:toggle.dataset.inventoryToggle,status:toggle.dataset.nextStatus});await refreshAdmin();msg('Status inventory diperbarui.')}catch(err){msg(err.message)} return; }
  const quick = e.target.closest('[data-quick]'); if(quick){ const q=quick.dataset.quick;if(q==='add-product'){editProduct('');return;}if(q==='inventory'){state.adminTab='inventory';$('#adminContent').innerHTML=adminContent();return;}if(q==='review'){state.adminTab='orders';state.adminOrderStatus='review';$('#adminContent').innerHTML=adminContent();return;}if(q==='settings'){state.adminTab='settings';$('#adminContent').innerHTML=adminContent();return;} }
  const ev=e.target.closest('[data-edit-voucher]'); if(ev){editVoucher(ev.dataset.editVoucher||'');return;}
  const tv=e.target.closest('[data-toggle-voucher]'); if(tv){try{await api('toggleVoucher',{code:tv.dataset.toggleVoucher,active:tv.dataset.active==='true'});await refreshAdmin();msg('Status voucher diperbarui.');}catch(err){msg(err.message)}return;}
  const bal=e.target.closest('[data-balance-user]'); if(bal){balanceAdjustModal(bal.dataset.balanceUser);return;}
  const tier=e.target.closest('[data-tier-user]'); if(tier){tierModal(tier.dataset.tierUser);return;}
  const newClaim=e.target.closest('[data-new-claim]'); if(newClaim){claimModal(newClaim.dataset.newClaim);return;}
  if(e.target.closest('[data-read-customer-notifications]')){try{await api('markCustomerNotificationsRead',{});state.customerNotifications=await api('customerNotifications');await route();msg('Notifikasi ditandai sudah dibaca.');}catch(err){msg(err.message)}return;}
  const editClaim=e.target.closest('[data-edit-claim]'); if(editClaim){adminClaimModal(editClaim.dataset.editClaim);return;}
  const claimShot=e.target.closest('[data-claim-screenshot]'); if(claimShot){try{const r=await api('getWarrantyScreenshot',{claimId:claimShot.dataset.claimScreenshot});const url=`data:${r.mime};base64,${r.base64}`;openModal('Screenshot klaim',`<div class="claim-shot"><img src="${url}" alt="Screenshot klaim"><p class="tiny">${esc(r.name||'Screenshot pelanggan')}</p></div>`);}catch(err){msg(err.message)}return;}
  const syncAdminPay=e.target.closest('[data-admin-sync-payment]'); if(syncAdminPay){try{const r=await api('adminSyncPayment',{orderId:syncAdminPay.dataset.adminSyncPayment});await refreshAdmin();msg(r.state==='success'?'Pembayaran terverifikasi.':'Status gateway sudah diperbarui.');}catch(err){msg(err.message)}return;}
  if(e.target.closest('[data-export-report]')){exportReportCSV();return;}
  if(e.target.closest('[data-read-notifications]')){try{await api('markNotificationsRead',{});await refreshAdmin();msg('Notifikasi ditandai sudah dibaca.');}catch(err){msg(err.message)}return;}
  if(e.target.closest('[data-admin-refresh]')){ try{await refreshAdmin();msg('Data admin diperbarui.')}catch(err){msg(err.message)} return; }
  if(e.target.closest('[data-cart-voucher]')){ const code=String($('#cartVoucher')?.value||'').trim(); const p=cartProduct(); if(!code||!p){msg('Masukkan kode voucher terlebih dahulu.');return;} if(!state.user||state.user.role!=='user'){state.pendingCheckout=p.id;openModal('Masuk untuk voucher',loginForm(false));return;} try{const q=await api('validateVoucher',{code,productId:p.id,variantId:state.cart?.variantId||'',quantity:Number(state.cart?.qty||1)});state.appliedVoucher={...q,productId:p.id,variantId:state.cart?.variantId||'',qty:Number(state.cart?.qty||1)};msg(`Voucher ${q.code} aktif. Hemat ${money(q.discount)}.`);openCart();}catch(err){state.appliedVoucher=null;msg(err.message);} return; }
  if(e.target.closest('[data-checkout-voucher]')){ const form=$('#checkoutForm'), code=String($('#checkoutVoucher')?.value||'').trim(); const p=state.catalog.products.find(x=>x.id===form?.dataset.productId); if(!code||!p){msg('Masukkan kode voucher terlebih dahulu.');return;} try{const q=await api('validateVoucher',{code,productId:p.id,variantId:form.dataset.variantId||'',quantity:Number(form.elements.quantity?.value||1)});state.appliedVoucher={...q,productId:p.id,variantId:form.dataset.variantId||'',qty:Number(form.elements.quantity?.value||1)};const h=$('#voucherHint');if(h)h.textContent=`Voucher ${q.code} aktif · hemat ${money(q.discount)}`;checkoutRecalc();msg('Voucher berhasil diterapkan.');}catch(err){state.appliedVoucher=null;checkoutRecalc();msg(err.message);} return; }
});

document.addEventListener('click', async e => {
  if(e.target.closest('[data-register]')){ if(state.user){location.hash=state.user.role==='admin'?'#admin':'#dashboard';closeModal();return;} openModal('Daftar akun',registerForm()); return; }
  if(e.target.closest('[data-logout]')){ try{await api('logout');}catch{} state.token='';state.user=null;state.admin=null;localStorage.removeItem('uply_token');setAccount();closeModal();location.hash='#katalog';msg('Kamu sudah keluar.'); }
  if(e.target.closest('[data-logout-all]')){ if(!confirm('Logout dari semua perangkat? Kamu perlu login kembali di perangkat ini.')) return; try{await api('logoutAll');}catch(err){msg(err.message);return;} state.token='';state.user=null;state.admin=null;localStorage.removeItem('uply_token');setAccount();closeModal();location.hash='#katalog';msg('Semua sesi akun sudah dikeluarkan.'); }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const b = f.querySelector('[type=submit]');
  if(b){ b.disabled=true; b.dataset.old=b.textContent; b.textContent='Sebentar…'; }
  try{
    const fd = new FormData(f); const g=k=>String(fd.get(k)||'');
    if(f.id==='userLogin'){
      const r=await api('login',{email:g('email'),password:g('password')});state.token=r.token;state.user=r.user;localStorage.setItem('uply_token',r.token);setAccount();closeModal();msg('Berhasil masuk.');if(state.pendingCheckout){const id=state.pendingCheckout,v=state.pendingVariantId;state.pendingCheckout='';state.pendingVariantId='';location.hash='#checkout/'+encodeURIComponent(id)+(v?'/'+encodeURIComponent(v):'');await route();}else{location.hash='#dashboard';await route();}
    } else if(f.id==='register'){
      if(g('password')!==g('password2')) throw Error('Ulangi password harus sama.');
      const r=await api('register',{name:g('name'),email:g('email'),password:g('password')});state.token=r.token;state.user=r.user;localStorage.setItem('uply_token',r.token);setAccount();closeModal();msg('Akun berhasil dibuat.');if(state.pendingCheckout){const id=state.pendingCheckout,v=state.pendingVariantId;state.pendingCheckout='';state.pendingVariantId='';location.hash='#checkout/'+encodeURIComponent(id)+(v?'/'+encodeURIComponent(v):'');await route();}else{location.hash='#dashboard';await route();}
    } else if(f.id==='adminLogin'){
      const r=await api('adminLogin',{email:g('email'),password:g('password')});state.token=r.token;state.user=r.user;localStorage.setItem('uply_token',r.token);setAccount();msg('Login admin berhasil.');await route();
    } else if(f.id==='profileForm'){
      state.user=await api('updateProfile',{name:g('name'),email:g('email'),phone:g('phone')});setAccount();msg('Profil berhasil diperbarui.');await route();
    } else if(f.id==='passwordForm'){
      if(g('newPassword')!==g('newPassword2')) throw Error('Ulangi password baru harus sama.');
      await api('changePassword',{currentPassword:g('currentPassword'),newPassword:g('newPassword')});f.reset();msg('Password berhasil diubah.');
    } else if(f.id==='claimForm'){
      const file=f.elements.screenshot?.files?.[0]||null; let upload=null;
      if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Screenshot harus JPG, PNG, atau WebP.');if(file.size>1350000) throw Error('Screenshot maksimal sekitar 1,3 MB.');const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(Error('Gagal membaca screenshot.'));r.readAsDataURL(file)});upload={name:file.name,mime:file.type,base64};}
      const r=await api('createWarrantyClaim',{orderId:f.dataset.orderId,category:g('category'),description:g('description'),file:upload});closeModal();[state.orders,state.claims]=await Promise.all([api('orders'),api('claims')]);location.hash='#garansi';await route();msg(`Klaim ${r.id} berhasil dikirim.`);
    } else if(f.id==='adminClaimForm'){
      await api('updateWarrantyClaim',{claimId:f.dataset.id,status:g('status'),adminNote:g('adminNote')});closeModal();await refreshAdmin();msg('Status klaim diperbarui.');
    } else if(f.id==='checkoutForm'){
      if(!fd.has('agree')) throw Error('Centang persetujuan ketentuan produk terlebih dahulu.');
      if(g('channel')==='whatsapp' && !g('phone').trim()) throw Error('Isi nomor WhatsApp jika detail ingin dikirim lewat WhatsApp.');
      const requestPayload={productId:f.dataset.productId,variantId:f.dataset.variantId||'',quantity:Number(g('quantity')),name:g('name'),phone:g('phone'),channel:g('channel'),bankId:g('bankId'),customerNote:g('customerNote'),accountEmail:g('accountEmail'),accountPassword:g('accountPassword'),paymentMethod:g('paymentMethod'),paymentChannel:g('paymentChannel'),voucherCode:g('voucherCode')||state.appliedVoucher?.code||'',useBalance:fd.has('useBalance'),agree:true};
      await api('checkoutPreflight',requestPayload);
      const req=f.dataset.requestId||(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
      f.dataset.requestId=req;
      const r=await api('createOrder',{...requestPayload,requestId:req});
      delete f.dataset.requestId;
      state.orders=await api('orders'); state.user=await api('me'); setAccount();
      state.checkoutQty=1;state.appliedVoucher=null;if(state.cart?.productId===f.dataset.productId&&String(state.cart?.variantId||'')===String(f.dataset.variantId||'')){state.cart=null;saveCart();}
      if(r.paymentUrl){msg('Pesanan dibuat. Membuka pembayaran…');setTimeout(()=>location.assign(r.paymentUrl),650)}
      else{location.hash='#pesanan/'+encodeURIComponent(r.order.id);await route();msg(r.paymentError?`Pesanan dibuat, tetapi Midtrans error: ${r.paymentError}`:'Pesanan berhasil dibuat. Lanjutkan pembayaran.')}
    } else if(f.id==='proofForm'){
      const file=f.elements.proof.files[0];if(!file)throw Error('Pilih file bukti.');if(file.size>1100000)throw Error('Ukuran bukti maksimal sekitar 1 MB.');
      const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});
      await api('uploadProof',{orderId:f.dataset.order,fileName:file.name,mime:file.type,base64});state.orders=await api('orders');await route();msg('Bukti pembayaran dikirim.');
    } else if(f.id==='productForm'){
      const thumbFile=f.elements.thumbnailFile?.files?.[0]||null;
      let thumbnailUpload=null;
      if(thumbFile){
        if(!['image/jpeg','image/png','image/webp'].includes(thumbFile.type)) throw Error('Thumbnail harus JPG, PNG, atau WebP.');
        if(thumbFile.size>1048576) throw Error('Ukuran thumbnail maksimal 1 MB.');
        const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(Error('Gagal membaca file thumbnail.'));r.readAsDataURL(thumbFile)});
        thumbnailUpload={mime:thumbFile.type,base64};
      }
      await api('saveProduct',{product:{id:f.dataset.id,name:g('name'),category:g('category'),duration:g('duration'),price:Number(g('price')),costPrice:Number(g('costPrice')||0),warrantyDays:Number(g('warrantyDays')||0),salePrice:Number(g('salePrice')||0),saleStartsAt:g('saleStartsAt'),saleEndsAt:g('saleEndsAt'),stock:Number(g('stock')),description:g('description'),benefits:g('benefits').split('\n').map(x=>x.trim()).filter(Boolean),terms:g('terms'),badge:g('badge'),icon:g('icon'),thumbnail:g('thumbnail'),thumbnailUpload,clearUploadedThumbnail:fd.has('clearUploadedThumbnail'),featured:fd.has('featured'),requiresLoginCredentials:fd.has('requiresLoginCredentials'),fulfillmentMode:g('fulfillmentMode'),lowStockThreshold:Number(g('lowStockThreshold')||3),active:fd.has('active')}});
      closeModal();await refreshAdmin();await loadCatalog();msg('Produk disimpan.');
    } else if(f.id==='productMediaForm'){
      const mediaFile=f.elements.imageFile?.files?.[0]||null; let imageUpload=null;
      if(mediaFile){if(!['image/jpeg','image/png','image/webp'].includes(mediaFile.type))throw Error('Gambar galeri harus JPG, PNG, atau WebP.');if(mediaFile.size>1350000)throw Error('Ukuran gambar galeri maksimal sekitar 1,3 MB.');const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(Error('Gagal membaca gambar galeri.'));r.readAsDataURL(mediaFile)});imageUpload={mime:mediaFile.type,base64};}
      await api('saveProductMedia',{media:{id:f.dataset.id,productId:f.dataset.productId,kind:g('kind'),title:g('title'),caption:g('caption'),imageUrl:g('imageUrl'),imageUpload,keepExistingImage:!!f.dataset.id,clearUploadedImage:fd.has('clearUploadedImage'),sortOrder:Number(g('sortOrder')||0),active:fd.has('active')}});
      const productId=f.dataset.productId;closeModal();await refreshAdmin();await loadCatalog();manageProductGallery(productId);msg('Gambar galeri disimpan.');
    } else if(f.id==='variantForm'){
      await api('saveProductVariant',{variant:{id:f.dataset.id,productId:f.dataset.productId,name:g('name'),subtitle:g('subtitle'),price:Number(g('price')),costPrice:Number(g('costPrice')||0),warrantyDays:Number(g('warrantyDays')||0),salePrice:Number(g('salePrice')||0),saleStartsAt:g('saleStartsAt'),saleEndsAt:g('saleEndsAt'),compareAtPrice:Number(g('compareAtPrice')||0),stock:Number(g('stock')),badge:g('badge'),sortOrder:Number(g('sortOrder')||0),active:fd.has('active')}});
      closeModal();await refreshAdmin();await loadCatalog();msg('Varian disimpan.');
    } else if(f.id==='variantStockForm'){
      const updated=await api('adjustVariantStock',{variantId:f.dataset.id,operation:g('operation'),amount:Number(g('amount'))});closeModal();await refreshAdmin();await loadCatalog();msg(`Stok varian sekarang ${updated.stock===-1?'Tanpa Batas':updated.stock}.`);
    } else if(f.id==='stockAdjustForm'){
      const operation=g('operation'), amount=Number(g('amount'));const updated=await api('adjustProductStock',{productId:f.dataset.id,operation,amount});closeModal();await refreshAdmin();await loadCatalog();msg(`Stok ${updated.name} sekarang ${updated.stock===-1?'Tanpa Batas':updated.stock}.`);
    } else if(f.id==='bankForm'){
      await api('saveBank',{bank:{id:f.dataset.id,name:g('name'),number:g('number'),holder:g('holder'),active:fd.has('active')}});closeModal();await refreshAdmin();state.catalog=null;msg('Rekening disimpan.');
    } else if(f.id==='settingsForm'){
      const qrisFile=f.elements.qrisFile?.files?.[0]||null; let qrisUpload=null;
      if(qrisFile){if(!['image/jpeg','image/png','image/webp'].includes(qrisFile.type))throw Error('QRIS harus JPG, PNG, atau WebP.');if(qrisFile.size>1350000)throw Error('Ukuran QRIS maksimal sekitar 1,3 MB.');const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(qrisFile)});qrisUpload={mime:qrisFile.type,base64};}
      await api('saveSettings',{settings:{storeName:g('storeName'),whatsapp:g('whatsapp'),hours:g('hours'),paymentHours:Number(g('paymentHours')),notice:g('notice'),promoBanner:g('promoBanner'),storeOpen:fd.has('storeOpen'),manualPaymentEnabled:fd.has('manualPaymentEnabled'),midtransPaymentEnabled:fd.has('midtransPaymentEnabled'),balancePaymentEnabled:fd.has('balancePaymentEnabled'),autoRoleEnabled:fd.has('autoRoleEnabled'),qrisName:g('qrisName'),qrisUpload,clearQris:fd.has('clearQris')}});await refreshAdmin();await loadCatalog();msg('Pengaturan disimpan.');
    } else if(f.id==='inventoryAddForm'){
      const [productId,variantId='']=g('targetKey').split('::');await api('inventoryAdd',{productId,variantId,itemValue:g('itemValue'),note:g('note'),status:g('status')});f.reset();await refreshAdmin();msg('1 item inventory berhasil ditambahkan.');
    } else if(f.id==='inventoryBulkForm'){
      const [productId,variantId='']=g('targetKey').split('::');const items=g('items').split('\n').map(x=>x.trim()).filter(Boolean);await api('inventoryImport',{productId,variantId,items});f.reset();await refreshAdmin();msg(`${items.length} item inventory ditambahkan.`);
    } else if(f.id==='voucherForm'){
      const productIds=Array.from(f.elements.productIds?.selectedOptions||[]).map(o=>o.value);
      await api('saveVoucher',{voucher:{code:g('code'),name:g('name'),discountType:g('discountType'),discountValue:Number(g('discountValue')),minSpend:Number(g('minSpend')),maxDiscount:Number(g('maxDiscount')),usageLimit:Number(g('usageLimit')),perUserLimit:Number(g('perUserLimit')),category:g('category'),productIds,newCustomersOnly:fd.has('newCustomersOnly'),active:fd.has('active'),startsAt:g('startsAt'),endsAt:g('endsAt')}});closeModal();await refreshAdmin();msg('Voucher disimpan.');
    } else if(f.id==='balanceForm'){
      await api('adjustBalance',{userId:f.dataset.userId,amount:Number(g('amount')),note:g('note')});closeModal();await refreshAdmin();msg('Saldo pelanggan diperbarui.');
    } else if(f.id==='tierForm'){
      await api('setCustomerTier',{userId:f.dataset.userId,tier:g('tier')});closeModal();await refreshAdmin();msg('Role pelanggan diperbarui.');
    } else if(f.id==='orderForm'){
      await api('updateOrder',{orderId:f.dataset.id,status:g('status'),delivery:g('delivery'),note:g('note'),confirmPayment:fd.has('confirmPayment')});closeModal();await refreshAdmin();msg('Pesanan diperbarui.');
    }
  } catch(err){
    const inline=f.id==='checkoutForm'?$('#checkoutError'):null;
    if(inline){inline.hidden=false;inline.textContent=err.message||'Checkout belum berhasil.';inline.scrollIntoView({behavior:'smooth',block:'center'});}
    msg(err.message);
  }
  finally { if(b){ b.disabled=false; b.textContent=b.dataset.old || 'Simpan'; } }
});

window.addEventListener('hashchange', ()=>route().catch(e=>{app.innerHTML=`<div class="empty">${esc(e.message)}</div>`}));

async function start(){
  $('#year').textContent = new Date().getFullYear();
  try {
    await loadCatalog(); await restore(); setAccount();
    const returnedOrder=new URLSearchParams(location.search).get('payment_return');
    if(returnedOrder && state.user?.role==='user'){
      try{await api('syncPaymentStatus',{orderId:returnedOrder});state.orders=await api('orders');}catch(e){console.warn('Payment return sync',e.message);}
      history.replaceState(null,'',location.pathname+location.hash);
    }
    await route();
  }
  catch(e){ app.innerHTML = `<section class="page"><div class="wrap"><div class="notice error"><strong>Website belum terhubung dengan benar.</strong><br>${esc(e.message)}</div><p class="tiny">Periksa Environment Variables, database, dan deployment Vercel.</p></div></section>`; }
}
start();
