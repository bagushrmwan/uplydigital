import { ensureSchema, q, pool, getSettings, audit } from '../lib/db.js';
import { id, normalizeEmail, validEmail, hashPassword, verifyPassword, safeEqual, createSession, requireAuth, requireAdmin, destroySession, securityReady, credentialSecurityReady, encryptCredentialPayload, decryptCredentialPayload } from '../lib/security.js';
import { createPayment, getPaymentStatus, expirePayment, midtransEnabled, paymentMode as configuredPaymentMode } from '../lib/midtrans.js';
import { applyMidtransStatus, autoFulfillOrder } from '../lib/payment-state.js';
import { sendEmail } from '../lib/email.js';
import { syncMembership, notifyAdmin, refundOrderCredits, tierFromStats } from '../lib/business.js';

function safeError(message,status=400){ const e=new Error(message); e.safe=true; e.status=status; return e; }
function text(v,max=500){ return String(v??'').trim().slice(0,max); }
function bool(v){ return v===true || String(v).toLowerCase()==='true'; }
function phone(v,required=false){
  let p=text(v,24).replace(/[\s()+-]/g,''); if(p.startsWith('0')) p='62'+p.slice(1);
  if(!p&&!required) return ''; if(!/^[1-9]\d{8,14}$/.test(p)) throw safeError('Nomor WhatsApp tidak valid.'); return p;
}
function publicProduct(r,availableInventory){
  const uploaded=!!r.thumbnail_data;
  const thumbnail=uploaded?`/api/product-image?id=${encodeURIComponent(r.id)}&v=${encodeURIComponent(new Date(r.updated_at||Date.now()).getTime())}`:(r.thumbnail_url||'');
  return {id:r.id,name:r.name,category:r.category,duration:r.duration,price:Number(r.price),description:r.description,benefits:Array.isArray(r.benefits)?r.benefits:[],terms:r.terms,stock:r.fulfillment_mode==='inventory'?availableInventory:Number(r.stock),active:r.active,badge:r.badge,icon:r.icon,fulfillmentMode:r.fulfillment_mode,thumbnail,hasUploadedThumbnail:uploaded,featured:!!r.featured,requiresLoginCredentials:!!r.requires_login_credentials,soldCount:Number(r.sold_count||0),bestSeller:!!r.best_seller,lowStockThreshold:Number(r.low_stock_threshold||3)};
}
function publicOrder(o,admin=false){
  const gp=o.gateway_payload&&typeof o.gateway_payload==='object'?o.gateway_payload:{};
  const va=Array.isArray(gp.va_numbers)&&gp.va_numbers[0]?gp.va_numbers[0]:{};
  const paymentData={method:o.gateway_payment_method||gp.payment_type||'',channel:o.gateway_payment_channel||gp.bank||va.bank||'',transactionId:o.gateway_transaction_id||gp.transaction_id||'',snapToken:gp.token||'',qrUrl:'',qrContent:'',vaNumber:gp.permata_va_number||va.va_number||'',paymentCode:gp.payment_code||'',billKey:gp.bill_key||'',billerCode:gp.biller_code||'',paymentUrl:o.payment_url||gp.redirect_url||gp.finish_redirect_url||'',expiredAt:null,fee:0,feeBearer:'',amount:Number(gp.gross_amount||o.total||0)};
  return {id:o.id,userId:admin?o.user_id:undefined,email:o.email,name:o.name,phone:o.phone,channel:o.channel,productId:o.product_id,productName:o.product_name,productThumbnail:o.product_thumbnail||'',duration:o.duration,quantity:Number(o.quantity),price:Number(o.price),subtotal:Number(o.subtotal||Number(o.price)*Number(o.quantity)),discount:Number(o.discount||0),voucherCode:o.voucher_code||'',balanceUsed:Number(o.balance_used||0),total:Number(o.total),status:o.status,paymentMode:o.payment_mode,gatewayStatus:o.gateway_status,paymentUrl:o.payment_url, paymentData,createdAt:o.created_at,expiresAt:o.expires_at,updatedAt:o.updated_at,paymentSubmittedAt:o.payment_submitted_at,paymentVerifiedAt:o.payment_verified_at,processingAt:o.processing_at,completedAt:o.completed_at,hasProof:!!o.proof_name,proofName:o.proof_name,delivery:o.delivery,note:o.note,hasCredentials:admin?!!o.credentials_enc:undefined,credentialsStatus:admin?(o.credentials_status||''):undefined,credentialsViewedAt:admin?o.credentials_viewed_at:undefined,bank:o.bank_id?{id:o.bank_id,name:o.bank_name,number:o.bank_number,holder:o.bank_holder}:null};
}
function originHeaders(req){
  const origin=String(req.headers.origin||''); const allowed=process.env.ALLOWED_ORIGIN||process.env.SITE_URL||'';
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  if(origin && allowed && origin===allowed) h['Access-Control-Allow-Origin']=origin;
  h['Access-Control-Allow-Headers']='Content-Type, Authorization'; h['Access-Control-Allow-Methods']='POST, OPTIONS'; return h;
}
function send(res,status,obj,headers){ res.status(status); Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v)); return res.end(JSON.stringify(obj)); }
async function expireOldOrders(){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows:expired}=await client.query(`SELECT id,user_id,product_id,quantity,stock_reserved,balance_used,voucher_code,credit_refunded FROM orders WHERE status='pending_payment' AND expires_at<NOW() FOR UPDATE`);
    for(const o of expired){
      if(o.stock_reserved) await client.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.product_id,o.quantity]);
      if(!o.credit_refunded){
        const amount=Number(o.balance_used||0);
        if(amount>0){await client.query('UPDATE users SET balance=balance+$2,updated_at=NOW() WHERE id=$1',[o.user_id,amount]);await client.query(`INSERT INTO balance_ledger(user_id,amount,type,reference,note,actor) VALUES($1,$2,'refund',$3,'Refund otomatis order kedaluwarsa','system')`,[o.user_id,amount,o.id]);}
        if(o.voucher_code) await client.query('DELETE FROM voucher_usages WHERE order_id=$1',[o.id]);
      }
    }
    await client.query(`UPDATE orders SET status='cancelled',note=CASE WHEN note='' THEN 'Pesanan otomatis kedaluwarsa.' ELSE note END,credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW(),stock_reserved=FALSE,credit_refunded=TRUE WHERE status='pending_payment' AND expires_at<NOW()`);
    await client.query('DELETE FROM sessions WHERE expires_at<NOW()');
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}
}
async function catalog(){
  const [pr,ir,br,s,sales]=await Promise.all([
    q(`SELECT p.*,COALESCE(sc.sold_count,0)::int AS sold_count FROM products p LEFT JOIN (SELECT product_id,COUNT(*)::int AS sold_count FROM orders WHERE status='completed' GROUP BY product_id) sc ON sc.product_id=p.id WHERE p.active=TRUE ORDER BY p.featured DESC,p.created_at,p.id`),
    q(`SELECT product_id,COUNT(*)::int AS available FROM inventory WHERE status='available' GROUP BY product_id`),
    q('SELECT id,name,number,holder,active FROM banks WHERE active=TRUE ORDER BY created_at,id'),
    getSettings(),
    q(`SELECT product_id,COUNT(*)::int AS n FROM orders WHERE status='completed' GROUP BY product_id ORDER BY n DESC LIMIT 3`)
  ]);
  const inv=Object.fromEntries(ir.rows.map(x=>[x.product_id,Number(x.available)]));
  const best=new Set(sales.rows.filter(x=>Number(x.n)>0).map(x=>x.product_id));
  const products=pr.rows.map(p=>publicProduct({...p,best_seller:best.has(p.id)},inv[p.id]||0));
  const methods=availablePaymentMethods(s,br.rows);
  const cfg=configuredPaymentMode();
  return {products,banks:br.rows,paymentMethods:methods,settings:{storeName:s.storeName||'Uply Digital',whatsapp:s.whatsapp||'',hours:s.hours||'',storeOpen:bool(s.storeOpen),paymentHours:Number(s.paymentHours)||24,notice:s.notice||'',promoBanner:s.promoBanner||'',paymentMode:cfg,paymentReady:methods.some(m=>m.id!=='balance'),paymentProvider:methods.map(m=>m.label).join(' · '),manualPaymentEnabled:bool(s.manualPaymentEnabled),midtransPaymentEnabled:bool(s.midtransPaymentEnabled),balancePaymentEnabled:bool(s.balancePaymentEnabled),qrisManualReady:!!s.qrisImageData,qrisName:s.qrisName||'QRIS Manual'}};
}
async function getUserById(userId){ const {rows}=await q(`SELECT u.id,u.email,u.name,u.phone,u.balance,u.membership_tier,u.membership_manual,u.created_at,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_count,COALESCE(SUM(CASE WHEN o.status='completed' THEN COALESCE(NULLIF(o.subtotal,0),o.price*o.quantity)-o.discount ELSE 0 END),0)::bigint AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.id=$1 GROUP BY u.id LIMIT 1`,[userId]); const u=rows[0]; if(!u)return u; const settings=await getSettings(); const autoEnabled=bool(settings.autoRoleEnabled); const tier=(u.membership_manual||!autoEnabled)?(u.membership_tier||'customer'):tierFromStats(u.completed_count,u.spent); return {...u,balance:Number(u.balance||0),membershipTier:tier,membershipManual:!!u.membership_manual,completedCount:Number(u.completed_count||0),spent:Number(u.spent||0)}; }
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function voucherQuote({code,userId,product,qty,client=null}){
  const db=client||{query:(t,p)=>q(t,p)}; const c=text(code,40).toUpperCase();
  if(!c) return {code:'',discount:0,label:''};
  const {rows}=await db.query(`SELECT * FROM vouchers WHERE UPPER(code)=UPPER($1) AND active=TRUE LIMIT 1`,[c]); const v=rows[0];
  if(!v) throw safeError('Kode voucher tidak ditemukan atau tidak aktif.');
  const now=Date.now(); if(v.starts_at&&new Date(v.starts_at).getTime()>now) throw safeError('Voucher belum dapat digunakan.'); if(v.ends_at&&new Date(v.ends_at).getTime()<now) throw safeError('Voucher sudah berakhir.');
  const subtotal=Number(product.price)*Number(qty);
  if(subtotal<Number(v.min_spend||0)) throw safeError(`Minimum transaksi voucher adalah Rp${Number(v.min_spend||0).toLocaleString('id-ID')}.`);
  if(v.category && String(v.category).toLowerCase()!==String(product.category).toLowerCase()) throw safeError('Voucher tidak berlaku untuk kategori produk ini.');
  const ids=Array.isArray(v.product_ids)?v.product_ids:[]; if(ids.length&&!ids.includes(product.id)) throw safeError('Voucher tidak berlaku untuk produk ini.');
  const totalUse=await db.query('SELECT COUNT(*)::int AS n FROM voucher_usages WHERE voucher_code=$1',[v.code]);
  if(Number(v.usage_limit)>0&&Number(totalUse.rows[0].n)>=Number(v.usage_limit)) throw safeError('Kuota voucher sudah habis.');
  const userUse=await db.query('SELECT COUNT(*)::int AS n FROM voucher_usages WHERE voucher_code=$1 AND user_id=$2',[v.code,userId]);
  if(Number(v.per_user_limit)>0&&Number(userUse.rows[0].n)>=Number(v.per_user_limit)) throw safeError('Batas penggunaan voucher untuk akun ini sudah tercapai.');
  if(v.new_customers_only){const prior=await db.query("SELECT COUNT(*)::int AS n FROM orders WHERE user_id=$1 AND status IN ('processing','completed')",[userId]);if(Number(prior.rows[0].n)>0) throw safeError('Voucher ini khusus pelanggan baru.');}
  let discount=v.discount_type==='percent'?Math.floor(subtotal*Number(v.discount_value)/100):Number(v.discount_value);
  if(Number(v.max_discount)>0) discount=Math.min(discount,Number(v.max_discount)); discount=Math.max(0,Math.min(discount,subtotal));
  return {code:v.code,discount,label:v.name||v.code,type:v.discount_type,value:Number(v.discount_value)};
}

