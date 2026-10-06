import { ensureSchema, q, pool, getSettings, audit } from '../lib/db.js';
import { id, normalizeEmail, validEmail, hashPassword, verifyPassword, safeEqual, createSession, requireAuth, requireAdmin, destroySession, securityReady, credentialSecurityReady, encryptCredentialPayload, decryptCredentialPayload } from '../lib/security.js';
import { paymentMode as configuredPaymentMode } from '../lib/midtrans.js';
import { AUTO_GATEWAYS, isAutomaticGateway, gatewayReady, gatewayLabel, gatewayHealth, defaultGatewayMethod, createGatewayPayment, getGatewayStatus, expireGatewayPayment, normalizedCreatedPayment, normalizedStatus } from '../lib/gateways.js';
import { applyGatewayStatus, autoFulfillOrder } from '../lib/payment-state.js';
import { sendEmail } from '../lib/email.js';
import { syncMembership, notifyAdmin, notifyUser, refundOrderCredits, tierFromStats } from '../lib/business.js';

function safeError(message,status=400){ const e=new Error(message); e.safe=true; e.status=status; return e; }
function text(v,max=500){ return String(v??'').trim().slice(0,max); }
function bool(v){ return v===true || String(v).toLowerCase()==='true'; }
function saleInfo(row){
  const regular=Math.max(0,Number(row?.price||0)); const sale=Math.max(0,Number(row?.sale_price||0));
  const now=Date.now(), start=row?.sale_starts_at?new Date(row.sale_starts_at).getTime():0, end=row?.sale_ends_at?new Date(row.sale_ends_at).getTime():0;
  const active=sale>0&&sale<regular&&(!start||start<=now)&&(!end||end>=now);
  return {price:active?sale:regular,regularPrice:regular,salePrice:sale,saleActive:active,saleStartsAt:row?.sale_starts_at||null,saleEndsAt:row?.sale_ends_at||null,discountPercent:active&&regular?Math.round((regular-sale)/regular*100):0};
}
function warrantyDays(product,variant=null){const v=Number(variant?.warranty_days||0);return v>0?v:Math.max(0,Number(product?.warranty_days||0));}
function phone(v,required=false){
  let p=text(v,24).replace(/[\s()+-]/g,''); if(p.startsWith('0')) p='62'+p.slice(1);
  if(!p&&!required) return ''; if(!/^[1-9]\d{8,14}$/.test(p)) throw safeError('Nomor WhatsApp tidak valid.'); return p;
}
function publicVariant(v,availableInventory=0,fulfillmentMode='manual'){
  const stock=fulfillmentMode==='inventory'?Number(availableInventory||0):Number(v.stock);
  const compareAt=Number(v.compare_at_price||0); const sale=saleInfo(v); const compareBase=Math.max(compareAt,sale.regularPrice);
  const discountPercent=compareBase>sale.price&&compareBase>0?Math.round((compareBase-sale.price)/compareBase*100):0;
  return {id:v.id,productId:v.product_id,name:v.name,subtitle:v.subtitle||'',price:sale.price,regularPrice:sale.regularPrice,compareAtPrice:compareBase,stock,active:!!v.active,badge:v.badge||'',sortOrder:Number(v.sort_order||0),discountPercent,warrantyDays:Number(v.warranty_days||0),saleActive:sale.saleActive,salePrice:sale.salePrice,saleStartsAt:sale.saleStartsAt,saleEndsAt:sale.saleEndsAt};
}
function publicMedia(m){
  const uploaded=!!m.image_data;
  const src=uploaded?`/api/product-media-image?id=${encodeURIComponent(m.id)}&v=${encodeURIComponent(new Date(m.updated_at||Date.now()).getTime())}`:(m.image_url||'');
  return {id:m.id,productId:m.product_id,kind:m.kind||'info',title:m.title||'',caption:m.caption||'',src,hasUploadedImage:uploaded,sortOrder:Number(m.sort_order||0),active:!!m.active};
}
function publicProduct(r,availableInventory,variants=[],gallery=[]){
  const uploaded=!!r.thumbnail_data;
  const thumbnail=uploaded?`/api/product-image?id=${encodeURIComponent(r.id)}&v=${encodeURIComponent(new Date(r.updated_at||Date.now()).getTime())}`:(r.thumbnail_url||'');
  const activeVariants=(variants||[]).filter(v=>v.active!==false);
  const variantPrices=activeVariants.map(v=>Number(v.price)).filter(Number.isFinite);
  const hasVariants=activeVariants.length>0;
  const sale=saleInfo(r); let price=sale.price,stock=r.fulfillment_mode==='inventory'?Number(availableInventory):Number(r.stock);
  if(hasVariants){price=Math.min(...variantPrices);const stocks=activeVariants.map(v=>Number(v.stock));stock=stocks.includes(-1)?-1:stocks.reduce((a,b)=>a+Math.max(0,b),0);}
  const warranty=Number(r.warranty_days||0);
  return {id:r.id,name:r.name,category:r.category,duration:r.duration,price,regularPrice:sale.regularPrice,priceMin:hasVariants?Math.min(...variantPrices):price,priceMax:hasVariants?Math.max(...variantPrices):price,hasVariants,variants:activeVariants,description:r.description,benefits:Array.isArray(r.benefits)?r.benefits:[],terms:r.terms,stock,active:r.active,badge:r.badge,icon:r.icon,fulfillmentMode:r.fulfillment_mode,thumbnail,hasUploadedThumbnail:uploaded,gallery:(gallery||[]).filter(x=>x.active!==false),featured:!!r.featured,requiresLoginCredentials:!!r.requires_login_credentials,soldCount:Number(r.sold_count||0),bestSeller:!!r.best_seller,lowStockThreshold:Number(r.low_stock_threshold||3),warrantyDays:warranty,saleActive:!hasVariants&&sale.saleActive,salePrice:sale.salePrice,saleStartsAt:sale.saleStartsAt,saleEndsAt:sale.saleEndsAt,saleDiscountPercent:sale.discountPercent};
}
function publicOrder(o,admin=false){
  const gp=o.gateway_payload&&typeof o.gateway_payload==='object'?o.gateway_payload:{};
  const va=Array.isArray(gp.va_numbers)&&gp.va_numbers[0]?gp.va_numbers[0]:{};
  const paymentData={method:o.gateway_payment_method||gp.payment_type||gp.payment_method||gp.paymentMethod||'',channel:o.gateway_payment_channel||gp.payment_channel||gp.channel||gp.bank||va.bank||gp.paymentMethod||'',transactionId:o.gateway_transaction_id||gp.transaction_id||gp.reference||'',snapToken:gp.token||'',qrUrl:gp.qr_url||gp.qrUrl||'',qrContent:gp.qr_content||gp.qrString||'',vaNumber:gp.va_number||gp.vaNumber||gp.permata_va_number||va.va_number||'',paymentCode:gp.payment_code||'',billKey:gp.bill_key||'',billerCode:gp.biller_code||'',paymentUrl:o.payment_url||gp.payment_url||gp.paymentUrl||gp.appUrl||gp.redirect_url||gp.finish_redirect_url||'',expiredAt:gp.expired_at||gp.expiredAt||null,fee:Number(gp.fee||0),feeBearer:gp.fee_bearer||'',amount:Number(gp.gross_amount||gp.amount||o.total||0),provider:o.payment_mode||''};
  return {id:o.id,userId:admin?o.user_id:undefined,email:o.email,name:o.name,phone:o.phone,channel:o.channel,productId:o.product_id,productName:o.product_name,productThumbnail:o.product_thumbnail||'',variantId:o.variant_id||'',variantName:o.variant_name||'',variantSubtitle:o.variant_subtitle||'',duration:o.duration,quantity:Number(o.quantity),price:Number(o.price),subtotal:Number(o.subtotal||Number(o.price)*Number(o.quantity)),discount:Number(o.discount||0),voucherCode:o.voucher_code||'',balanceUsed:Number(o.balance_used||0),total:Number(o.total),costPrice:Number(o.cost_price||0),warrantyDays:Number(o.warranty_days||0),warrantyUntil:o.warranty_until||null,saleApplied:!!o.sale_applied,status:o.status,paymentMode:o.payment_mode,gatewayStatus:o.gateway_status,paymentUrl:o.payment_url, paymentData,createdAt:o.created_at,expiresAt:o.expires_at,updatedAt:o.updated_at,paymentSubmittedAt:o.payment_submitted_at,paymentVerifiedAt:o.payment_verified_at,processingAt:o.processing_at,completedAt:o.completed_at,hasProof:!!o.proof_name,proofName:o.proof_name,delivery:o.delivery,note:o.note,hasCredentials:admin?!!o.credentials_enc:undefined,credentialsStatus:admin?(o.credentials_status||''):undefined,credentialsViewedAt:admin?o.credentials_viewed_at:undefined,bank:o.bank_id?{id:o.bank_id,name:o.bank_name,number:o.bank_number,holder:o.bank_holder}:null};
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
    const {rows:expired}=await client.query(`SELECT id,user_id,product_id,variant_id,quantity,stock_reserved,balance_used,voucher_code,credit_refunded FROM orders WHERE status='pending_payment' AND expires_at<NOW() FOR UPDATE`);
    for(const o of expired){
      if(o.stock_reserved){
        if(o.variant_id) await client.query('UPDATE product_variants SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.variant_id,o.quantity]);
        else await client.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.product_id,o.quantity]);
      }
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
  const [pr,vr,mr,ir,br,s,sales]=await Promise.all([
    q(`SELECT p.*,COALESCE(sc.sold_count,0)::int AS sold_count FROM products p LEFT JOIN (SELECT product_id,COUNT(*)::int AS sold_count FROM orders WHERE status='completed' GROUP BY product_id) sc ON sc.product_id=p.id WHERE p.active=TRUE ORDER BY p.featured DESC,p.created_at,p.id`),
    q(`SELECT * FROM product_variants WHERE active=TRUE ORDER BY product_id,sort_order,created_at,id`),
    q(`SELECT * FROM product_media WHERE active=TRUE ORDER BY product_id,sort_order,created_at,id`),
    q(`SELECT product_id,variant_id,COUNT(*)::int AS available FROM inventory WHERE status='available' GROUP BY product_id,variant_id`),
    q('SELECT id,name,number,holder,active FROM banks WHERE active=TRUE ORDER BY created_at,id'),
    getSettings(),
    q(`SELECT product_id,COUNT(*)::int AS n FROM orders WHERE status='completed' GROUP BY product_id ORDER BY n DESC LIMIT 3`)
  ]);
  const invProduct={}; const invVariant={};
  for(const x of ir.rows){const n=Number(x.available);invProduct[x.product_id]=(invProduct[x.product_id]||0)+n;if(x.variant_id)invVariant[x.variant_id]=n;}
  const variantsByProduct={};
  for(const v of vr.rows){const pv=publicVariant(v,invVariant[v.id]||0,(pr.rows.find(p=>p.id===v.product_id)||{}).fulfillment_mode||'manual');(variantsByProduct[v.product_id]??=[]).push(pv);}
  const mediaByProduct={};
  for(const m of mr.rows){(mediaByProduct[m.product_id]??=[]).push(publicMedia(m));}
  const best=new Set(sales.rows.filter(x=>Number(x.n)>0).map(x=>x.product_id));
  const products=pr.rows.map(p=>publicProduct({...p,best_seller:best.has(p.id)},invProduct[p.id]||0,variantsByProduct[p.id]||[],mediaByProduct[p.id]||[]));
  const methods=availablePaymentMethods(s,br.rows);
  const cfg=configuredPaymentMode();
  return {products,banks:br.rows,paymentMethods:methods,settings:{storeName:s.storeName||'Uply Digital',whatsapp:s.whatsapp||'',hours:s.hours||'',storeOpen:bool(s.storeOpen),paymentHours:Number(s.paymentHours)||24,notice:s.notice||'',promoBanner:s.promoBanner||'',paymentMode:cfg,paymentReady:methods.some(m=>m.id!=='balance'),paymentProvider:methods.map(m=>m.label).join(' · '),manualPaymentEnabled:bool(s.manualPaymentEnabled),midtransPaymentEnabled:bool(s.midtransPaymentEnabled),belibayarPaymentEnabled:bool(s.belibayarPaymentEnabled),duitkuPaymentEnabled:bool(s.duitkuPaymentEnabled),balancePaymentEnabled:bool(s.balancePaymentEnabled),qrisManualReady:!!s.qrisImageData,qrisName:s.qrisName||'QRIS Manual'}};
}
async function getUserById(userId){ const {rows}=await q(`SELECT u.id,u.email,u.name,u.phone,u.balance,u.membership_tier,u.membership_manual,u.created_at,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_count,COALESCE(SUM(CASE WHEN o.status='completed' THEN COALESCE(NULLIF(o.subtotal,0),o.price*o.quantity)-o.discount ELSE 0 END),0)::bigint AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.id=$1 GROUP BY u.id LIMIT 1`,[userId]); const u=rows[0]; if(!u)return u; const settings=await getSettings(); const autoEnabled=bool(settings.autoRoleEnabled); const tier=(u.membership_manual||!autoEnabled)?(u.membership_tier||'customer'):tierFromStats(u.completed_count,u.spent); return {...u,balance:Number(u.balance||0),membershipTier:tier,membershipManual:!!u.membership_manual,completedCount:Number(u.completed_count||0),spent:Number(u.spent||0)}; }
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function resolveVariant({db,product,variantId='',qty=1,lock=false}){
  const suffix=lock?' FOR UPDATE':'';
  const all=await db.query(`SELECT * FROM product_variants WHERE product_id=$1 AND active=TRUE ORDER BY sort_order,created_at,id${suffix}`,[product.id]);
  if(!all.rows.length){
    if(product.fulfillment_mode==='inventory'){
      const c=await db.query(`SELECT COUNT(*)::int AS n FROM inventory WHERE product_id=$1 AND variant_id='' AND status='available'`,[product.id]);
      if(Number(c.rows[0]?.n||0)<qty) throw safeError('Stok inventory otomatis tidak mencukupi.');
    }else if(Number(product.stock)!==-1 && Number(product.stock)<qty) throw safeError('Stok produk tidak mencukupi.');
    return null;
  }
  const vid=text(variantId,100);
  if(!vid) throw safeError('Pilih varian produk terlebih dahulu.');
  const variant=all.rows.find(v=>v.id===vid);
  if(!variant) throw safeError('Varian produk tidak tersedia. Silakan pilih varian lain.');
  if(product.fulfillment_mode==='inventory'){
    const c=await db.query(`SELECT COUNT(*)::int AS n FROM inventory WHERE product_id=$1 AND variant_id=$2 AND status='available'`,[product.id,variant.id]);
    if(Number(c.rows[0]?.n||0)<qty) throw safeError('Stok varian inventory tidak mencukupi.');
  }else if(Number(variant.stock)!==-1 && Number(variant.stock)<qty) throw safeError('Stok varian tidak mencukupi.');
  return variant;
}

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
  if(bool(settings.midtransPaymentEnabled) && gatewayReady('midtrans')) methods.push({id:'midtrans',label:'Midtrans',type:'gateway'});
  if(bool(settings.belibayarPaymentEnabled) && gatewayReady('belibayar')) methods.push({id:'belibayar',label:'BeliBayar',type:'gateway'});
  if(bool(settings.duitkuPaymentEnabled) && gatewayReady('duitku')) methods.push({id:'duitku',label:'Duitku',type:'gateway'});
  if(bool(settings.manualPaymentEnabled) && banks.length) methods.push({id:'manual',label:'Transfer Bank Manual',type:'manual'});
  if(bool(settings.manualPaymentEnabled) && settings.qrisImageData) methods.push({id:'qris_manual',label:settings.qrisName||'QRIS Manual',type:'manual_qris'});
  if(!methods.some(m=>m.id!=='balance')){
    if(cfg==='midtrans'&&gatewayReady('midtrans')) methods.push({id:'midtrans',label:'Midtrans',type:'gateway'});
    else if(banks.length&&bool(settings.manualPaymentEnabled)) methods.push({id:'manual',label:'Transfer Bank Manual',type:'manual'});
  }
  return methods;
}