function availablePaymentMethods(settings,banks){
  const methods=[]; const cfg=configuredPaymentMode();
  if(bool(settings.balancePaymentEnabled)) methods.push({id:'balance',label:'Saldo Uply',type:'balance'});
  if(bool(settings.midtransPaymentEnabled) && midtransEnabled()) methods.push({id:'midtrans',label:'Midtrans Otomatis',type:'gateway'});
  if(bool(settings.manualPaymentEnabled) && banks.length) methods.push({id:'manual',label:'Transfer Bank Manual',type:'manual'});
  if(bool(settings.manualPaymentEnabled) && settings.qrisImageData) methods.push({id:'qris_manual',label:settings.qrisName||'QRIS Manual',type:'manual_qris'});
  if(!methods.some(m=>m.id!=='balance')){
    if(cfg==='midtrans'&&midtransEnabled()) methods.push({id:'midtrans',label:'Midtrans Otomatis',type:'gateway'});
    else if(banks.length) methods.push({id:'manual',label:'Transfer Bank Manual',type:'manual'});
  }
  return methods;
}

async function createMidtransForOrder(order){
  if(!midtransEnabled()) throw safeError('Pembayaran Midtrans belum siap. Periksa PAYMENT_MODE=midtrans, MIDTRANS_SERVER_KEY, MIDTRANS_IS_PRODUCTION, dan SITE_URL.',500);
  const currentAttempt=Math.max(0,Number(order.gateway_attempt)||0);
  const nextAttempt=currentAttempt+1;
  const gatewayOrderId=`${order.id}-P${nextAttempt}`.slice(0,50);
  await q(`UPDATE orders SET payment_url='',gateway_status='creating',gateway_order_id=$2,gateway_payment_method='snap',gateway_payment_channel='MIDTRANS',gateway_attempt=$3,updated_at=NOW() WHERE id=$1`,[order.id,gatewayOrderId,nextAttempt]);
  await q(`INSERT INTO payment_attempts(gateway_order_id,order_id,provider,attempt_no,status,payment_url,payload) VALUES($1,$2,'midtrans',$3,'creating','','{}'::jsonb) ON CONFLICT(gateway_order_id) DO UPDATE SET status='creating',updated_at=NOW()`,[gatewayOrderId,order.id,nextAttempt]);
  const fresh=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
  try{
    const payment=await createPayment(fresh,gatewayOrderId);
    const paymentUrl=String(payment.redirect_url||'');
    await q(`UPDATE orders SET payment_url=$2,gateway_status='pending',gateway_transaction_id='',gateway_order_id=$3,gateway_payment_method='snap',gateway_payment_channel='MIDTRANS',gateway_payload=$4::jsonb,updated_at=NOW() WHERE id=$1`,[order.id,paymentUrl,gatewayOrderId,JSON.stringify(payment)]);
    await q(`UPDATE payment_attempts SET status='pending',payment_url=$2,payload=$3::jsonb,updated_at=NOW() WHERE gateway_order_id=$1`,[gatewayOrderId,paymentUrl,JSON.stringify(payment)]);
    return {paymentUrl,paymentData:payment,gatewayOrderId};
  }catch(e){
    await q(`UPDATE orders SET gateway_status='error',updated_at=NOW() WHERE id=$1`,[order.id]);
    await q(`UPDATE payment_attempts SET status='error',payload=$2::jsonb,updated_at=NOW() WHERE gateway_order_id=$1`,[gatewayOrderId,JSON.stringify({error:e?.message||'Midtrans error'})]);
    throw e;
  }
}