async function createAutomaticPaymentForOrder(order,provider){
  provider=String(provider||order?.payment_mode||'').toLowerCase();
  if(!isAutomaticGateway(provider)||!gatewayReady(provider)) throw safeError(`${gatewayLabel(provider)} belum siap. Periksa Environment Variables, status merchant, callback, dan konfigurasi gateway.`,500);
  const currentAttempt=Math.max(0,Number(order.gateway_attempt)||0);
  const nextAttempt=currentAttempt+1;
  const prefix={midtrans:'M',belibayar:'B',duitku:'D'}[provider]||'P';
  const gatewayOrderId=`${order.id}-${prefix}${nextAttempt}`.slice(0,50);
  const defaults=defaultGatewayMethod(provider);
  await q(`UPDATE orders SET payment_url='',gateway_status='creating',gateway_order_id=$2,gateway_payment_method=$3,gateway_payment_channel=$4,gateway_attempt=$5,updated_at=NOW() WHERE id=$1`,[order.id,gatewayOrderId,defaults.method,defaults.channel,nextAttempt]);
  await q(`INSERT INTO payment_attempts(gateway_order_id,order_id,provider,attempt_no,status,payment_url,payload) VALUES($1,$2,$3,$4,'creating','','{}'::jsonb) ON CONFLICT(gateway_order_id) DO UPDATE SET provider=EXCLUDED.provider,status='creating',updated_at=NOW()`,[gatewayOrderId,order.id,provider,nextAttempt]);
  const fresh=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
  try{
    const payment=await createGatewayPayment(provider,fresh,gatewayOrderId);
    const n=normalizedCreatedPayment(provider,payment);
    await q(`UPDATE orders SET payment_url=$2,gateway_status=$3,gateway_transaction_id=$4,gateway_order_id=$5,gateway_payment_method=CASE WHEN $6<>'' THEN $6 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $7<>'' THEN $7 ELSE gateway_payment_channel END,gateway_payload=$8::jsonb,updated_at=NOW() WHERE id=$1`,[order.id,n.paymentUrl,n.status||'pending',n.transactionId,gatewayOrderId,n.method,n.channel,JSON.stringify(payment)]);
    await q(`UPDATE payment_attempts SET status=$2,transaction_id=$3,payment_url=$4,payload=$5::jsonb,updated_at=NOW() WHERE gateway_order_id=$1`,[gatewayOrderId,n.status||'pending',n.transactionId,n.paymentUrl,JSON.stringify(payment)]);
    return {paymentUrl:n.paymentUrl,paymentData:payment,gatewayOrderId};
  }catch(e){
    await q(`UPDATE orders SET gateway_status='error',updated_at=NOW() WHERE id=$1`,[order.id]);
    await q(`UPDATE payment_attempts SET status='error',payload=$2::jsonb,updated_at=NOW() WHERE gateway_order_id=$1`,[gatewayOrderId,JSON.stringify({error:e?.message||`${gatewayLabel(provider)} error`})]);
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
    else if(action==='claims'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const {rows}=await q(`SELECT c.*,o.product_name,o.variant_name,o.duration,o.warranty_until,o.completed_at FROM warranty_claims c JOIN orders o ON o.id=c.order_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 200`,[u.id]);
      data=rows.map(c=>({id:c.id,orderId:c.order_id,productId:c.product_id,variantId:c.variant_id||'',productName:c.product_name,variantName:c.variant_name||c.duration||'',category:c.category,description:c.description,status:c.status,adminNote:c.admin_note||'',hasScreenshot:!!c.screenshot_name,createdAt:c.created_at,updatedAt:c.updated_at,resolvedAt:c.resolved_at,warrantyUntil:c.warranty_until,completedAt:c.completed_at}));
    }
    else if(action==='customerNotifications'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const {rows}=await q('SELECT * FROM customer_notifications WHERE user_id=$1 ORDER BY is_read,created_at DESC LIMIT 100',[u.id]); data=rows;
    }
    else if(action==='markCustomerNotificationsRead'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      if(p.id) await q('UPDATE customer_notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2',[Number(p.id),u.id]); else await q('UPDATE customer_notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE',[u.id]); data=true;
    }
    else if(action==='createWarrantyClaim'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const orderId=text(p.orderId,80), category=text(p.category,50)||'kendala_produk', description=text(p.description,1800); if(description.length<10) throw safeError('Jelaskan kendala minimal 10 karakter.');
      const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0];
      if(!o||o.status!=='completed') throw safeError('Klaim hanya dapat dibuat untuk pesanan yang sudah selesai.');
      if(!o.warranty_until || new Date(o.warranty_until).getTime()<Date.now()) throw safeError('Masa garansi pesanan ini sudah berakhir atau produk tidak memiliki garansi aktif.');
      const active=(await q(`SELECT COUNT(*)::int AS n FROM warranty_claims WHERE order_id=$1 AND status NOT IN ('rejected','resolved')`,[orderId])).rows[0]?.n||0; if(Number(active)>0) throw safeError('Masih ada klaim aktif untuk pesanan ini.');
      let screenshotName='',screenshotMime='',screenshotData=''; const file=p.file&&typeof p.file==='object'?p.file:null;
      if(file){screenshotName=text(file.name,160);screenshotMime=text(file.mime,80);screenshotData=String(file.base64||'');if(!['image/jpeg','image/png','image/webp'].includes(screenshotMime))throw safeError('Screenshot harus JPG, PNG, atau WebP.');if(screenshotData.length>1800000)throw safeError('Screenshot maksimal sekitar 1,3 MB.');}
      const claimId=id('clm'); await q(`INSERT INTO warranty_claims(id,order_id,user_id,product_id,variant_id,category,description,screenshot_name,screenshot_mime,screenshot_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[claimId,o.id,u.id,o.product_id,o.variant_id||'',category,description,screenshotName,screenshotMime,screenshotData]);
      await audit(u.email,'warranty_claim_created',claimId,{orderId:o.id,product:o.product_name}); await notifyAdmin('warranty','Klaim garansi baru',`${o.product_name} · ${u.email}`,claimId); await notifyUser(u.id,'warranty','Klaim garansi diterima',`Klaim ${claimId} sudah masuk dan menunggu pemeriksaan admin.`,claimId); data={id:claimId};
    }
    else if(action==='checkoutPreflight'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const settings=await getSettings(); if(!bool(settings.storeOpen)) throw safeError('Toko sedang menutup pesanan baru.');
      const qty=Number(p.quantity); if(!Number.isInteger(qty)||qty<1||qty>5) throw safeError('Jumlah produk harus 1–5.');
      const {rows}=await q('SELECT * FROM products WHERE id=$1 AND active=TRUE LIMIT 1',[text(p.productId,100)]); const prod=rows[0]; if(!prod) throw safeError('Produk tidak tersedia.');
      const variant=await resolveVariant({db:{query:(t,pa)=>q(t,pa)},product:prod,variantId:p.variantId,qty});
      const sourcePrice=saleInfo(variant||prod); const pricedProduct={...prod,price:Number(sourcePrice.price)};
      const requiresLogin=bool(prod.requires_login_credentials)||String(prod.category).toLowerCase().replace(/\s+/g,'')==='topup';
      if(requiresLogin){if(!credentialSecurityReady()) throw safeError('CREDENTIAL_ENCRYPTION_KEY belum diatur untuk produk Top Up.',500);if(!validEmail(normalizeEmail(p.accountEmail))) throw safeError('Email login akun Top Up tidak valid.');const pw=String(p.accountPassword||'');if(pw.length<4||pw.length>200) throw safeError('Password login akun Top Up belum valid.');}
      const {rows:activeBanks}=await q('SELECT * FROM banks WHERE active=TRUE ORDER BY created_at,id');
      const methods=availablePaymentMethods(settings,activeBanks); const allowed=new Set(methods.map(x=>x.id));
      const requested=text(p.paymentMethod,30); const userRow=await q('SELECT balance FROM users WHERE id=$1 LIMIT 1',[u.id]);
      const voucher=await voucherQuote({code:p.voucherCode,userId:u.id,product:pricedProduct,qty}); const subtotal=Number(pricedProduct.price)*qty; const afterDiscount=Math.max(0,subtotal-Number(voucher.discount||0));
      const balance=bool(p.useBalance)&&bool(settings.balancePaymentEnabled)?Number(userRow.rows[0]?.balance||0):0; const due=Math.max(0,afterDiscount-Math.min(balance,afterDiscount));
      if(due>0){
        if(!requested || !allowed.has(requested)) throw safeError('Pilih metode pembayaran yang tersedia.');
        if(requested==='manual'&&!activeBanks.some(b=>b.id===text(p.bankId,100))) throw safeError('Pilih rekening pembayaran yang aktif.');
        if(isAutomaticGateway(requested)&&!gatewayReady(requested)) throw safeError(`${gatewayLabel(requested)} belum siap. Periksa Environment Variables dan konfigurasi merchant.`,500);
      }
      data={ready:true,productId:prod.id,variantId:variant?.id||'',quantity:qty,paymentMethod:due===0?'balance':requested};
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
        const client=await pool.connect(); let order=null,prod=null,variant=null,pricedProduct=null,mode='manual',voucher={code:'',discount:0}; let lowStockAfter=null;
        try{
          await client.query('BEGIN');
          const {rows:prs}=await client.query('SELECT * FROM products WHERE id=$1 AND active=TRUE LIMIT 1 FOR UPDATE',[text(p.productId,100)]); prod=prs[0]; if(!prod) throw safeError('Produk tidak tersedia.');
          variant=await resolveVariant({db:client,product:prod,variantId:p.variantId,qty,lock:true});
          const sourcePrice=saleInfo(variant||prod); pricedProduct={...prod,price:Number(sourcePrice.price)};

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

          voucher=await voucherQuote({code:p.voucherCode,userId:u.id,product:pricedProduct,qty,client});
          const subtotal=Number(pricedProduct.price)*qty, afterDiscount=Math.max(0,subtotal-Number(voucher.discount||0));
          const {rows:userRows}=await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE',[u.id]); const userBalance=Number(userRows[0]?.balance||0);
          const useBalance=bool(p.useBalance)&&bool(settings.balancePaymentEnabled); const balanceUsed=useBalance?Math.min(userBalance,afterDiscount):0; const due=Math.max(0,afterDiscount-balanceUsed);

          const {rows:activeBanks}=await client.query('SELECT * FROM banks WHERE active=TRUE ORDER BY created_at,id');
          const methods=availablePaymentMethods(settings,activeBanks); const allowed=new Set(methods.map(x=>x.id));
          let requested=text(p.paymentMethod,30); if(!requested||requested==='balance') requested=methods.find(x=>x.id!=='balance')?.id||'';
          if(due===0) mode='balance';
          else if(isAutomaticGateway(requested)&&allowed.has(requested)) mode=requested;
          else if(requested==='qris_manual'&&allowed.has('qris_manual')) mode='qris_manual';
          else if(requested==='manual'&&allowed.has('manual')) mode='manual';
          else throw safeError('Metode pembayaran yang dipilih sedang tidak tersedia.');

          let bank={id:'',name:'',number:'',holder:''};
          if(mode==='manual'){
            const chosen=activeBanks.find(b=>b.id===text(p.bankId,100)); if(!chosen) throw safeError('Pilih rekening pembayaran yang aktif.'); bank=chosen;
          }
          if(isAutomaticGateway(mode)&&!gatewayReady(mode)) throw safeError(`${gatewayLabel(mode)} belum siap. Periksa konfigurasi Vercel dan deploy ulang.`,500);

          const orderId=`UPL-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,10).toUpperCase()}`;
          const hours=Math.max(1,Math.min(72,Number(settings.paymentHours)||24)), customerNote=text(p.customerNote,800);
          const stockSource=variant||prod;
          const finiteManualStock=Number(stockSource.stock)!==-1 && prod.fulfillment_mode!=='inventory';
          if(finiteManualStock){
            if(variant){
              const reserved=await client.query('UPDATE product_variants SET stock=stock-$2,updated_at=NOW() WHERE id=$1 AND stock>=$2 RETURNING stock',[variant.id,qty]);
              if(!reserved.rowCount) throw safeError('Stok varian berubah saat checkout dan sekarang tidak mencukupi. Silakan coba lagi.');
              lowStockAfter={stock:Number(reserved.rows[0].stock),threshold:Number(prod.low_stock_threshold||3),label:variant.name};
            }else{
              const reserved=await client.query('UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1 AND stock>=$2 RETURNING stock,low_stock_threshold',[prod.id,qty]);
              if(!reserved.rowCount) throw safeError('Stok berubah saat checkout dan sekarang tidak mencukupi. Silakan coba lagi.');
              lowStockAfter={stock:Number(reserved.rows[0].stock),threshold:Number(reserved.rows[0].low_stock_threshold||3),label:''};
            }
          }
          if(balanceUsed>0){
            await client.query('UPDATE users SET balance=balance-$2,updated_at=NOW() WHERE id=$1 AND balance>=$2',[u.id,balanceUsed]);
            await client.query(`INSERT INTO balance_ledger(user_id,amount,type,reference,note,actor) VALUES($1,$2,'purchase',$3,$4,$5)`,[u.id,-balanceUsed,orderId,`Saldo dipakai untuk ${prod.name}`,u.email]);
          }
          if(voucher.code) await client.query('INSERT INTO voucher_usages(voucher_code,user_id,order_id,discount) VALUES($1,$2,$3,$4)',[voucher.code,u.id,orderId,voucher.discount]);

          const gatewayDefaults=isAutomaticGateway(mode)?defaultGatewayMethod(mode):{method:mode,channel:mode==='qris_manual'?'QRIS_MANUAL':''}; const selectedPayMethod=gatewayDefaults.method; const selectedPayChannel=gatewayDefaults.channel;
          const publicThumb=prod.thumbnail_data?`/api/product-image?id=${encodeURIComponent(prod.id)}&v=${encodeURIComponent(new Date(prod.updated_at||Date.now()).getTime())}`:(prod.thumbnail_url||'');
          const initialStatus=mode==='balance'?'processing':'pending_payment'; const verified=mode==='balance';
          const costSnapshot=Math.max(0,Number((variant||prod).cost_price||0)); const warrantySnapshot=warrantyDays(prod,variant); const saleApplied=!!sourcePrice.saleActive;
          const {rows:ors}=await client.query(`INSERT INTO orders(id,user_id,email,name,phone,channel,product_id,product_name,product_thumbnail,variant_id,variant_name,variant_subtitle,duration,quantity,price,subtotal,discount,voucher_code,balance_used,total,cost_price,warranty_days,sale_applied,bank_id,bank_name,bank_number,bank_holder,note,status,payment_mode,expires_at,request_id,stock_reserved,credentials_enc,credentials_status,gateway_payment_method,gateway_payment_channel,payment_submitted_at,payment_verified_at,processing_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,NOW()+($31 || ' hours')::interval,$32,$33,$34,$35,$36,$37,$38,$39,$40) RETURNING *`,[orderId,u.id,u.email,name,ph,channel,prod.id,prod.name,publicThumb,variant?.id||'',variant?.name||'',variant?.subtitle||'',variant?.name||prod.duration,qty,Number(pricedProduct.price),subtotal,voucher.discount,voucher.code,balanceUsed,due,costSnapshot,warrantySnapshot,saleApplied,bank.id||'',bank.name||'',bank.number||'',bank.holder||'',customerNote,initialStatus,mode,String(hours),requestId,finiteManualStock&&!verified,credentialsEnc,credentialsEnc?'encrypted':'',selectedPayMethod,selectedPayChannel,verified?new Date():null,verified?new Date():null,verified?new Date():null]);
          order=ors[0]; await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}

        let paymentUrl='',paymentData=null,paymentError='';
        if(isAutomaticGateway(mode)){
          try{const created=await createAutomaticPaymentForOrder(order,mode);paymentUrl=created.paymentUrl;paymentData=created.paymentData;order=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];}
          catch(e){paymentError=e?.safe?e.message:`${gatewayLabel(mode)} belum dapat membuat transaksi.`;await q(`UPDATE orders SET gateway_status='error',note=CASE WHEN note='' THEN $2 ELSE note || E'\n' || $2 END,updated_at=NOW() WHERE id=$1`,[order.id,`Payment gateway ${gatewayLabel(mode)}: ${paymentError}`]);}
        }
        if(mode==='balance') await autoFulfillOrder(order.id,'balance');
        await audit(u.email,'order_created',order.id,{productId:prod.id,variantId:variant?.id||'',subtotal:Number(order.subtotal),discount:Number(order.discount),balanceUsed:Number(order.balance_used),total:Number(order.total),mode,voucher:voucher.code});
        await notifyAdmin('order','Pesanan baru',`${prod.name}${variant?` · ${variant.name}`:''} · ${order.name} · Rp${Number(order.total).toLocaleString('id-ID')}`,order.id);
        if(lowStockAfter&&lowStockAfter.stock<=lowStockAfter.threshold) await notifyAdmin('stock','Stok menipis',`${prod.name}${lowStockAfter.label?` · ${lowStockAfter.label}`:''} tersisa ${lowStockAfter.stock}.`,variant?.id||prod.id);
        await sendEmail(u.email,`Pesanan ${order.id} dibuat`,`<h2>Pesanan Uply Digital dibuat</h2><p>${escapeHtml(prod.name)} · ${escapeHtml(variant?.name||prod.duration)}</p><p>Subtotal: <strong>Rp${Number(order.subtotal).toLocaleString('id-ID')}</strong></p>${Number(order.discount)?`<p>Diskon: -Rp${Number(order.discount).toLocaleString('id-ID')}</p>`:''}${Number(order.balance_used)?`<p>Saldo: -Rp${Number(order.balance_used).toLocaleString('id-ID')}</p>`:''}<p>Total dibayar: <strong>Rp${Number(order.total).toLocaleString('id-ID')}</strong></p><p>Status: ${mode==='balance'?'pembayaran lunas dari saldo':'menunggu pembayaran'}.</p>`);
        data={order:publicOrder((await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]),paymentUrl:paymentUrl||order.payment_url||'',paymentData:paymentData||order.gateway_payload||null,paymentError,duplicate:false};
      }
    }
    else if(action==='retryPayment'){
      const u=await requireAuth(req);const orderId=text(p.orderId,80);const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]);const o=rows[0];
      if(!o||!isAutomaticGateway(o.payment_mode)||o.status!=='pending_payment') throw safeError('Pembayaran otomatis tidak dapat dibuat ulang.');
      if(!gatewayReady(o.payment_mode)) throw safeError(`${gatewayLabel(o.payment_mode)} belum siap. Periksa konfigurasi gateway.`,500);
      if((o.payment_url || Object.keys(o.gateway_payload||{}).length>0) && ['pending','creating'].includes(String(o.gateway_status||'').toLowerCase())) data={paymentUrl:o.payment_url,paymentData:o.gateway_payload||{},reused:true};
      else{
        if(o.gateway_order_id) await expireGatewayPayment(o.payment_mode,o.gateway_order_id);
        const created=await createAutomaticPaymentForOrder(o,o.payment_mode);data={paymentUrl:created.paymentUrl,paymentData:created.paymentData,reused:false};
      }
    }
    else if(action==='syncPaymentStatus'){
      const u=await requireAuth(req);const orderId=text(p.orderId,80);const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]);const o=rows[0];
      if(!o||!isAutomaticGateway(o.payment_mode)) throw safeError('Pesanan gateway otomatis tidak ditemukan.');
      if(o.status==='completed'){data={order:publicOrder(o),state:'success'};}
      else if(!o.gateway_order_id){throw safeError(`Transaksi ${gatewayLabel(o.payment_mode)} belum dibuat. Klik Buat pembayaran terlebih dahulu.`);}
      else{
        const statusBody=await getGatewayStatus(o.payment_mode,o.gateway_order_id);
        const result=await applyGatewayStatus(o.payment_mode,statusBody,`${o.payment_mode}-sync`);
        const n=normalizedStatus(o.payment_mode,statusBody);
        await q(`UPDATE orders SET gateway_payload=$2::jsonb,gateway_status=$3,gateway_transaction_id=CASE WHEN $4<>'' THEN $4 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $6<>'' THEN $6 ELSE gateway_payment_channel END,updated_at=NOW() WHERE id=$1`,[orderId,JSON.stringify(statusBody),n.status,n.transactionId,n.method,n.channel]);
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
      if(isAutomaticGateway(o.payment_mode)&&o.gateway_order_id) await expireGatewayPayment(o.payment_mode,o.gateway_order_id);
      await q(`UPDATE orders SET status='cancelled',note='Dibatalkan pelanggan sebelum pembayaran terverifikasi.',credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW() WHERE id=$1`,[orderId]);
      if(o.stock_reserved){if(o.variant_id)await q('UPDATE product_variants SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.variant_id,o.quantity]);else await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.product_id,o.quantity]);await q('UPDATE orders SET stock_reserved=FALSE WHERE id=$1',[orderId]);}
      await refundOrderCredits(orderId,u.email,'Pesanan dibatalkan pelanggan.'); await audit(u.email,'order_cancelled',orderId,{}); data=true;
    }
    else if(action==='adminData'){
      const a=await requireAdmin(req);
      const [orders,products,variants,media,banks,customers,inv,invItems,aud,s,vouchers,ledger,notifications,daily,topProducts,paymentMix,claims,paymentAttempts,paymentEvents]=await Promise.all([
        q('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000'),
        q('SELECT * FROM products ORDER BY created_at,id'),
        q('SELECT * FROM product_variants ORDER BY product_id,sort_order,created_at,id'),
        q('SELECT * FROM product_media ORDER BY product_id,sort_order,created_at,id'),
        q('SELECT * FROM banks ORDER BY created_at,id'),
        q(`SELECT u.id,u.email,u.name,u.phone,u.balance,u.membership_tier,u.membership_manual,u.created_at,COUNT(o.id)::int AS orders_count,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_count,COALESCE(SUM(CASE WHEN o.status='completed' THEN COALESCE(NULLIF(o.subtotal,0),o.price*o.quantity)-o.discount ELSE 0 END),0)::bigint AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 1000`),
        q(`SELECT product_id,variant_id,status,COUNT(*)::int AS count FROM inventory GROUP BY product_id,variant_id,status`),
        q(`SELECT i.id,i.product_id,i.variant_id,p.name AS product_name,pv.name AS variant_name,i.item_value,i.note,i.status,i.order_id,i.created_at,i.updated_at FROM inventory i LEFT JOIN products p ON p.id=i.product_id LEFT JOIN product_variants pv ON pv.id=i.variant_id ORDER BY i.created_at DESC LIMIT 1000`),
        q('SELECT id,timestamp,actor,action,record_id,detail FROM audit ORDER BY timestamp DESC LIMIT 400'),
        getSettings(),
        q(`SELECT v.*,COALESCE(u.used,0)::int AS used FROM vouchers v LEFT JOIN (SELECT voucher_code,COUNT(*)::int AS used FROM voucher_usages GROUP BY voucher_code) u ON u.voucher_code=v.code ORDER BY v.created_at DESC`),
        q(`SELECT l.*,u.name,u.email FROM balance_ledger l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 500`),
        q(`SELECT * FROM admin_notifications ORDER BY is_read,created_at DESC LIMIT 100`),
        q(`SELECT to_char((created_at AT TIME ZONE 'Asia/Jakarta')::date,'YYYY-MM-DD') AS day,COUNT(*)::int AS orders,COALESCE(SUM(CASE WHEN status IN ('processing','completed') THEN COALESCE(NULLIF(subtotal,0),price*quantity)-discount ELSE 0 END),0)::bigint AS revenue FROM orders WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY 1`),
        q(`SELECT product_id,MAX(product_name) AS name,COUNT(*) FILTER (WHERE status='completed')::int AS completed,COALESCE(SUM(CASE WHEN status='completed' THEN quantity ELSE 0 END),0)::int AS units,COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(NULLIF(subtotal,0),price*quantity)-discount ELSE 0 END),0)::bigint AS revenue FROM orders GROUP BY product_id ORDER BY revenue DESC LIMIT 10`),
        q(`SELECT payment_mode,COUNT(*)::int AS orders,COALESCE(SUM(CASE WHEN status IN ('processing','completed') THEN total+balance_used ELSE 0 END),0)::bigint AS revenue FROM orders GROUP BY payment_mode ORDER BY orders DESC`),
        q(`SELECT c.*,u.name AS customer_name,u.email AS customer_email,o.product_name,o.variant_name,o.duration,o.warranty_until FROM warranty_claims c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN orders o ON o.id=c.order_id ORDER BY c.created_at DESC LIMIT 500`),
        q(`SELECT pa.*,o.product_name,o.name AS customer_name,o.total AS order_total,o.status AS order_status FROM payment_attempts pa LEFT JOIN orders o ON o.id=pa.order_id ORDER BY pa.created_at DESC LIMIT 500`),
        q(`SELECT * FROM payment_events ORDER BY created_at DESC LIMIT 300`)
      ]);
      const invMap={},invVariant={}; for(const r of inv.rows){invMap[r.product_id]??={available:0,delivered:0,disabled:0};invMap[r.product_id][r.status]=(invMap[r.product_id][r.status]||0)+Number(r.count);if(r.variant_id){invVariant[r.variant_id]??={available:0,delivered:0,disabled:0};invVariant[r.variant_id][r.status]=Number(r.count);}}
      const variantsByProduct={}; for(const v of variants.rows){const prod=products.rows.find(p=>p.id===v.product_id);const pv={...publicVariant(v,invVariant[v.id]?.available||0,prod?.fulfillment_mode||'manual'),costPrice:Number(v.cost_price||0),warrantyDays:Number(v.warranty_days||0),salePrice:Number(v.sale_price||0),saleStartsAt:v.sale_starts_at||null,saleEndsAt:v.sale_ends_at||null};(variantsByProduct[v.product_id]??=[]).push(pv);}
      const mediaByProduct={}; for(const m of media.rows){(mediaByProduct[m.product_id]??=[]).push(publicMedia(m));}
      const methods=availablePaymentMethods(s,banks.rows.filter(b=>b.active));
      data={
        orders:orders.rows.map(x=>publicOrder(x,true)),
        products:products.rows.map(p=>({...publicProduct(p,invMap[p.id]?.available||0,variantsByProduct[p.id]||[],mediaByProduct[p.id]||[]),costPrice:Number(p.cost_price||0),warrantyDays:Number(p.warranty_days||0),salePrice:Number(p.sale_price||0),saleStartsAt:p.sale_starts_at||null,saleEndsAt:p.sale_ends_at||null,allVariants:variantsByProduct[p.id]||[],allGallery:mediaByProduct[p.id]||[]})),
        banks:banks.rows,
        customers:customers.rows.map(c=>({...c,balance:Number(c.balance||0),membershipTier:(c.membership_manual||!bool(s.autoRoleEnabled))?(c.membership_tier||'customer'):tierFromStats(c.completed_count,c.spent),membershipManual:!!c.membership_manual,ordersCount:Number(c.orders_count),completedCount:Number(c.completed_count),spent:Number(c.spent)})),
        inventory:invMap,
        inventoryItems:invItems.rows.map(i=>({id:i.id,productId:i.product_id,variantId:i.variant_id||'',productName:i.product_name||i.product_id,variantName:i.variant_name||'',itemValue:i.item_value,note:i.note||'',status:i.status,orderId:i.order_id||'',createdAt:i.created_at,updatedAt:i.updated_at})),
        vouchers:vouchers.rows.map(v=>({...v,discountValue:Number(v.discount_value),minSpend:Number(v.min_spend),maxDiscount:Number(v.max_discount),usageLimit:Number(v.usage_limit),perUserLimit:Number(v.per_user_limit),used:Number(v.used),productIds:Array.isArray(v.product_ids)?v.product_ids:[]})),
        balanceLedger:ledger.rows.map(l=>({...l,amount:Number(l.amount)})),
        notifications:notifications.rows,
        claims:claims.rows.map(c=>({id:c.id,orderId:c.order_id,userId:c.user_id,productId:c.product_id,variantId:c.variant_id||'',customerName:c.customer_name||'',customerEmail:c.customer_email||'',productName:c.product_name||'',variantName:c.variant_name||c.duration||'',category:c.category,description:c.description,status:c.status,adminNote:c.admin_note||'',hasScreenshot:!!c.screenshot_name,warrantyUntil:c.warranty_until,createdAt:c.created_at,updatedAt:c.updated_at,resolvedAt:c.resolved_at})),
        paymentAttempts:paymentAttempts.rows.map(x=>({gatewayOrderId:x.gateway_order_id,orderId:x.order_id,provider:x.provider,attemptNo:Number(x.attempt_no),status:x.status,transactionId:x.transaction_id,paymentUrl:x.payment_url,createdAt:x.created_at,updatedAt:x.updated_at,productName:x.product_name||'',customerName:x.customer_name||'',orderTotal:Number(x.order_total||0),orderStatus:x.order_status||''})),
        paymentEvents:paymentEvents.rows.map(x=>({id:x.id,eventKey:x.event_key,orderId:x.order_id,error:x.error||'',processedAt:x.processed_at,createdAt:x.created_at})),
        analytics:{daily:daily.rows.map(r=>({...r,orders:Number(r.orders),revenue:Number(r.revenue)})),topProducts:topProducts.rows.map(r=>({...r,completed:Number(r.completed),units:Number(r.units),revenue:Number(r.revenue)})),paymentMix:paymentMix.rows.map(r=>({...r,orders:Number(r.orders),revenue:Number(r.revenue)})),profit:orders.rows.filter(o=>o.status==='completed').reduce((n,o)=>n+(Number(o.subtotal||Number(o.price)*Number(o.quantity))-Number(o.discount||0)-Number(o.cost_price||0)*Number(o.quantity)),0)},
        audit:aud.rows,
        settings:{...s,qrisImageData:undefined,qrisImageMime:undefined,storeOpen:bool(s.storeOpen),paymentHours:Number(s.paymentHours)||24,paymentMode:configuredPaymentMode(),paymentReady:methods.some(m=>m.id!=='balance'),paymentMethods:methods,gatewayHealth:gatewayHealth(),manualPaymentEnabled:bool(s.manualPaymentEnabled),midtransPaymentEnabled:bool(s.midtransPaymentEnabled),belibayarPaymentEnabled:bool(s.belibayarPaymentEnabled),duitkuPaymentEnabled:bool(s.duitkuPaymentEnabled),balancePaymentEnabled:bool(s.balancePaymentEnabled),autoRoleEnabled:bool(s.autoRoleEnabled),qrisManualReady:!!s.qrisImageData,qrisName:s.qrisName||'QRIS Manual'},
        admin:{email:a.email}
      };
    }
    else if(action==='saveProduct'){
      const a=await requireAdmin(req); const x=p.product||{}; let pid=text(x.id,100); if(!pid) pid=id('prd');
      const name=text(x.name,80),category=text(x.category,60)||'Digital',duration=text(x.duration,80),price=Number(x.price),stock=Number(x.stock),lowStockThreshold=Math.max(0,Math.min(999,Number(x.lowStockThreshold)||3)),costPrice=Math.max(0,Math.round(Number(x.costPrice)||0)),warrantyDaysValue=Math.max(0,Math.min(3650,Math.round(Number(x.warrantyDays)||0))),salePrice=Math.max(0,Math.round(Number(x.salePrice)||0)); const saleStarts=x.saleStartsAt?new Date(x.saleStartsAt):null,saleEnds=x.saleEndsAt?new Date(x.saleEndsAt):null; if(saleStarts&&Number.isNaN(saleStarts.getTime())) throw safeError('Tanggal mulai flash sale tidak valid.'); if(saleEnds&&Number.isNaN(saleEnds.getTime())) throw safeError('Tanggal akhir flash sale tidak valid.'); if(saleStarts&&saleEnds&&saleEnds<=saleStarts) throw safeError('Tanggal akhir flash sale harus setelah tanggal mulai.'); if(salePrice>0&&salePrice>=price) throw safeError('Harga flash sale harus lebih kecil dari harga normal.'); const isTopUp=category.toLowerCase().replace(/\s+/g,'')==='topup'; const mode=isTopUp?'manual':(x.fulfillmentMode==='inventory'?'inventory':'manual'); const requiresLogin=isTopUp||bool(x.requiresLoginCredentials); let thumbnail=text(x.thumbnail,500); if(thumbnail && !thumbnail.startsWith('/assets/') && !/^https:\/\//i.test(thumbnail)) throw safeError('Thumbnail harus berupa path /assets/... atau URL HTTPS.'); const featured=bool(x.featured); const upload=x.thumbnailUpload&&typeof x.thumbnailUpload==='object'?x.thumbnailUpload:null; let thumbnailMime='',thumbnailData=''; if(upload){thumbnailMime=text(upload.mime,80);thumbnailData=String(upload.base64||'');if(!['image/jpeg','image/png','image/webp'].includes(thumbnailMime)) throw safeError('Thumbnail upload harus JPG, PNG, atau WebP.');if(thumbnailData.length>1400000) throw safeError('Ukuran thumbnail maksimal sekitar 1 MB.');if(!/^[A-Za-z0-9+/=]+$/.test(thumbnailData)) throw safeError('Data thumbnail tidak valid.');}
      if(name.length<2||!Number.isInteger(price)||price<1000||!Number.isInteger(stock)||stock<-1) throw safeError('Data produk belum valid.');
      const benefits=Array.isArray(x.benefits)?x.benefits.map(v=>text(v,150)).filter(Boolean).slice(0,20):[];
      await q(`INSERT INTO products(id,name,category,duration,price,description,benefits,terms,stock,active,badge,icon,fulfillment_mode,thumbnail_url,thumbnail_mime,thumbnail_data,featured,requires_login_credentials,low_stock_threshold,cost_price,warranty_days,sale_price,sale_starts_at,sale_ends_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,duration=EXCLUDED.duration,price=EXCLUDED.price,description=EXCLUDED.description,benefits=EXCLUDED.benefits,terms=EXCLUDED.terms,stock=EXCLUDED.stock,active=EXCLUDED.active,badge=EXCLUDED.badge,icon=EXCLUDED.icon,fulfillment_mode=EXCLUDED.fulfillment_mode,thumbnail_url=EXCLUDED.thumbnail_url,thumbnail_mime=CASE WHEN EXCLUDED.thumbnail_data<>'' THEN EXCLUDED.thumbnail_mime ELSE products.thumbnail_mime END,thumbnail_data=CASE WHEN EXCLUDED.thumbnail_data<>'' THEN EXCLUDED.thumbnail_data ELSE products.thumbnail_data END,featured=EXCLUDED.featured,requires_login_credentials=EXCLUDED.requires_login_credentials,low_stock_threshold=EXCLUDED.low_stock_threshold,cost_price=EXCLUDED.cost_price,warranty_days=EXCLUDED.warranty_days,sale_price=EXCLUDED.sale_price,sale_starts_at=EXCLUDED.sale_starts_at,sale_ends_at=EXCLUDED.sale_ends_at,updated_at=NOW()`,[pid,name,category,duration,price,text(x.description,300),JSON.stringify(benefits),text(x.terms,2000),stock,bool(x.active),text(x.badge,40),text(x.icon,30)||'generic',mode,thumbnail,thumbnailMime,thumbnailData,featured,requiresLogin,lowStockThreshold,costPrice,warrantyDaysValue,salePrice,saleStarts?saleStarts.toISOString():null,saleEnds?saleEnds.toISOString():null]);
      if(!upload && (bool(x.clearUploadedThumbnail) || !!thumbnail)) await q(`UPDATE products SET thumbnail_mime='',thumbnail_data='',updated_at=NOW() WHERE id=$1`,[pid]);
      await audit(a.email,'product_saved',pid,{name,mode,featured,requiresLogin,thumbnailUpload:!!upload}); data={id:pid};
    }
    else if(action==='deleteProduct'){
      const admin=await requireAdmin(req); const productId=text(p.productId,100);
      const product=(await q('SELECT id,name,active FROM products WHERE id=$1 LIMIT 1',[productId])).rows[0]; if(!product) throw safeError('Produk tidak ditemukan.');
      const [ordersCount,inventoryCount,variantsCount]=await Promise.all([
        q('SELECT COUNT(*)::int AS n FROM orders WHERE product_id=$1',[productId]),
        q('SELECT COUNT(*)::int AS n FROM inventory WHERE product_id=$1',[productId]),
        q('SELECT COUNT(*)::int AS n FROM product_variants WHERE product_id=$1',[productId])
      ]);
      const orders=Number(ordersCount.rows[0]?.n||0), inventory=Number(inventoryCount.rows[0]?.n||0), variants=Number(variantsCount.rows[0]?.n||0);
      if(orders>0 || inventory>0){
        await q('UPDATE products SET active=FALSE,featured=FALSE,updated_at=NOW() WHERE id=$1',[productId]);
        await audit(admin.email,'product_archived',productId,{name:product.name,orders,inventory,variants});
        data={mode:'archived',id:productId,name:product.name,orders,inventory,variants};
      }else{
        const client=await pool.connect();
        try{
          await client.query('BEGIN');
          await client.query('DELETE FROM product_variants WHERE product_id=$1',[productId]);
          await client.query('DELETE FROM product_media WHERE product_id=$1',[productId]);
          await client.query('DELETE FROM products WHERE id=$1',[productId]);
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
        await audit(admin.email,'product_deleted',productId,{name:product.name,variants});
        data={mode:'deleted',id:productId,name:product.name,orders:0,inventory:0,variants};
      }
    }
    else if(action==='restoreProduct'){
      const admin=await requireAdmin(req); const productId=text(p.productId,100);
      const r=await q('UPDATE products SET active=TRUE,updated_at=NOW() WHERE id=$1 RETURNING id,name',[productId]); if(!r.rowCount) throw safeError('Produk tidak ditemukan.');
      await audit(admin.email,'product_restored',productId,{name:r.rows[0].name}); data={id:r.rows[0].id,name:r.rows[0].name};
    }
    else if(action==='saveProductMedia'){
      const a=await requireAdmin(req); const x=p.media||{}; const productId=text(x.productId,100); let mediaId=text(x.id,100)||id('med');
      const product=(await q('SELECT id,name FROM products WHERE id=$1 LIMIT 1',[productId])).rows[0]; if(!product) throw safeError('Produk tidak ditemukan.');
      if(!x.id){const count=Number((await q('SELECT COUNT(*)::int AS n FROM product_media WHERE product_id=$1',[productId])).rows[0]?.n||0);if(count>=12)throw safeError('Maksimal 12 gambar galeri per produk.');}
      const allowedKinds=new Set(['benefit','warranty','claim','activation','tutorial','info','other']); const kind=allowedKinds.has(text(x.kind,30))?text(x.kind,30):'info';
      const title=text(x.title,80),caption=text(x.caption,240),sortOrder=Math.max(-999,Math.min(999,Number(x.sortOrder)||0));
      let imageUrl=text(x.imageUrl,500); if(imageUrl && !imageUrl.startsWith('/assets/') && !/^https:\/\//i.test(imageUrl)) throw safeError('URL gambar harus berupa path /assets/... atau URL HTTPS.');
      const upload=x.imageUpload&&typeof x.imageUpload==='object'?x.imageUpload:null; let imageMime='',imageData='';
      if(upload){imageMime=text(upload.mime,80);imageData=String(upload.base64||'');if(!['image/jpeg','image/png','image/webp'].includes(imageMime))throw safeError('Gambar galeri harus JPG, PNG, atau WebP.');if(imageData.length>1800000)throw safeError('Ukuran gambar galeri maksimal sekitar 1,3 MB.');if(!/^[A-Za-z0-9+/=]+$/.test(imageData))throw safeError('Data gambar galeri tidak valid.');}
      if(!upload&&!imageUrl&&!(x.id&&bool(x.keepExistingImage))) throw safeError('Pilih gambar upload atau isi URL gambar.');
      await q(`INSERT INTO product_media(id,product_id,kind,title,caption,image_url,image_mime,image_data,sort_order,active,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,kind=EXCLUDED.kind,title=EXCLUDED.title,caption=EXCLUDED.caption,image_url=CASE WHEN EXCLUDED.image_url<>'' THEN EXCLUDED.image_url ELSE product_media.image_url END,image_mime=CASE WHEN EXCLUDED.image_data<>'' THEN EXCLUDED.image_mime ELSE product_media.image_mime END,image_data=CASE WHEN EXCLUDED.image_data<>'' THEN EXCLUDED.image_data ELSE product_media.image_data END,sort_order=EXCLUDED.sort_order,active=EXCLUDED.active,updated_at=NOW()`,
        [mediaId,productId,kind,title,caption,imageUrl,imageMime,imageData,sortOrder,bool(x.active)]);
      if(bool(x.clearUploadedImage)&&!upload) await q(`UPDATE product_media SET image_mime='',image_data='',image_url=$2,updated_at=NOW() WHERE id=$1`,[mediaId,imageUrl]);
      await audit(a.email,'product_media_saved',mediaId,{productId,kind,title,uploaded:!!upload}); data={id:mediaId};
    }
    else if(action==='deleteProductMedia'){
      const a=await requireAdmin(req); const mediaId=text(p.mediaId,100); const row=(await q('DELETE FROM product_media WHERE id=$1 RETURNING id,product_id,title',[mediaId])).rows[0]; if(!row) throw safeError('Gambar galeri tidak ditemukan.');
      await audit(a.email,'product_media_deleted',mediaId,{productId:row.product_id,title:row.title}); data=true;
    }
    else if(action==='saveProductVariant'){
      const a=await requireAdmin(req); const x=p.variant||{}; const productId=text(x.productId,100); let variantId=text(x.id,100)||id('var');
      const product=(await q('SELECT id,name,fulfillment_mode FROM products WHERE id=$1 LIMIT 1',[productId])).rows[0]; if(!product) throw safeError('Produk tidak ditemukan.');
      const name=text(x.name,80),subtitle=text(x.subtitle,140),price=Number(x.price),compareAtPrice=Math.max(0,Number(x.compareAtPrice)||0),stock=Number(x.stock),sortOrder=Math.max(-999,Math.min(999,Number(x.sortOrder)||0)),badge=text(x.badge,40),costPrice=Math.max(0,Math.round(Number(x.costPrice)||0)),warrantyDaysValue=Math.max(0,Math.min(3650,Math.round(Number(x.warrantyDays)||0))),salePrice=Math.max(0,Math.round(Number(x.salePrice)||0)); const saleStarts=x.saleStartsAt?new Date(x.saleStartsAt):null,saleEnds=x.saleEndsAt?new Date(x.saleEndsAt):null; if(saleStarts&&Number.isNaN(saleStarts.getTime())) throw safeError('Tanggal mulai flash sale varian tidak valid.'); if(saleEnds&&Number.isNaN(saleEnds.getTime())) throw safeError('Tanggal akhir flash sale varian tidak valid.'); if(saleStarts&&saleEnds&&saleEnds<=saleStarts) throw safeError('Tanggal akhir flash sale varian harus setelah tanggal mulai.'); if(salePrice>0&&salePrice>=price) throw safeError('Harga flash sale varian harus lebih kecil dari harga normal.');
      if(name.length<1||!Number.isInteger(price)||price<1000||!Number.isInteger(stock)||stock<-1) throw safeError('Data varian belum valid.');
      if(compareAtPrice>0&&compareAtPrice<price) throw safeError('Harga coret harus lebih besar atau sama dengan harga jual.');
      await q(`INSERT INTO product_variants(id,product_id,name,subtitle,price,compare_at_price,stock,active,badge,sort_order,cost_price,warranty_days,sale_price,sale_starts_at,sale_ends_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
        ON CONFLICT(id) DO UPDATE SET product_id=EXCLUDED.product_id,name=EXCLUDED.name,subtitle=EXCLUDED.subtitle,price=EXCLUDED.price,compare_at_price=EXCLUDED.compare_at_price,stock=EXCLUDED.stock,active=EXCLUDED.active,badge=EXCLUDED.badge,sort_order=EXCLUDED.sort_order,cost_price=EXCLUDED.cost_price,warranty_days=EXCLUDED.warranty_days,sale_price=EXCLUDED.sale_price,sale_starts_at=EXCLUDED.sale_starts_at,sale_ends_at=EXCLUDED.sale_ends_at,updated_at=NOW()`,
        [variantId,productId,name,subtitle,price,compareAtPrice,stock,bool(x.active),badge,sortOrder,costPrice,warrantyDaysValue,salePrice,saleStarts?saleStarts.toISOString():null,saleEnds?saleEnds.toISOString():null]);
      await audit(a.email,'product_variant_saved',variantId,{productId,name,price,stock}); data={id:variantId};
    }
    else if(action==='deleteProductVariant'){
      const a=await requireAdmin(req); const variantId=text(p.variantId,100); const v=(await q('SELECT * FROM product_variants WHERE id=$1 LIMIT 1',[variantId])).rows[0]; if(!v) throw safeError('Varian tidak ditemukan.');
      const used=(await q('SELECT COUNT(*)::int AS n FROM orders WHERE variant_id=$1',[variantId])).rows[0]?.n||0;
      const inventory=(await q('SELECT COUNT(*)::int AS n FROM inventory WHERE variant_id=$1',[variantId])).rows[0]?.n||0;
      if(Number(used)>0||Number(inventory)>0) await q('UPDATE product_variants SET active=FALSE,updated_at=NOW() WHERE id=$1',[variantId]); else await q('DELETE FROM product_variants WHERE id=$1',[variantId]);
      await audit(a.email,'product_variant_removed',variantId,{productId:v.product_id,softDelete:Number(used)>0||Number(inventory)>0}); data=true;
    }
    else if(action==='adjustVariantStock'){
      const a=await requireAdmin(req); const variantId=text(p.variantId,100),operation=String(p.operation||'add'),amount=Number(p.amount);
      if(!['add','set','subtract'].includes(operation)) throw safeError('Operasi stok tidak valid.'); if(!Number.isInteger(amount)) throw safeError('Jumlah stok harus berupa angka bulat.'); if(operation!=='set'&&amount<1) throw safeError('Jumlah perubahan stok minimal 1.'); if(operation==='set'&&amount<-1) throw safeError('Stok minimal -1.');
      const client=await pool.connect(); let updated;
      try{await client.query('BEGIN');const {rows}=await client.query(`SELECT v.*,p.fulfillment_mode,p.name AS product_name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 FOR UPDATE`,[variantId]);const v=rows[0];if(!v)throw safeError('Varian tidak ditemukan.');if(v.fulfillment_mode==='inventory')throw safeError('Produk ini memakai Inventory Otomatis. Tambahkan stok varian dari menu Inventory.');const current=Number(v.stock);let next=current;if(operation==='set')next=amount;else{if(current===-1){if(operation==='subtract')throw safeError('Stok Tanpa Batas tidak dapat dikurangi. Gunakan Set stok.');next=amount;}else next=operation==='add'?current+amount:current-amount;if(next<0)throw safeError('Stok tidak boleh kurang dari 0.');}updated=(await client.query('UPDATE product_variants SET stock=$2,updated_at=NOW() WHERE id=$1 RETURNING *',[variantId,next])).rows[0];await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}
      await audit(a.email,'variant_stock_adjusted',variantId,{operation,amount,newStock:Number(updated.stock)}); data={id:variantId,stock:Number(updated.stock)};
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
        storeOpen:String(bool(x.storeOpen)),manualPaymentEnabled:String(bool(x.manualPaymentEnabled)),midtransPaymentEnabled:String(bool(x.midtransPaymentEnabled)),belibayarPaymentEnabled:String(bool(x.belibayarPaymentEnabled)),duitkuPaymentEnabled:String(bool(x.duitkuPaymentEnabled)),
        balancePaymentEnabled:String(bool(x.balancePaymentEnabled)),autoRoleEnabled:String(bool(x.autoRoleEnabled)),qrisName:text(x.qrisName,80)||'QRIS Manual'
      };
      const upload=x.qrisUpload&&typeof x.qrisUpload==='object'?x.qrisUpload:null;
      if(upload){const mime=text(upload.mime,80),base64=String(upload.base64||'');if(!['image/jpeg','image/png','image/webp'].includes(mime)) throw safeError('QRIS harus JPG, PNG, atau WebP.');if(base64.length>1800000) throw safeError('Ukuran QRIS maksimal sekitar 1,3 MB.');if(!/^[A-Za-z0-9+/=]+$/.test(base64)) throw safeError('Data QRIS tidak valid.');vals.qrisImageMime=mime;vals.qrisImageData=base64;}
      if(bool(x.clearQris)){vals.qrisImageMime='';vals.qrisImageData='';}
      for(const [k,v] of Object.entries(vals)) await q(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[k,v]);
      await audit(a.email,'settings_saved','',{payment:{manual:bool(x.manualPaymentEnabled),midtrans:bool(x.midtransPaymentEnabled),belibayar:bool(x.belibayarPaymentEnabled),duitku:bool(x.duitkuPaymentEnabled),balance:bool(x.balancePaymentEnabled)},qrisUpload:!!upload}); data=true;
    }
    else if(action==='inventoryAdd'){
      const a=await requireAdmin(req);
      const productId=text(p.productId,100),variantId=text(p.variantId,100), itemValue=text(p.itemValue,5000), note=text(p.note,300);
      const status=['available','disabled'].includes(String(p.status))?String(p.status):'available';
      if(!itemValue) throw safeError('Isi kode, link, atau detail inventory.');
      const exists=await q('SELECT id,fulfillment_mode FROM products WHERE id=$1',[productId]); if(!exists.rowCount) throw safeError('Produk tidak ditemukan.');
      if(exists.rows[0].fulfillment_mode!=='inventory') throw safeError('Produk ini memakai stok manual. Gunakan tombol Tambah Stok pada menu Produk.');
      const hasVariants=(await q('SELECT COUNT(*)::int AS n FROM product_variants WHERE product_id=$1 AND active=TRUE',[productId])).rows[0]?.n||0;
      if(Number(hasVariants)>0){const vr=await q('SELECT id FROM product_variants WHERE id=$1 AND product_id=$2 AND active=TRUE',[variantId,productId]);if(!vr.rowCount)throw safeError('Pilih varian inventory yang aktif.');}
      const inventoryId=id('inv');
      await q('INSERT INTO inventory(id,product_id,variant_id,item_value,note,status) VALUES($1,$2,$3,$4,$5,$6)',[inventoryId,productId,Number(hasVariants)>0?variantId:'',itemValue,note,status]);
      await audit(a.email,'inventory_added',productId,{inventoryId,variantId:Number(hasVariants)>0?variantId:'',status}); data={id:inventoryId};
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
      const a=await requireAdmin(req); const productId=text(p.productId,100),variantId=text(p.variantId,100); const items=Array.isArray(p.items)?p.items.map(v=>text(v,5000)).filter(Boolean).slice(0,1000):[]; if(!items.length) throw safeError('Masukkan minimal satu item inventory.');
      const exists=await q('SELECT id,fulfillment_mode FROM products WHERE id=$1',[productId]); if(!exists.rowCount) throw safeError('Produk tidak ditemukan.');
      if(exists.rows[0].fulfillment_mode!=='inventory') throw safeError('Produk ini memakai stok manual. Gunakan tombol Tambah Stok pada menu Produk.');
      const hasVariants=(await q('SELECT COUNT(*)::int AS n FROM product_variants WHERE product_id=$1 AND active=TRUE',[productId])).rows[0]?.n||0;
      if(Number(hasVariants)>0){const vr=await q('SELECT id FROM product_variants WHERE id=$1 AND product_id=$2 AND active=TRUE',[variantId,productId]);if(!vr.rowCount)throw safeError('Pilih varian inventory yang aktif.');}
      let added=0; for(const value of items){await q("INSERT INTO inventory(id,product_id,variant_id,item_value,note,status) VALUES($1,$2,$3,$4,'','available')",[id('inv'),productId,Number(hasVariants)>0?variantId:'',value]);added++;} await audit(a.email,'inventory_imported',productId,{variantId:Number(hasVariants)>0?variantId:'',count:added}); data={added};
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
      if(status==='cancelled' && old.stock_reserved){if(old.variant_id)await q('UPDATE product_variants SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[old.variant_id,old.quantity]);else await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[old.product_id,old.quantity]);}
      await q(`UPDATE orders SET status=$2,delivery=$3,note=$4,
        payment_submitted_at=CASE WHEN $2 IN ('processing','completed') AND payment_submitted_at IS NULL THEN NOW() ELSE payment_submitted_at END,
        payment_verified_at=CASE WHEN $2 IN ('processing','completed') AND payment_verified_at IS NULL THEN NOW() ELSE payment_verified_at END,
        processing_at=CASE WHEN $2='processing' AND processing_at IS NULL THEN NOW() WHEN $2='completed' AND processing_at IS NULL THEN NOW() ELSE processing_at END,
        completed_at=CASE WHEN $2='completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
        warranty_until=CASE WHEN $2='completed' AND warranty_days>0 THEN COALESCE(completed_at,NOW()) + (warranty_days || ' days')::interval ELSE warranty_until END,
        credentials_enc=CASE WHEN $2 IN ('completed','cancelled') THEN '' ELSE credentials_enc END,
        credentials_status=CASE WHEN $2 IN ('completed','cancelled') AND credentials_status<>'' THEN 'purged' ELSE credentials_status END,
        stock_reserved=CASE WHEN $2 IN ('processing','completed','cancelled') THEN FALSE ELSE stock_reserved END,updated_at=NOW() WHERE id=$1`,[orderId,status,delivery,note]); await audit(a.email,'order_status_updated',orderId,{from:old.status,to:status});
      if(status==='processing') await autoFulfillOrder(orderId,'admin');
      if(status==='cancelled') await refundOrderCredits(orderId,a.email,'Pesanan dibatalkan admin.');
      if(status==='processing') await notifyUser(old.user_id,'order','Pesanan sedang diproses',`${old.product_name} sedang diproses admin.`,orderId);
      if(status==='cancelled') await notifyUser(old.user_id,'order','Pesanan dibatalkan',`${old.product_name} dibatalkan.`,orderId);
      if(status==='completed'){await syncMembership(old.user_id,a.email);await notifyAdmin('success','Pesanan selesai',`${old.product_name} · ${old.name}`,orderId);await notifyUser(old.user_id,'success','Pesanan selesai',`${old.product_name} sudah selesai.${Number(old.warranty_days||0)>0?` Garansi aktif ${Number(old.warranty_days)} hari.`:''}`,orderId);await sendEmail(old.email,`Pesanan ${orderId} selesai`,`<h2>Pesanan selesai</h2><p>${escapeHtml(old.product_name)}</p><pre style="white-space:pre-wrap">${escapeHtml(delivery)}</pre>`);} 
      data=publicOrder((await q('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0],true);
    }

    else if(action==='updateWarrantyClaim'){
      const a=await requireAdmin(req); const claimId=text(p.claimId,100), status=text(p.status,30), adminNote=text(p.adminNote,1200);
      if(!['submitted','review','processing','approved','rejected','resolved'].includes(status)) throw safeError('Status klaim tidak valid.');
      const {rows}=await q(`SELECT c.*,u.email,o.product_name FROM warranty_claims c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN orders o ON o.id=c.order_id WHERE c.id=$1 LIMIT 1`,[claimId]); const c=rows[0]; if(!c) throw safeError('Klaim tidak ditemukan.');
      await q(`UPDATE warranty_claims SET status=$2,admin_note=$3,resolved_at=CASE WHEN $2 IN ('rejected','resolved') THEN COALESCE(resolved_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$1`,[claimId,status,adminNote]);
      await audit(a.email,'warranty_claim_updated',claimId,{from:c.status,to:status}); await notifyUser(c.user_id,'warranty','Status klaim diperbarui',`Klaim ${claimId} untuk ${c.product_name||'produk'}: ${status}.`,claimId); if(c.email) await sendEmail(c.email,`Update klaim ${claimId}`,`<h2>Status klaim garansi</h2><p>${escapeHtml(c.product_name||'Produk')}</p><p>Status: <strong>${escapeHtml(status)}</strong></p><p>${escapeHtml(adminNote)}</p>`); data=true;
    }
    else if(action==='getWarrantyScreenshot'){
      const a=await requireAdmin(req); const claimId=text(p.claimId,100); const {rows}=await q('SELECT screenshot_name,screenshot_mime,screenshot_data FROM warranty_claims WHERE id=$1 LIMIT 1',[claimId]); const c=rows[0]; if(!c||!c.screenshot_data) throw safeError('Screenshot klaim tidak tersedia.'); await audit(a.email,'warranty_screenshot_viewed',claimId,{}); data={name:c.screenshot_name,mime:c.screenshot_mime,base64:c.screenshot_data};
    }
    else if(action==='adminSyncPayment'){
      const a=await requireAdmin(req); const orderId=text(p.orderId,80); const {rows}=await q('SELECT * FROM orders WHERE id=$1 LIMIT 1',[orderId]); const o=rows[0]; if(!o) throw safeError('Pesanan tidak ditemukan.'); if(!isAutomaticGateway(o.payment_mode)||!o.gateway_order_id) throw safeError('Order ini tidak memiliki transaksi gateway otomatis aktif.');
      const statusBody=await getGatewayStatus(o.payment_mode,o.gateway_order_id); const result=await applyGatewayStatus(o.payment_mode,statusBody,`admin-${o.payment_mode}-sync`); const n=normalizedStatus(o.payment_mode,statusBody); await q(`UPDATE orders SET gateway_payload=$2::jsonb,gateway_status=$3,gateway_transaction_id=CASE WHEN $4<>'' THEN $4 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $6<>'' THEN $6 ELSE gateway_payment_channel END,updated_at=NOW() WHERE id=$1`,[orderId,JSON.stringify(statusBody),n.status,n.transactionId,n.method,n.channel]); await audit(a.email,'admin_payment_synced',orderId,{provider:o.payment_mode,gatewayOrderId:o.gateway_order_id,state:result.state}); data={state:result.state,order:publicOrder((await q('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0],true)};
    }
    else if(action==='validateVoucher'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const {rows}=await q('SELECT * FROM products WHERE id=$1 AND active=TRUE LIMIT 1',[text(p.productId,100)]); const prod=rows[0]; if(!prod) throw safeError('Produk tidak ditemukan.');
      const qty=Math.max(1,Math.min(5,Number(p.quantity)||1)); const variant=await resolveVariant({db:{query:(t,pa)=>q(t,pa)},product:prod,variantId:p.variantId,qty}); const priced={...prod,price:saleInfo(variant||prod).price}; const quote=await voucherQuote({code:p.code,userId:u.id,product:priced,qty});
      data={...quote,variantId:variant?.id||'',subtotal:Number(priced.price)*qty,total:Math.max(0,Number(priced.price)*qty-quote.discount)};
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