export default async function handler(req,res){
  const headers=originHeaders(req);
  if(req.method==='OPTIONS') return send(res,204,{},headers);
  if(req.method!=='POST') return send(res,405,{ok:false,error:'Gunakan POST.'},headers);
  try{
    if(!securityReady()) throw safeError('SESSION_SECRET belum diatur di Vercel Environment Variables.',500);
    await ensureSchema(); await expireOldOrders();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=text(body.action,80); const p=body.payload&&typeof body.payload==='object'?body.payload:{};
    let data;

    if(action==='catalog') data=await catalog();
    else if(action==='register'){
      const email=normalizeEmail(p.email), name=text(p.name,80), password=String(p.password||'');
      if(!validEmail(email)) throw safeError('Email tidak valid.'); if(name.length<2) throw safeError('Nama minimal 2 karakter.'); if(password.length<8||password.length>72) throw safeError('Password harus 8–72 karakter.');
      const exists=await q('SELECT 1 FROM users WHERE email=$1',[email]); if(exists.rowCount) throw safeError('Email ini sudah terdaftar.');
      const hp=hashPassword(password); const userId=id('usr');
      await q('INSERT INTO users(id,email,name,password_salt,password_hash) VALUES($1,$2,$3,$4,$5)',[userId,email,name,hp.salt,hp.hash]);
      const token=await createSession({userId,role:'user',hours:24}); await audit(email,'user_registered',userId,{}); data={token,user:{id:userId,email,name,phone:'',role:'user',balance:0,membershipTier:'customer'}};
    }
    else if(action==='login'){
      const email=normalizeEmail(p.email), password=String(p.password||'');
      const {rows}=await q('SELECT * FROM users WHERE email=$1 LIMIT 1',[email]); const u=rows[0];
      if(!u||!verifyPassword(password,u.password_salt,u.password_hash)) throw safeError('Email atau password salah.',401);
      const token=await createSession({userId:u.id,role:'user',hours:24}); await audit(email,'user_login',u.id,{}); data={token,user:{id:u.id,email:u.email,name:u.name,phone:u.phone,role:'user',balance:Number(u.balance||0),membershipTier:u.membership_tier||'customer'}};
    }
    else if(action==='adminLogin'){
      const email=normalizeEmail(p.email), password=String(p.password||''); const ce=normalizeEmail(process.env.ADMIN_EMAIL); const cp=String(process.env.ADMIN_PASSWORD||'');
      if(!validEmail(ce)||cp.length<8) throw safeError('ADMIN_EMAIL atau ADMIN_PASSWORD belum diatur di Vercel.',500);
      if(!safeEqual(email,ce)||!safeEqual(password,cp)) throw safeError('Email atau password admin salah.',401);
      const token=await createSession({role:'admin',hours:8}); await audit(ce,'admin_login','',{}); data={token,user:{id:null,email:ce,name:'Admin Uply',phone:'',role:'admin'}};
    }
    else if(action==='me'){
      const u=await requireAuth(req); if(u.role==='admin') data={id:null,email:u.email,name:'Admin Uply',phone:'',role:'admin'}; else {const profile=await getUserById(u.id); data={...profile,role:'user'};}
    }
    else if(action==='updateProfile'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const name=text(p.name,80), email=normalizeEmail(p.email), phoneValue=phone(p.phone,false);
      if(name.length<2) throw safeError('Nama minimal 2 karakter.'); if(!validEmail(email)) throw safeError('Email tidak valid.');
      const exists=await q('SELECT id FROM users WHERE email=$1 AND id<>$2 LIMIT 1',[email,u.id]); if(exists.rowCount) throw safeError('Email sudah digunakan akun lain.');
      await q('UPDATE users SET name=$2,email=$3,phone=$4,updated_at=NOW() WHERE id=$1',[u.id,name,email,phoneValue]);
      await audit(email,'user_profile_updated',u.id,{phoneUpdated:!!phoneValue}); const profile=await getUserById(u.id); data={...profile,role:'user'};
    }
    else if(action==='changePassword'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const current=String(p.currentPassword||''), next=String(p.newPassword||''); if(next.length<8||next.length>72) throw safeError('Password baru harus 8–72 karakter.');
      const {rows}=await q('SELECT email,password_salt,password_hash FROM users WHERE id=$1 LIMIT 1',[u.id]); const row=rows[0]; if(!row||!verifyPassword(current,row.password_salt,row.password_hash)) throw safeError('Password saat ini salah.',401);
      if(current===next) throw safeError('Password baru harus berbeda dari password saat ini.'); const hp=hashPassword(next);
      await q('UPDATE users SET password_salt=$2,password_hash=$3,updated_at=NOW() WHERE id=$1',[u.id,hp.salt,hp.hash]); await audit(row.email,'user_password_changed',u.id,{}); data=true;
    }
    else if(action==='logoutAll'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403); await q('DELETE FROM sessions WHERE user_id=$1',[u.id]); await audit(u.email,'user_logout_all',u.id,{}); data=true;
    }
    else if(action==='logout') { await destroySession(req); data=true; }
    else if(action==='orders'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const {rows}=await q('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',[u.id]); data=rows.map(x=>publicOrder(x));
    }
    else if(action==='checkoutPreflight'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const settings=await getSettings(); if(!bool(settings.storeOpen)) throw safeError('Toko sedang menutup pesanan baru.');
      const qty=Number(p.quantity); if(!Number.isInteger(qty)||qty<1||qty>5) throw safeError('Jumlah produk harus 1–5.');
      const {rows}=await q('SELECT * FROM products WHERE id=$1 AND active=TRUE LIMIT 1',[text(p.productId,100)]); const prod=rows[0]; if(!prod) throw safeError('Produk tidak tersedia.');
      if(prod.fulfillment_mode==='inventory'){
        const c=await q(`SELECT COUNT(*)::int AS n FROM inventory WHERE product_id=$1 AND status='available'`,[prod.id]); if(Number(c.rows[0]?.n||0)<qty) throw safeError('Stok inventory otomatis tidak mencukupi.');
      } else if(Number(prod.stock)!==-1 && Number(prod.stock)<qty) throw safeError('Stok produk tidak mencukupi.');
      const requiresLogin=bool(prod.requires_login_credentials)||String(prod.category).toLowerCase().replace(/\s+/g,'')==='topup';
      if(requiresLogin){if(!credentialSecurityReady()) throw safeError('CREDENTIAL_ENCRYPTION_KEY belum diatur untuk produk Top Up.',500);if(!validEmail(normalizeEmail(p.accountEmail))) throw safeError('Email login akun Top Up tidak valid.');const pw=String(p.accountPassword||'');if(pw.length<4||pw.length>200) throw safeError('Password login akun Top Up belum valid.');}
      const {rows:activeBanks}=await q('SELECT * FROM banks WHERE active=TRUE ORDER BY created_at,id');
      const methods=availablePaymentMethods(settings,activeBanks); const allowed=new Set(methods.map(x=>x.id));
      const requested=text(p.paymentMethod,30); const userRow=await q('SELECT balance FROM users WHERE id=$1 LIMIT 1',[u.id]);
      const voucher=await voucherQuote({code:p.voucherCode,userId:u.id,product:prod,qty}); const subtotal=Number(prod.price)*qty; const afterDiscount=Math.max(0,subtotal-Number(voucher.discount||0));
      const balance=bool(p.useBalance)&&bool(settings.balancePaymentEnabled)?Number(userRow.rows[0]?.balance||0):0; const due=Math.max(0,afterDiscount-Math.min(balance,afterDiscount));
      if(due>0){
        if(!requested || !allowed.has(requested)) throw safeError('Pilih metode pembayaran yang tersedia.');
        if(requested==='manual'&&!activeBanks.some(b=>b.id===text(p.bankId,100))) throw safeError('Pilih rekening pembayaran yang aktif.');
        if(requested==='midtrans'&&!midtransEnabled()) throw safeError('Midtrans belum siap. Periksa Environment Variables Vercel.',500);
      }
      data={ready:true,productId:prod.id,quantity:qty,paymentMethod:due===0?'balance':requested};
    }
    else if(action==='createOrder'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const settings=await getSettings(); if(!bool(settings.storeOpen)) throw safeError('Toko sedang menutup pesanan baru.');
      if(p.agree!==true) throw safeError('Setujui ketentuan produk sebelum membuat pesanan.');
      const requestId=text(p.requestId,80); if(!/^[a-zA-Z0-9._-]{12,80}$/.test(requestId)) throw safeError('Muat ulang halaman lalu coba lagi.');
      const existing=await q('SELECT * FROM orders WHERE request_id=$1 AND user_id=$2 LIMIT 1',[requestId,u.id]);
      if(existing.rowCount){data={order:publicOrder(existing.rows[0]),paymentUrl:existing.rows[0].payment_url||'',paymentData:existing.rows[0].gateway_payload||null,duplicate:true};}
      else {
        const qty=Number(p.quantity); if(!Number.isInteger(qty)||qty<1||qty>5) throw safeError('Jumlah produk harus 1–5.');
        const client=await pool.connect(); let order=null,prod=null,mode='manual',voucher={code:'',discount:0}; let lowStockAfter=null;
        try{
          await client.query('BEGIN');
          const {rows:prs}=await client.query('SELECT * FROM products WHERE id=$1 AND active=TRUE LIMIT 1 FOR UPDATE',[text(p.productId,100)]); prod=prs[0]; if(!prod) throw safeError('Produk tidak tersedia.');
          if(prod.fulfillment_mode==='inventory'){
            const c=await client.query(`SELECT COUNT(*)::int AS n FROM inventory WHERE product_id=$1 AND status='available'`,[prod.id]);
            if(Number(c.rows[0].n)<qty) throw safeError('Stok inventory otomatis tidak mencukupi.');
          } else if(Number(prod.stock)!==-1 && Number(prod.stock)<qty) throw safeError('Stok produk tidak mencukupi.');

          const name=text(p.name||u.name,80); if(name.length<2) throw safeError('Nama penerima wajib diisi.');
          const channel=p.channel==='whatsapp'?'whatsapp':'email'; const ph=phone(p.phone,channel==='whatsapp');
          const requiresLogin=bool(prod.requires_login_credentials)||String(prod.category).toLowerCase().replace(/\s+/g,'')==='topup'; let credentialsEnc='';
          if(requiresLogin){
            if(!credentialSecurityReady()) throw safeError('Top Up belum siap diproses karena CREDENTIAL_ENCRYPTION_KEY belum diatur.',500);
            const accountEmail=normalizeEmail(p.accountEmail), accountPassword=String(p.accountPassword||'');
            if(!validEmail(accountEmail)) throw safeError('Email login akun Top Up tidak valid.');
            if(accountPassword.length<4||accountPassword.length>200) throw safeError('Password login akun Top Up belum valid.');
            credentialsEnc=encryptCredentialPayload({email:accountEmail,password:accountPassword});
          }

          voucher=await voucherQuote({code:p.voucherCode,userId:u.id,product:prod,qty,client});
          const subtotal=Number(prod.price)*qty, afterDiscount=Math.max(0,subtotal-Number(voucher.discount||0));
          const {rows:userRows}=await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[u.id]); const userBalance=Number(userRows[0]?.balance||0);
          const useBalance=bool(p.useBalance)&&bool(settings.balancePaymentEnabled); const balanceUsed=useBalance?Math.min(userBalance,afterDiscount):0; const due=Math.max(0,afterDiscount-balanceUsed);

          const {rows:activeBanks}=await client.query('SELECT * FROM banks WHERE active=TRUE ORDER BY created_at,id');
          const methods=availablePaymentMethods(settings,activeBanks); const allowed=new Set(methods.map(x=>x.id));
          let requested=text(p.paymentMethod,30); if(!requested||requested==='balance') requested=methods.find(x=>x.id!=='balance')?.id||'';
          if(due===0) mode='balance';
          else if(requested==='midtrans'&&allowed.has('midtrans')) mode='midtrans';
          else if(requested==='qris_manual'&&allowed.has('qris_manual')) mode='qris_manual';
          else if(requested==='manual'&&allowed.has('manual')) mode='manual';
          else throw safeError('Metode pembayaran yang dipilih sedang tidak tersedia.');

          let bank={id:'',name:'',number:'',holder:''};
          if(mode==='manual'){
            const chosen=activeBanks.find(b=>b.id===text(p.bankId,100)); if(!chosen) throw safeError('Pilih rekening pembayaran yang aktif.'); bank=chosen;
          }
          if(mode==='midtrans'&&!midtransEnabled()) throw safeError('Midtrans belum siap. Periksa konfigurasi Vercel dan deploy ulang.',500);

          const orderId=`UPL-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,10).toUpperCase()}`;
          const hours=Math.max(1,Math.min(72,Number(settings.paymentHours)||24)), customerNote=text(p.customerNote,800);
          const finiteManualStock=Number(prod.stock)!==-1 && prod.fulfillment_mode!=='inventory';
          if(finiteManualStock){
            const reserved=await client.query('UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1 AND stock>=$2 RETURNING stock,low_stock_threshold',[prod.id,qty]);
            if(!reserved.rowCount) throw safeError('Stok berubah saat checkout dan sekarang tidak mencukupi. Silakan coba lagi.');
            lowStockAfter={stock:Number(reserved.rows[0].stock),threshold:Number(reserved.rows[0].low_stock_threshold||3)};
          }
          if(balanceUsed>0){
            await client.query('UPDATE users SET balance=balance-$2,updated_at=NOW() WHERE id=$1 AND balance>=$2',[u.id,balanceUsed]);
            await client.query(`INSERT INTO balance_ledger(user_id,amount,type,reference,note,actor) VALUES($1,$2,'purchase',$3,$4,$5)`,[u.id,-balanceUsed,orderId,`Saldo dipakai untuk ${prod.name}`,u.email]);
          }
          if(voucher.code) await client.query('INSERT INTO voucher_usages(voucher_code,user_id,order_id,discount) VALUES($1,$2,$3,$4)',[voucher.code,u.id,orderId,voucher.discount]);

          const selectedPayMethod=mode==='midtrans'?'snap':mode; const selectedPayChannel=mode==='midtrans'?'MIDTRANS':mode==='qris_manual'?'QRIS_MANUAL':'';
          const publicThumb=prod.thumbnail_data?`/api/product-image?id=${encodeURIComponent(prod.id)}&v=${encodeURIComponent(new Date(prod.updated_at||Date.now()).getTime())}`:(prod.thumbnail_url||'');
          const initialStatus=mode==='balance'?'processing':'pending_payment'; const verified=mode==='balance';
          const {rows:ors}=await client.query(`INSERT INTO orders(id,user_id,email,name,phone,channel,product_id,product_name,product_thumbnail,duration,quantity,price,subtotal,discount,voucher_code,balance_used,total,bank_id,bank_name,bank_number,bank_holder,note,status,payment_mode,expires_at,request_id,stock_reserved,credentials_enc,credentials_status,gateway_payment_method,gateway_payment_channel,payment_submitted_at,payment_verified_at,processing_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW()+($25 || ' hours')::interval,$26,$27,$28,$29,$30,$31,$32,$33,$34) RETURNING *`,[orderId,u.id,u.email,name,ph,channel,prod.id,prod.name,publicThumb,prod.duration,qty,Number(prod.price),subtotal,voucher.discount,voucher.code,balanceUsed,due,bank.id||'',bank.name||'',bank.number||'',bank.holder||'',customerNote,initialStatus,mode,String(hours),requestId,finiteManualStock&&!verified,credentialsEnc,credentialsEnc?'encrypted':'',selectedPayMethod,selectedPayChannel,verified?new Date():null,verified?new Date():null,verified?new Date():null]);
          order=ors[0]; await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}

        let paymentUrl='',paymentData=null,paymentError='';
        if(mode==='midtrans'){
          try{const created=await createMidtransForOrder(order);paymentUrl=created.paymentUrl;paymentData=created.paymentData;order=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];}
          catch(e){paymentError=e?.safe?e.message:'Midtrans belum dapat membuat transaksi.';await q(`UPDATE orders SET gateway_status='error',note=CASE WHEN note='' THEN $2 ELSE note || E'\n' || $2 END,updated_at=NOW() WHERE id=$1`,[order.id,`Payment gateway Midtrans: ${paymentError}`]);}
        }
        if(mode==='balance') await autoFulfillOrder(order.id,'balance');
        await audit(u.email,'order_created',order.id,{productId:prod.id,subtotal:Number(order.subtotal),discount:Number(order.discount),balanceUsed:Number(order.balance_used),total:Number(order.total),mode,voucher:voucher.code});
        await notifyAdmin('order','Pesanan baru',`${prod.name} · ${order.name} · Rp${Number(order.total).toLocaleString('id-ID')}`,order.id);
        if(lowStockAfter&&lowStockAfter.stock<=lowStockAfter.threshold) await notifyAdmin('stock','Stok menipis',`${prod.name} tersisa ${lowStockAfter.stock}.`,prod.id);
        await sendEmail(u.email,`Pesanan ${order.id} dibuat`,`<h2>Pesanan Uply Digital dibuat</h2><p>${escapeHtml(prod.name)} · ${escapeHtml(prod.duration)}</p><p>Subtotal: <strong>Rp${Number(order.subtotal).toLocaleString('id-ID')}</strong></p>${Number(order.discount)?`<p>Diskon: -Rp${Number(order.discount).toLocaleString('id-ID')}</p>`:''}${Number(order.balance_used)?`<p>Saldo: -Rp${Number(order.balance_used).toLocaleString('id-ID')}</p>`:''}<p>Total dibayar: <strong>Rp${Number(order.total).toLocaleString('id-ID')}</strong></p><p>Status: ${mode==='balance'?'pembayaran lunas dari saldo':'menunggu pembayaran'}.</p>`);
        data={order:publicOrder((await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]),paymentUrl:paymentUrl||order.payment_url||'',paymentData:paymentData||order.gateway_payload||null,paymentError,duplicate:false};
      }
    }
    else if(action==='retryPayment'){
      const u=await requireAuth(req);const orderId=text(p.orderId,80);const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]);const o=rows[0];
      if(!o||o.payment_mode!=='midtrans'||o.status!=='pending_payment') throw safeError('Pembayaran Midtrans tidak dapat dibuat ulang.');
      if(o.payment_url && ['pending','creating'].includes(String(o.gateway_status||'').toLowerCase())) data={paymentUrl:o.payment_url,paymentData:o.gateway_payload||{},reused:true};
      else{
        if(o.gateway_order_id) await expirePayment(o.gateway_order_id);
        const created=await createMidtransForOrder(o);data={paymentUrl:created.paymentUrl,paymentData:created.paymentData,reused:false};
      }
    }
    else if(action==='syncPaymentStatus'){
      const u=await requireAuth(req);const orderId=text(p.orderId,80);const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]);const o=rows[0];
      if(!o||o.payment_mode!=='midtrans') throw safeError('Pesanan Midtrans tidak ditemukan.');
      if(o.status==='completed'){data={order:publicOrder(o),state:'success'};}
      else if(!o.gateway_order_id){throw safeError('Transaksi Midtrans belum dibuat. Klik Buat pembayaran terlebih dahulu.');}
      else{
        const statusBody=await getPaymentStatus(o.gateway_order_id);
        const result=await applyMidtransStatus(statusBody,'midtrans-sync');
        await q(`UPDATE orders SET gateway_payload=$2::jsonb,gateway_status=$3,gateway_transaction_id=CASE WHEN $4<>'' THEN $4 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_method END,updated_at=NOW() WHERE id=$1`,[orderId,JSON.stringify(statusBody),String(statusBody.transaction_status||''),String(statusBody.transaction_id||''),String(statusBody.payment_type||'')]);
        data={order:publicOrder((await q('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0]),state:result.state};
      }
    }
    else if(action==='uploadProof'){
      const u=await requireAuth(req); const orderId=text(p.orderId,80); const mime=text(p.mime,60); const name=text(p.fileName,160); const base64=String(p.base64||'');
      if(!['image/jpeg','image/png','application/pdf'].includes(mime)) throw safeError('Bukti harus JPG, PNG, atau PDF.'); if(base64.length>1500000) throw safeError('Ukuran bukti maksimal sekitar 1 MB.');
      const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0]; if(!o||!['manual','qris_manual'].includes(o.payment_mode)||!['pending_payment','review'].includes(o.status)) throw safeError('Pesanan tidak dapat menerima bukti pembayaran.');
      await q(`UPDATE orders SET proof_name=$2,proof_mime=$3,proof_data=$4,status='review',payment_submitted_at=COALESCE(payment_submitted_at,NOW()),updated_at=NOW() WHERE id=$1`,[orderId,name,mime,base64]); await audit(u.email,'proof_uploaded',orderId,{}); await notifyAdmin('payment','Bukti pembayaran baru',`${o.product_name} · ${o.name}`,orderId); data=true;
    }
    else if(action==='cancelOrder'){
      const u=await requireAuth(req); const orderId=text(p.orderId,80); const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0]; if(!o||o.status!=='pending_payment') throw safeError('Pesanan ini tidak dapat dibatalkan sendiri.');
      if(o.payment_mode==='midtrans'&&o.gateway_order_id) await expirePayment(o.gateway_order_id);
      await q(`UPDATE orders SET status='cancelled',note='Dibatalkan pelanggan sebelum pembayaran terverifikasi.',credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW() WHERE id=$1`,[orderId]);
      if(o.stock_reserved){await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.product_id,o.quantity]);await q('UPDATE orders SET stock_reserved=FALSE WHERE id=$1',[orderId]);}
      await refundOrderCredits(orderId,u.email,'Pesanan dibatalkan pelanggan.'); await audit(u.email,'order_cancelled',orderId,{}); data=true;
    }
    else if(action==='adminData'){
      const a=await requireAdmin(req);
      const [orders,products,banks,customers,inv,invItems,aud,s,vouchers,ledger,notifications,daily,topProducts,paymentMix]=await Promise.all([
        q('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000'),
        q('SELECT * FROM products ORDER BY created_at,id'),
        q('SELECT * FROM banks ORDER BY created_at,id'),
        q(`SELECT u.id,u.email,u.name,u.phone,u.balance,u.membership_tier,u.membership_manual,u.created_at,COUNT(o.id)::int AS orders_count,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_count,COALESCE(SUM(CASE WHEN o.status='completed' THEN COALESCE(NULLIF(o.subtotal,0),o.price*o.quantity)-o.discount ELSE 0 END),0)::bigint AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 1000`),
        q(`SELECT product_id,status,COUNT(*)::int AS count FROM inventory GROUP BY product_id,status`),
        q(`SELECT i.id,i.product_id,p.name AS product_name,i.item_value,i.note,i.status,i.order_id,i.created_at,i.updated_at FROM inventory i LEFT JOIN products p ON p.id=i.product_id ORDER BY i.created_at DESC LIMIT 1000`),
        q('SELECT id,timestamp,actor,action,record_id,detail FROM audit ORDER BY timestamp DESC LIMIT 400'),
        getSettings(),
        q(`SELECT v.*,COALESCE(u.used,0)::int AS used FROM vouchers v LEFT JOIN (SELECT voucher_code,COUNT(*)::int AS used FROM voucher_usages GROUP BY voucher_code) u ON u.voucher_code=v.code ORDER BY v.created_at DESC`),
        q(`SELECT l.*,u.name,u.email FROM balance_ledger l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 500`),
        q(`SELECT * FROM admin_notifications ORDER BY is_read,created_at DESC LIMIT 100`),
        q(`SELECT to_char((created_at AT TIME ZONE 'Asia/Jakarta')::date,'YYYY-MM-DD') AS day,COUNT(*)::int AS orders,COALESCE(SUM(CASE WHEN status IN ('processing','completed') THEN COALESCE(NULLIF(subtotal,0),price*quantity)-discount ELSE 0 END),0)::bigint AS revenue FROM orders WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1`),
        q(`SELECT product_id,MAX(product_name) AS name,COUNT(*) FILTER (WHERE status='completed')::int AS completed,COALESCE(SUM(CASE WHEN status='completed' THEN quantity ELSE 0 END),0)::int AS units,COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(NULLIF(subtotal,0),price*quantity)-discount ELSE 0 END),0)::bigint AS revenue FROM orders GROUP BY product_id ORDER BY revenue DESC LIMIT 10`),
        q(`SELECT payment_mode,COUNT(*)::int AS orders,COALESCE(SUM(CASE WHEN status IN ('processing','completed') THEN total+balance_used ELSE 0 END),0)::bigint AS revenue FROM orders GROUP BY payment_mode ORDER BY orders DESC`)
      ]);
      const invMap={}; for(const r of inv.rows){invMap[r.product_id]??={available:0,delivered:0,disabled:0};invMap[r.product_id][r.status]=Number(r.count);}
      const methods=availablePaymentMethods(s,banks.rows.filter(b=>b.active));
      data={
        orders:orders.rows.map(x=>publicOrder(x,true)),
        products:products.rows.map(p=>publicProduct(p,invMap[p.id]?.available||0)),
        banks:banks.rows,
        customers:customers.rows.map(c=>({...c,balance:Number(c.balance||0),membershipTier:(c.membership_manual||!bool(s.autoRoleEnabled))?(c.membership_tier||'customer'):tierFromStats(c.completed_count,c.spent),membershipManual:!!c.membership_manual,ordersCount:Number(c.orders_count),completedCount:Number(c.completed_count),spent:Number(c.spent)})),
        inventory:invMap,
        inventoryItems:invItems.rows.map(i=>({id:i.id,productId:i.product_id,productName:i.product_name||i.product_id,itemValue:i.item_value,note:i.note||'',status:i.status,orderId:i.order_id||'',createdAt:i.created_at,updatedAt:i.updated_at})),
        vouchers:vouchers.rows.map(v=>({...v,discountValue:Number(v.discount_value),minSpend:Number(v.min_spend),maxDiscount:Number(v.max_discount),usageLimit:Number(v.usage_limit),perUserLimit:Number(v.per_user_limit),used:Number(v.used),productIds:Array.isArray(v.product_ids)?v.product_ids:[]})),
        balanceLedger:ledger.rows.map(l=>({...l,amount:Number(l.amount)})),
        notifications:notifications.rows,
        analytics:{daily:daily.rows.map(r=>({...r,orders:Number(r.orders),revenue:Number(r.revenue)})),topProducts:topProducts.rows.map(r=>({...r,completed:Number(r.completed),units:Number(r.units),revenue:Number(r.revenue)})),paymentMix:paymentMix.rows.map(r=>({...r,orders:Number(r.orders),revenue:Number(r.revenue)}))},
        audit:aud.rows,
        settings:{...s,qrisImageData:undefined,qrisImageMime:undefined,storeOpen:bool(s.storeOpen),paymentHours:Number(s.paymentHours)||24,paymentMode:configuredPaymentMode(),paymentReady:methods.some(m=>m.id!=='balance'),paymentMethods:methods,manualPaymentEnabled:bool(s.manualPaymentEnabled),midtransPaymentEnabled:bool(s.midtransPaymentEnabled),balancePaymentEnabled:bool(s.balancePaymentEnabled),autoRoleEnabled:bool(s.autoRoleEnabled),qrisManualReady:!!s.qrisImageData,qrisName:s.qrisName||'QRIS Manual'},
        admin:{email:a.email}
      };
    }
    else if(action==='saveProduct'){
      const a=await requireAdmin(req); const x=p.product||{}; let pid=text(x.id,100); if(!pid) pid=id('prd');
      const name=text(x.name,80),category=text(x.category,60)||'Digital',duration=text(x.duration,80),price=Number(x.price),stock=Number(x.stock),lowStockThreshold=Math.max(0,Math.min(999,Number(x.lowStockThreshold)||3)); const isTopUp=category.toLowerCase().replace(/\s+/g,'')==='topup'; const mode=isTopUp?'manual':(x.fulfillmentMode==='inventory'?'inventory':'manual'); const requiresLogin=isTopUp||bool(x.requiresLoginCredentials); let thumbnail=text(x.thumbnail,500); if(thumbnail && !thumbnail.startsWith('/assets/') && !/^https:\/\//i.test(thumbnail)) throw safeError('Thumbnail harus berupa path /assets/... atau URL HTTPS.'); const featured=bool(x.featured); const upload=x.thumbnailUpload&&typeof x.thumbnailUpload==='object'?x.thumbnailUpload:null; let thumbnailMime='',thumbnailData=''; if(upload){thumbnailMime=text(upload.mime,80);thumbnailData=String(upload.base64||'');if(!['image/jpeg','image/png','image/webp'].includes(thumbnailMime)) throw safeError('Thumbnail upload harus JPG, PNG, atau WebP.');if(thumbnailData.length>1400000) throw safeError('Ukuran thumbnail maksimal sekitar 1 MB.');if(!/^[A-Za-z0-9+/=]+$/.test(thumbnailData)) throw safeError('Data thumbnail tidak valid.');}
      if(name.length<2||!Number.isInteger(price)||price<1000||!Number.isInteger(stock)||stock<-1) throw safeError('Data produk belum valid.');
      const benefits=Array.isArray(x.benefits)?x.benefits.map(v=>text(v,150)).filter(Boolean).slice(0,20):[];
      await q(`INSERT INTO products(id,name,category,duration,price,description,benefits,terms,stock,active,badge,icon,fulfillment_mode,thumbnail_url,thumbnail_mime,thumbnail_data,featured,requires_login_credentials,low_stock_threshold,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,duration=EXCLUDED.duration,price=EXCLUDED.price,description=EXCLUDED.description,benefits=EXCLUDED.benefits,terms=EXCLUDED.terms,stock=EXCLUDED.stock,active=EXCLUDED.active,badge=EXCLUDED.badge,icon=EXCLUDED.icon,fulfillment_mode=EXCLUDED.fulfillment_mode,thumbnail_url=EXCLUDED.thumbnail_url,thumbnail_mime=CASE WHEN EXCLUDED.thumbnail_data<>'' THEN EXCLUDED.thumbnail_mime ELSE products.thumbnail_mime END,thumbnail_data=CASE WHEN EXCLUDED.thumbnail_data<>'' THEN EXCLUDED.thumbnail_data ELSE products.thumbnail_data END,featured=EXCLUDED.featured,requires_login_credentials=EXCLUDED.requires_login_credentials,low_stock_threshold=EXCLUDED.low_stock_threshold,updated_at=NOW()`,[pid,name,category,duration,price,text(x.description,300),JSON.stringify(benefits),text(x.terms,2000),stock,bool(x.active),text(x.badge,40),text(x.icon,30)||'generic',mode,thumbnail,thumbnailMime,thumbnailData,featured,requiresLogin,lowStockThreshold]);
      if(!upload && (bool(x.clearUploadedThumbnail) || !!thumbnail)) await q(`UPDATE products SET thumbnail_mime='',thumbnail_data='',updated_at=NOW() WHERE id=$1`,[pid]);
      await audit(a.email,'product_saved',pid,{name,mode,featured,requiresLogin,thumbnailUpload:!!upload}); data={id:pid};
    }
    else if(action==='adjustProductStock'){
      const a=await requireAdmin(req); const productId=text(p.productId,100), operation=String(p.operation||'add'); const amount=Number(p.amount);
      if(!['add','set','subtract'].includes(operation)) throw safeError('Operasi stok tidak valid.');
      if(!Number.isInteger(amount)) throw safeError('Jumlah stok harus berupa angka bulat.');
      if(operation!=='set' && amount<1) throw safeError('Jumlah perubahan stok minimal 1.');
      if(operation==='set' && amount<-1) throw safeError('Stok minimal -1.');
      const client=await pool.connect(); let updated;
      try{
        await client.query('BEGIN');
        const {rows}=await client.query('SELECT id,name,stock,fulfillment_mode FROM products WHERE id=$1 LIMIT 1 FOR UPDATE',[productId]); const prod=rows[0];
        if(!prod) throw safeError('Produk tidak ditemukan.');
        if(prod.fulfillment_mode==='inventory') throw safeError('Produk ini memakai Inventory Otomatis. Tambahkan stok dari menu Inventory, bukan stok manual.');
        const current=Number(prod.stock); let next=current;
        if(operation==='set') next=amount;
        else {
          if(current===-1){next=operation==='add'?amount:-1;if(operation==='subtract') throw safeError('Stok Tanpa Batas tidak dapat dikurangi. Pilih Set stok untuk mengubahnya menjadi jumlah tertentu.');}
          else next=operation==='add'?current+amount:current-amount;
          if(next<0) throw safeError('Stok tidak boleh kurang dari 0.');
        }
        const r=await client.query('UPDATE products SET stock=$2,updated_at=NOW() WHERE id=$1 RETURNING id,name,stock',[productId,next]); updated=r.rows[0];
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}
      await audit(a.email,'product_stock_adjusted',productId,{operation,amount,newStock:Number(updated.stock)}); data={id:updated.id,name:updated.name,stock:Number(updated.stock)};
    }
    else if(action==='saveBank'){
      const a=await requireAdmin(req); const x=p.bank||{}; const bid=text(x.id,100)||id('bank'); const name=text(x.name,70),number=text(x.number,30).replace(/\D/g,''),holder=text(x.holder,90); if(!name||number.length<6||!holder) throw safeError('Data rekening belum lengkap.');
      await q(`INSERT INTO banks(id,name,number,holder,active,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,number=EXCLUDED.number,holder=EXCLUDED.holder,active=EXCLUDED.active,updated_at=NOW()`,[bid,name,number,holder,bool(x.active)]); await audit(a.email,'bank_saved',bid,{name}); data=true;
    }
    else if(action==='saveSettings'){
      const a=await requireAdmin(req); const x=p.settings||{};
      const vals={
        storeName:text(x.storeName,60)||'Uply Digital',whatsapp:phone(x.whatsapp,false),hours:text(x.hours,120),
        paymentHours:String(Math.max(1,Math.min(72,Number(x.paymentHours)||24))),notice:text(x.notice,250),promoBanner:text(x.promoBanner,180),
        storeOpen:String(bool(x.storeOpen)),manualPaymentEnabled:String(bool(x.manualPaymentEnabled)),midtransPaymentEnabled:String(bool(x.midtransPaymentEnabled)),
        balancePaymentEnabled:String(bool(x.balancePaymentEnabled)),autoRoleEnabled:String(bool(x.autoRoleEnabled)),qrisName:text(x.qrisName,80)||'QRIS Manual'
      };
      const upload=x.qrisUpload&&typeof x.qrisUpload==='object'?x.qrisUpload:null;
      if(upload){const mime=text(upload.mime,80),base64=String(upload.base64||'');if(!['image/jpeg','image/png','image/webp'].includes(mime)) throw safeError('QRIS harus JPG, PNG, atau WebP.');if(base64.length>1800000) throw safeError('Ukuran QRIS maksimal sekitar 1,3 MB.');if(!/^[A-Za-z0-9+/=]+$/.test(base64)) throw safeError('Data QRIS tidak valid.');vals.qrisImageMime=mime;vals.qrisImageData=base64;}
      if(bool(x.clearQris)){vals.qrisImageMime='';vals.qrisImageData='';}
      for(const [k,v] of Object.entries(vals)) await q(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[k,v]);
      await audit(a.email,'settings_saved','',{payment:{manual:bool(x.manualPaymentEnabled),midtrans:bool(x.midtransPaymentEnabled),balance:bool(x.balancePaymentEnabled)},qrisUpload:!!upload}); data=true;
    }
    else if(action==='inventoryAdd'){
      const a=await requireAdmin(req);
      const productId=text(p.productId,100), itemValue=text(p.itemValue,5000), note=text(p.note,300);
      const status=['available','disabled'].includes(String(p.status))?String(p.status):'available';
      if(!itemValue) throw safeError('Isi kode, link, atau detail inventory.');
      const exists=await q('SELECT id,fulfillment_mode FROM products WHERE id=$1',[productId]); if(!exists.rowCount) throw safeError('Produk tidak ditemukan.');
      if(exists.rows[0].fulfillment_mode!=='inventory') throw safeError('Produk ini memakai stok manual. Gunakan tombol Tambah Stok pada menu Produk.');
      const inventoryId=id('inv');
      await q('INSERT INTO inventory(id,product_id,item_value,note,status) VALUES($1,$2,$3,$4,$5)',[inventoryId,productId,itemValue,note,status]);
      await audit(a.email,'inventory_added',productId,{inventoryId,status}); data={id:inventoryId};
    }
    else if(action==='inventorySetStatus'){
      const a=await requireAdmin(req); const inventoryId=text(p.inventoryId,120); const status=String(p.status||'');
      if(!['available','disabled'].includes(status)) throw safeError('Status inventory tidak valid.');
      const {rows}=await q('SELECT * FROM inventory WHERE id=$1 LIMIT 1',[inventoryId]); const item=rows[0];
      if(!item) throw safeError('Inventory tidak ditemukan.');
      if(item.status==='delivered') throw safeError('Inventory yang sudah terkirim tidak dapat diubah.');
      await q('UPDATE inventory SET status=$2,updated_at=NOW() WHERE id=$1',[inventoryId,status]);
      await audit(a.email,'inventory_status_updated',item.product_id,{inventoryId,from:item.status,to:status}); data=true;
    }
    else if(action==='inventoryImport'){
      const a=await requireAdmin(req); const productId=text(p.productId,100); const items=Array.isArray(p.items)?p.items.map(v=>text(v,5000)).filter(Boolean).slice(0,1000):[]; if(!items.length) throw safeError('Masukkan minimal satu item inventory.');
      const exists=await q('SELECT id,fulfillment_mode FROM products WHERE id=$1',[productId]); if(!exists.rowCount) throw safeError('Produk tidak ditemukan.');
      if(exists.rows[0].fulfillment_mode!=='inventory') throw safeError('Produk ini memakai stok manual. Gunakan tombol Tambah Stok pada menu Produk.');
      let added=0; for(const value of items){await q("INSERT INTO inventory(id,product_id,item_value,note,status) VALUES($1,$2,$3,'','available')",[id('inv'),productId,value]);added++;} await audit(a.email,'inventory_imported',productId,{count:added}); data={added};
    }
    else if(action==='getOrderCredentials'){
      const a=await requireAdmin(req); const orderId=text(p.orderId,80);
      const {rows}=await q(`SELECT id,product_name,status,credentials_enc,credentials_status FROM orders WHERE id=$1 LIMIT 1`,[orderId]); const o=rows[0];
      if(!o||!o.credentials_enc) throw safeError('Data login tidak tersedia atau sudah dihapus.');
      if(o.status!=='processing') throw safeError('Data login hanya dapat dibuka setelah pembayaran terverifikasi dan order masuk status Sedang diproses.');
      const credentials=decryptCredentialPayload(o.credentials_enc);
      await q(`UPDATE orders SET credentials_status='viewed',credentials_viewed_at=NOW(),updated_at=NOW() WHERE id=$1`,[orderId]);
      await audit(a.email,'order_credentials_viewed',orderId,{product:o.product_name});
      data={email:credentials.email,password:credentials.password,notice:'Gunakan hanya untuk memproses pesanan ini. Jangan meminta OTP atau recovery code.'};
    }
    else if(action==='updateOrder'){
      const a=await requireAdmin(req); const orderId=text(p.orderId,80); const status=text(p.status,30); if(!['pending_payment','review','processing','completed','cancelled'].includes(status)) throw safeError('Status tidak valid.');
      const {rows}=await q('SELECT * FROM orders WHERE id=$1 LIMIT 1',[orderId]); const old=rows[0]; if(!old) throw safeError('Pesanan tidak ditemukan.');
      let delivery=text(p.delivery,5000), note=text(p.note,800);
      if(['processing','completed'].includes(status) && ['pending_payment','review'].includes(old.status) && !bool(p.confirmPayment)) throw safeError('Centang konfirmasi bahwa pembayaran sudah diterima.');
      if(status==='completed' && !delivery && old.delivery) delivery=old.delivery; if(status==='completed'&&!delivery) throw safeError('Isi detail produk sebelum menyelesaikan pesanan manual.');
      if(status==='cancelled' && old.stock_reserved){await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[old.product_id,old.quantity]);}
      await q(`UPDATE orders SET status=$2,delivery=$3,note=$4,
        payment_submitted_at=CASE WHEN $2 IN ('processing','completed') AND payment_submitted_at IS NULL THEN NOW() ELSE payment_submitted_at END,
        payment_verified_at=CASE WHEN $2 IN ('processing','completed') AND payment_verified_at IS NULL THEN NOW() ELSE payment_verified_at END,
        processing_at=CASE WHEN $2='processing' AND processing_at IS NULL THEN NOW() WHEN $2='completed' AND processing_at IS NULL THEN NOW() ELSE processing_at END,
        completed_at=CASE WHEN $2='completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
        credentials_enc=CASE WHEN $2 IN ('completed','cancelled') THEN '' ELSE credentials_enc END,
        credentials_status=CASE WHEN $2 IN ('completed','cancelled') AND credentials_status<>'' THEN 'purged' ELSE credentials_status END,
        stock_reserved=CASE WHEN $2 IN ('processing','completed','cancelled') THEN FALSE ELSE stock_reserved END,updated_at=NOW() WHERE id=$1`,[orderId,status,delivery,note]); await audit(a.email,'order_status_updated',orderId,{from:old.status,to:status});
      if(status==='processing') await autoFulfillOrder(orderId,'admin');
      if(status==='cancelled') await refundOrderCredits(orderId,a.email,'Pesanan dibatalkan admin.');
      if(status==='completed'){await syncMembership(old.user_id,a.email);await notifyAdmin('success','Pesanan selesai',`${old.product_name} · ${old.name}`,orderId);await sendEmail(old.email,`Pesanan ${orderId} selesai`,`<h2>Pesanan selesai</h2><p>${escapeHtml(old.product_name)}</p><pre style="white-space:pre-wrap">${escapeHtml(delivery)}</pre>`);}
      data=publicOrder((await q('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0],true);
    }

    else if(action==='validateVoucher'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const {rows}=await q('SELECT * FROM products WHERE id=$1 AND active=TRUE LIMIT 1',[text(p.productId,100)]); const prod=rows[0]; if(!prod) throw safeError('Produk tidak ditemukan.');
      const qty=Math.max(1,Math.min(5,Number(p.quantity)||1)); const quote=await voucherQuote({code:p.code,userId:u.id,product:prod,qty});
      data={...quote,subtotal:Number(prod.price)*qty,total:Math.max(0,Number(prod.price)*qty-quote.discount)};
    }
    else if(action==='saveVoucher'){
      const a=await requireAdmin(req); const x=p.voucher||{}; const code=text(x.code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,''); if(code.length<3) throw safeError('Kode voucher minimal 3 karakter.');
      const type=x.discountType==='percent'?'percent':'fixed'; const value=Math.max(0,Number(x.discountValue)||0); if(type==='percent'&&(value<=0||value>100)) throw safeError('Diskon persen harus 1–100.'); if(type==='fixed'&&value<1) throw safeError('Nilai diskon harus lebih dari 0.');
      const starts=x.startsAt?new Date(x.startsAt):null, ends=x.endsAt?new Date(x.endsAt):null; if(starts&&Number.isNaN(starts.getTime())) throw safeError('Tanggal mulai voucher tidak valid.'); if(ends&&Number.isNaN(ends.getTime())) throw safeError('Tanggal akhir voucher tidak valid.'); if(starts&&ends&&ends<=starts) throw safeError('Tanggal akhir harus setelah tanggal mulai.');
      const ids=Array.isArray(x.productIds)?x.productIds.map(v=>text(v,100)).filter(Boolean).slice(0,100):[];
      await q(`INSERT INTO vouchers(code,name,discount_type,discount_value,min_spend,max_discount,usage_limit,per_user_limit,category,product_ids,new_customers_only,active,starts_at,ends_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,NOW())
        ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,discount_type=EXCLUDED.discount_type,discount_value=EXCLUDED.discount_value,min_spend=EXCLUDED.min_spend,max_discount=EXCLUDED.max_discount,usage_limit=EXCLUDED.usage_limit,per_user_limit=EXCLUDED.per_user_limit,category=EXCLUDED.category,product_ids=EXCLUDED.product_ids,new_customers_only=EXCLUDED.new_customers_only,active=EXCLUDED.active,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=NOW()`,[code,text(x.name,100)||code,type,Math.round(value),Math.max(0,Math.round(Number(x.minSpend)||0)),Math.max(0,Math.round(Number(x.maxDiscount)||0)),Math.max(0,Math.round(Number(x.usageLimit)||0)),Math.max(1,Math.round(Number(x.perUserLimit)||1)),text(x.category,60),JSON.stringify(ids),bool(x.newCustomersOnly),bool(x.active),starts?starts.toISOString():null,ends?ends.toISOString():null]);
      await audit(a.email,'voucher_saved',code,{type,value}); data={code};
    }
    else if(action==='toggleVoucher'){
      const a=await requireAdmin(req); const code=text(p.code,40); const active=bool(p.active); const r=await q('UPDATE vouchers SET active=$2,updated_at=NOW() WHERE code=$1 RETURNING code',[code,active]); if(!r.rowCount) throw safeError('Voucher tidak ditemukan.'); await audit(a.email,'voucher_toggled',code,{active}); data=true;
    }
    else if(action==='adjustBalance'){
      const a=await requireAdmin(req); const userId=text(p.userId,100), amount=Math.round(Number(p.amount)||0), note=text(p.note,300); if(!amount) throw safeError('Nominal saldo tidak boleh 0.');
      const client=await pool.connect(); let row;
      try{await client.query('BEGIN');const {rows}=await client.query('SELECT id,email,name,balance FROM users WHERE id=$1 FOR UPDATE',[userId]);row=rows[0];if(!row) throw safeError('Pelanggan tidak ditemukan.');const next=Number(row.balance)+amount;if(next<0) throw safeError('Saldo pelanggan tidak mencukupi untuk pengurangan ini.');await client.query('UPDATE users SET balance=$2,updated_at=NOW() WHERE id=$1',[userId,next]);await client.query(`INSERT INTO balance_ledger(user_id,amount,type,reference,note,actor) VALUES($1,$2,'adjustment','',$3,$4)`,[userId,amount,note,a.email]);await client.query('COMMIT');row.balance=next;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      await audit(a.email,'balance_adjusted',userId,{amount,newBalance:Number(row.balance),note}); data={userId,balance:Number(row.balance)};
    }
    else if(action==='setCustomerTier'){
      const a=await requireAdmin(req); const userId=text(p.userId,100), tier=text(p.tier,30); if(!['customer','member','reseller','vip','auto'].includes(tier)) throw safeError('Level pelanggan tidak valid.');
      if(tier==='auto'){await q('UPDATE users SET membership_manual=FALSE,updated_at=NOW() WHERE id=$1',[userId]);data=await syncMembership(userId,a.email);}else{const r=await q('UPDATE users SET membership_tier=$2,membership_manual=TRUE,updated_at=NOW() WHERE id=$1 RETURNING id',[userId,tier]);if(!r.rowCount) throw safeError('Pelanggan tidak ditemukan.');await audit(a.email,'membership_manual_updated',userId,{tier});data={tier,manual:true};}
    }
    else if(action==='markNotificationsRead'){
      const a=await requireAdmin(req); if(p.id) await q('UPDATE admin_notifications SET is_read=TRUE WHERE id=$1',[Number(p.id)]); else await q('UPDATE admin_notifications SET is_read=TRUE WHERE is_read=FALSE'); await audit(a.email,'notifications_read','',{}); data=true;
    }
    else if(action==='getProof'){
      await requireAdmin(req); const {rows}=await q('SELECT proof_name,proof_mime,proof_data FROM orders WHERE id=$1',[text(p.orderId,80)]); const o=rows[0]; if(!o||!o.proof_data) throw safeError('Bukti pembayaran tidak tersedia.'); data={name:o.proof_name,mime:o.proof_mime,base64:o.proof_data};
    }
    else throw safeError('Aksi tidak dikenal.',404);

    return send(res,200,{ok:true,data},headers);
  }catch(e){
    const errorId='ERR-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
    console.error('UPLY API',errorId,e);
    const message=e.safe?e.message:`Server belum dapat memproses permintaan. Kode: ${errorId}`;
    return send(res,e.status||500,{ok:false,error:message,errorId},headers);
  }
}
