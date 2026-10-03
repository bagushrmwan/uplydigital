import { ensureSchema, q, pool, getSettings, audit } from '../lib/db.js';
import { id, normalizeEmail, validEmail, hashPassword, verifyPassword, safeEqual, createSession, requireAuth, requireAdmin, destroySession, securityReady, credentialSecurityReady, encryptCredentialPayload, decryptCredentialPayload } from '../lib/security.js';
import { createSnap, getTransactionStatus, midtransEnabled, paymentMode as configuredPaymentMode } from '../lib/midtrans.js';
import { applyMidtransStatus, autoFulfillOrder } from '../lib/payment-state.js';
import { sendEmail } from '../lib/email.js';

function safeError(message,status=400){ const e=new Error(message); e.safe=true; e.status=status; return e; }
function text(v,max=500){ return String(v??'').trim().slice(0,max); }
function bool(v){ return v===true || String(v).toLowerCase()==='true'; }
function phone(v,required=false){
  let p=text(v,24).replace(/[\s()+-]/g,''); if(p.startsWith('0')) p='62'+p.slice(1);
  if(!p&&!required) return ''; if(!/^[1-9]\d{8,14}$/.test(p)) throw safeError('Nomor WhatsApp tidak valid.'); return p;
}
function publicProduct(r,availableInventory){
  return {id:r.id,name:r.name,category:r.category,duration:r.duration,price:Number(r.price),description:r.description,benefits:Array.isArray(r.benefits)?r.benefits:[],terms:r.terms,stock:r.fulfillment_mode==='inventory'?availableInventory:Number(r.stock),active:r.active,badge:r.badge,icon:r.icon,fulfillmentMode:r.fulfillment_mode,thumbnail:r.thumbnail_url||'',featured:!!r.featured,requiresLoginCredentials:!!r.requires_login_credentials,soldCount:Number(r.sold_count||0),bestSeller:!!r.best_seller};
}
function publicOrder(o,admin=false){
  return {id:o.id,userId:admin?o.user_id:undefined,email:o.email,name:o.name,phone:o.phone,channel:o.channel,productId:o.product_id,productName:o.product_name,productThumbnail:o.product_thumbnail||'',duration:o.duration,quantity:Number(o.quantity),price:Number(o.price),total:Number(o.total),status:o.status,paymentMode:o.payment_mode,gatewayStatus:o.gateway_status,paymentUrl:o.payment_url,createdAt:o.created_at,expiresAt:o.expires_at,updatedAt:o.updated_at,paymentSubmittedAt:o.payment_submitted_at,paymentVerifiedAt:o.payment_verified_at,processingAt:o.processing_at,completedAt:o.completed_at,hasProof:!!o.proof_name,proofName:o.proof_name,delivery:o.delivery,note:o.note,hasCredentials:admin?!!o.credentials_enc:undefined,credentialsStatus:admin?(o.credentials_status||''):undefined,credentialsViewedAt:admin?o.credentials_viewed_at:undefined,bank:o.bank_id?{id:o.bank_id,name:o.bank_name,number:o.bank_number,holder:o.bank_holder}:null};
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
    const {rows:reserved}=await client.query(`SELECT product_id,quantity FROM orders WHERE status='pending_payment' AND expires_at<NOW() AND payment_mode='manual' AND stock_reserved=TRUE FOR UPDATE`);
    const restore=new Map();
    for(const r of reserved) restore.set(r.product_id,(restore.get(r.product_id)||0)+Number(r.quantity));
    await client.query(`UPDATE orders SET status='cancelled',note=CASE WHEN note='' THEN 'Pesanan otomatis kedaluwarsa.' ELSE note END,credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW(),stock_reserved=FALSE WHERE status='pending_payment' AND expires_at<NOW() AND payment_mode='manual'`);
    for(const [pid,qty] of restore) await client.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[pid,qty]);
    await client.query('DELETE FROM sessions WHERE expires_at<NOW()');
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
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
  const paymentMode=configuredPaymentMode()==='midtrans'?'midtrans':'manual';
  return {products,banks:br.rows,settings:{storeName:s.storeName||'Uply Digital',whatsapp:s.whatsapp||'',hours:s.hours||'',storeOpen:bool(s.storeOpen),paymentHours:Number(s.paymentHours)||24,notice:s.notice||'',promoBanner:s.promoBanner||'',paymentMode,paymentReady:paymentMode==='manual'||midtransEnabled()}};
}
async function getUserById(userId){ const {rows}=await q('SELECT id,email,name,phone,created_at FROM users WHERE id=$1 LIMIT 1',[userId]); return rows[0]; }
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function createMidtransForOrder(order,{forceNew=false}={}){
  if(!midtransEnabled()) throw safeError('Pembayaran otomatis belum siap. Periksa PAYMENT_MODE dan MIDTRANS_SERVER_KEY.',500);
  if(order.payment_url && !forceNew) return order.payment_url;
  const currentAttempt=Math.max(0,Number(order.gateway_attempt)||0);
  const attempt=currentAttempt+1;
  const gatewayOrderId=`${order.id}-P${attempt}`.slice(0,50);
  await q(`UPDATE orders SET payment_url='',gateway_status='creating',gateway_order_id=$2,gateway_attempt=$3,updated_at=NOW() WHERE id=$1`,[order.id,gatewayOrderId,attempt]);
  const snap=await createSnap({...order,id:gatewayOrderId,callback_order_id:order.id});
  await q(`UPDATE orders SET payment_url=$2,gateway_status='created',updated_at=NOW() WHERE id=$1`,[order.id,snap.redirect_url]);
  return snap.redirect_url;
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
      const token=await createSession({userId,role:'user',hours:24}); await audit(email,'user_registered',userId,{}); data={token,user:{id:userId,email,name,phone:'',role:'user'}};
    }
    else if(action==='login'){
      const email=normalizeEmail(p.email), password=String(p.password||'');
      const {rows}=await q('SELECT * FROM users WHERE email=$1 LIMIT 1',[email]); const u=rows[0];
      if(!u||!verifyPassword(password,u.password_salt,u.password_hash)) throw safeError('Email atau password salah.',401);
      const token=await createSession({userId:u.id,role:'user',hours:24}); await audit(email,'user_login',u.id,{}); data={token,user:{id:u.id,email:u.email,name:u.name,phone:u.phone,role:'user'}};
    }
    else if(action==='adminLogin'){
      const email=normalizeEmail(p.email), password=String(p.password||''); const ce=normalizeEmail(process.env.ADMIN_EMAIL); const cp=String(process.env.ADMIN_PASSWORD||'');
      if(!validEmail(ce)||cp.length<8) throw safeError('ADMIN_EMAIL atau ADMIN_PASSWORD belum diatur di Vercel.',500);
      if(!safeEqual(email,ce)||!safeEqual(password,cp)) throw safeError('Email atau password admin salah.',401);
      const token=await createSession({role:'admin',hours:8}); await audit(ce,'admin_login','',{}); data={token,user:{id:null,email:ce,name:'Admin Uply',phone:'',role:'admin'}};
    }
    else if(action==='me'){
      const u=await requireAuth(req); data={id:u.id,email:u.email,name:u.name,phone:u.phone,role:u.role};
    }
    else if(action==='logout') { await destroySession(req); data=true; }
    else if(action==='orders'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const {rows}=await q('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',[u.id]); data=rows.map(x=>publicOrder(x));
    }
    else if(action==='createOrder'){
      const u=await requireAuth(req); if(u.role!=='user') throw safeError('Gunakan akun pelanggan.',403);
      const settings=await getSettings(); if(!bool(settings.storeOpen)) throw safeError('Toko sedang menutup pesanan baru.');
      if(p.agree!==true) throw safeError('Setujui ketentuan produk sebelum membuat pesanan.');
      const requestId=text(p.requestId,80); if(!/^[a-zA-Z0-9._-]{12,80}$/.test(requestId)) throw safeError('Muat ulang halaman lalu coba lagi.');
      const existing=await q('SELECT * FROM orders WHERE request_id=$1 AND user_id=$2 LIMIT 1',[requestId,u.id]);
      if(existing.rowCount){data={order:publicOrder(existing.rows[0]),paymentUrl:existing.rows[0].payment_url||'',duplicate:true};}
      else {
        const qty=Number(p.quantity); if(!Number.isInteger(qty)||qty<1||qty>5) throw safeError('Jumlah produk harus 1–5.');
        const client=await pool.connect(); let order=null,prod=null,mode='manual';
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

          const configuredMode=configuredPaymentMode()==='midtrans'?'midtrans':'manual';
          if(configuredMode==='midtrans'&&!midtransEnabled()) throw safeError('Pembayaran otomatis dipilih tetapi MIDTRANS_SERVER_KEY belum valid. Periksa Environment Variables lalu Redeploy.',500);
          mode=configuredMode; let bank={id:'',name:'',number:'',holder:''};
          if(mode==='manual'){
            const {rows:bs}=await client.query('SELECT * FROM banks WHERE id=$1 AND active=TRUE LIMIT 1',[text(p.bankId,100)]); if(!bs[0]) throw safeError('Rekening pembayaran tidak tersedia. Minta admin mengaktifkan minimal satu rekening.'); bank=bs[0];
          }
          const orderId=`UPL-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,10).toUpperCase()}`;
          const total=Number(prod.price)*qty, hours=Math.max(1,Math.min(72,Number(settings.paymentHours)||24)), customerNote=text(p.customerNote,800);
          const finiteManualStock=Number(prod.stock)!==-1 && prod.fulfillment_mode!=='inventory';
          if(finiteManualStock){
            const reserved=await client.query('UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1 AND stock>=$2 RETURNING stock',[prod.id,qty]);
            if(!reserved.rowCount) throw safeError('Stok berubah saat checkout dan sekarang tidak mencukupi. Silakan coba lagi.');
          }
          const {rows:ors}=await client.query(`INSERT INTO orders(id,user_id,email,name,phone,channel,product_id,product_name,product_thumbnail,duration,quantity,price,total,bank_id,bank_name,bank_number,bank_holder,note,status,payment_mode,expires_at,request_id,stock_reserved,credentials_enc,credentials_status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending_payment',$19,NOW()+($20 || ' hours')::interval,$21,$22,$23,$24) RETURNING *`,[orderId,u.id,u.email,name,ph,channel,prod.id,prod.name,prod.thumbnail_url||'',prod.duration,qty,Number(prod.price),total,bank.id||'',bank.name||'',bank.number||'',bank.holder||'',customerNote,mode,String(hours),requestId,finiteManualStock,credentialsEnc,credentialsEnc?'encrypted':'']);
          order=ors[0]; await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

        let paymentUrl='',paymentError='';
        if(mode==='midtrans'){
          try{paymentUrl=await createMidtransForOrder(order); order=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];}
          catch(e){
            paymentError=e?.safe?e.message:'Midtrans belum dapat membuat transaksi.';
            await q(`UPDATE orders SET gateway_status='error',note=CASE WHEN note='' THEN $2 ELSE note || E'\n' || $2 END,updated_at=NOW() WHERE id=$1`,[order.id,`Payment gateway: ${paymentError}`]);
          }
        }
        await audit(u.email,'order_created',order.id,{productId:prod.id,total:Number(order.total),mode});
        await sendEmail(u.email,`Pesanan ${order.id} dibuat`,`<h2>Pesanan Uply Digital dibuat</h2><p>${escapeHtml(prod.name)} · ${escapeHtml(prod.duration)}</p><p>Total: <strong>Rp${Number(order.total).toLocaleString('id-ID')}</strong></p><p>Status: menunggu pembayaran.</p>`);
        data={order:publicOrder(order),paymentUrl:paymentUrl||order.payment_url||'',paymentError,duplicate:false};
      }
    }
    else if(action==='retryPayment'){
      const u=await requireAuth(req); const orderId=text(p.orderId,80); const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0];
      if(!o||o.payment_mode!=='midtrans'||o.status!=='pending_payment') throw safeError('Pembayaran tidak dapat dibuat ulang.');
      if(o.payment_url){data={paymentUrl:o.payment_url,reused:true};}
      else {const url=await createMidtransForOrder(o,{forceNew:true});data={paymentUrl:url,reused:false};}
    }
    else if(action==='syncPaymentStatus'){
      const u=await requireAuth(req); const orderId=text(p.orderId,80); const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0];
      if(!o||o.payment_mode!=='midtrans') throw safeError('Pesanan Midtrans tidak ditemukan.');
      if(o.status==='completed') {data={order:publicOrder(o),state:'success'};}
      else {
        const gatewayOrderId=o.gateway_order_id||o.id;
        let statusBody;
        try{statusBody=await getTransactionStatus(gatewayOrderId);}catch(e){throw e?.safe?e:safeError('Status pembayaran belum dapat diperiksa. Coba lagi sebentar lagi.',502);}
        const result=await applyMidtransStatus(statusBody,'midtrans-sync');
        const fresh=(await q('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0];
        data={order:publicOrder(fresh),state:result.state};
      }
    }
    else if(action==='uploadProof'){
      const u=await requireAuth(req); const orderId=text(p.orderId,80); const mime=text(p.mime,60); const name=text(p.fileName,160); const base64=String(p.base64||'');
      if(!['image/jpeg','image/png','application/pdf'].includes(mime)) throw safeError('Bukti harus JPG, PNG, atau PDF.'); if(base64.length>1500000) throw safeError('Ukuran bukti maksimal sekitar 1 MB.');
      const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0]; if(!o||o.payment_mode!=='manual'||!['pending_payment','review'].includes(o.status)) throw safeError('Pesanan tidak dapat menerima bukti pembayaran.');
      await q(`UPDATE orders SET proof_name=$2,proof_mime=$3,proof_data=$4,status='review',payment_submitted_at=COALESCE(payment_submitted_at,NOW()),updated_at=NOW() WHERE id=$1`,[orderId,name,mime,base64]); await audit(u.email,'proof_uploaded',orderId,{}); data=true;
    }
    else if(action==='cancelOrder'){
      const u=await requireAuth(req); const orderId=text(p.orderId,80); const {rows}=await q('SELECT * FROM orders WHERE id=$1 AND user_id=$2 LIMIT 1',[orderId,u.id]); const o=rows[0]; if(!o||o.status!=='pending_payment') throw safeError('Pesanan ini tidak dapat dibatalkan sendiri.');
      await q(`UPDATE orders SET status='cancelled',note='Dibatalkan pelanggan sebelum pembayaran terverifikasi.',credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW() WHERE id=$1`,[orderId]);
      if(o.stock_reserved){await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[o.product_id,o.quantity]);await q('UPDATE orders SET stock_reserved=FALSE WHERE id=$1',[orderId]);}
      await audit(u.email,'order_cancelled',orderId,{}); data=true;
    }
    else if(action==='adminData'){
      const a=await requireAdmin(req);
      const [orders,products,banks,customers,inv,invItems,aud,s]=await Promise.all([
        q('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500'),q('SELECT * FROM products ORDER BY created_at,id'),q('SELECT * FROM banks ORDER BY created_at,id'),
        q(`SELECT u.id,u.email,u.name,u.phone,u.created_at,COUNT(o.id)::int AS orders_count,COALESCE(SUM(CASE WHEN o.status IN ('processing','completed') THEN o.total ELSE 0 END),0)::bigint AS spent FROM users u LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`),
        q(`SELECT product_id,status,COUNT(*)::int AS count FROM inventory GROUP BY product_id,status`),
        q(`SELECT i.id,i.product_id,p.name AS product_name,i.item_value,i.note,i.status,i.order_id,i.created_at,i.updated_at FROM inventory i LEFT JOIN products p ON p.id=i.product_id ORDER BY i.created_at DESC LIMIT 500`),
        q('SELECT id,timestamp,actor,action,record_id,detail FROM audit ORDER BY timestamp DESC LIMIT 200'),getSettings()
      ]);
      const invMap={}; for(const r of inv.rows){invMap[r.product_id]??={available:0,delivered:0,disabled:0};invMap[r.product_id][r.status]=Number(r.count);}
      data={orders:orders.rows.map(x=>publicOrder(x,true)),products:products.rows.map(p=>publicProduct(p,invMap[p.id]?.available||0)),banks:banks.rows,customers:customers.rows.map(c=>({...c,ordersCount:Number(c.orders_count),spent:Number(c.spent)})),inventory:invMap,inventoryItems:invItems.rows.map(i=>({id:i.id,productId:i.product_id,productName:i.product_name||i.product_id,itemValue:i.item_value,note:i.note||'',status:i.status,orderId:i.order_id||'',createdAt:i.created_at,updatedAt:i.updated_at})),audit:aud.rows,settings:{...s,storeOpen:bool(s.storeOpen),paymentHours:Number(s.paymentHours)||24,paymentMode:configuredPaymentMode()==='midtrans'?'midtrans':'manual',paymentReady:configuredPaymentMode()!=='midtrans'||midtransEnabled()},admin:{email:a.email}};
    }
    else if(action==='saveProduct'){
      const a=await requireAdmin(req); const x=p.product||{}; let pid=text(x.id,100); if(!pid) pid=id('prd');
      const name=text(x.name,80),category=text(x.category,60)||'Digital',duration=text(x.duration,80),price=Number(x.price),stock=Number(x.stock); const isTopUp=category.toLowerCase().replace(/\s+/g,'')==='topup'; const mode=isTopUp?'manual':(x.fulfillmentMode==='inventory'?'inventory':'manual'); const requiresLogin=isTopUp||bool(x.requiresLoginCredentials); let thumbnail=text(x.thumbnail,500); if(thumbnail && !thumbnail.startsWith('/assets/') && !/^https:\/\//i.test(thumbnail)) throw safeError('Thumbnail harus berupa path /assets/... atau URL HTTPS.'); const featured=bool(x.featured);
      if(name.length<2||!Number.isInteger(price)||price<1000||!Number.isInteger(stock)||stock<-1) throw safeError('Data produk belum valid.');
      const benefits=Array.isArray(x.benefits)?x.benefits.map(v=>text(v,150)).filter(Boolean).slice(0,20):[];
      await q(`INSERT INTO products(id,name,category,duration,price,description,benefits,terms,stock,active,badge,icon,fulfillment_mode,thumbnail_url,featured,requires_login_credentials,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,duration=EXCLUDED.duration,price=EXCLUDED.price,description=EXCLUDED.description,benefits=EXCLUDED.benefits,terms=EXCLUDED.terms,stock=EXCLUDED.stock,active=EXCLUDED.active,badge=EXCLUDED.badge,icon=EXCLUDED.icon,fulfillment_mode=EXCLUDED.fulfillment_mode,thumbnail_url=EXCLUDED.thumbnail_url,featured=EXCLUDED.featured,requires_login_credentials=EXCLUDED.requires_login_credentials,updated_at=NOW()`,[pid,name,category,duration,price,text(x.description,300),JSON.stringify(benefits),text(x.terms,2000),stock,bool(x.active),text(x.badge,40),text(x.icon,30)||'generic',mode,thumbnail,featured,requiresLogin]);
      await audit(a.email,'product_saved',pid,{name,mode,featured,requiresLogin}); data={id:pid};
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
          if(current===-1) throw safeError('Stok produk saat ini Tanpa Batas. Pilih Set Stok untuk mengubahnya menjadi jumlah tertentu.');
          next=operation==='add'?current+amount:current-amount;
          if(next<0) throw safeError('Stok tidak boleh kurang dari 0.');
        }
        const r=await client.query('UPDATE products SET stock=$2,updated_at=NOW() WHERE id=$1 RETURNING id,name,stock',[productId,next]); updated=r.rows[0];
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
      await audit(a.email,'product_stock_adjusted',productId,{operation,amount,newStock:Number(updated.stock)}); data={id:updated.id,name:updated.name,stock:Number(updated.stock)};
    }
    else if(action==='saveBank'){
      const a=await requireAdmin(req); const x=p.bank||{}; const bid=text(x.id,100)||id('bank'); const name=text(x.name,70),number=text(x.number,30).replace(/\D/g,''),holder=text(x.holder,90); if(!name||number.length<6||!holder) throw safeError('Data rekening belum lengkap.');
      await q(`INSERT INTO banks(id,name,number,holder,active,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,number=EXCLUDED.number,holder=EXCLUDED.holder,active=EXCLUDED.active,updated_at=NOW()`,[bid,name,number,holder,bool(x.active)]); await audit(a.email,'bank_saved',bid,{name}); data=true;
    }
    else if(action==='saveSettings'){
      const a=await requireAdmin(req); const x=p.settings||{}; const vals={storeName:text(x.storeName,60)||'Uply Digital',whatsapp:phone(x.whatsapp,false),hours:text(x.hours,120),paymentHours:String(Math.max(1,Math.min(72,Number(x.paymentHours)||24))),notice:text(x.notice,250),promoBanner:text(x.promoBanner,180),storeOpen:String(bool(x.storeOpen))};
      for(const [k,v] of Object.entries(vals)) await q(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[k,v]); await audit(a.email,'settings_saved','',{}); data=true;
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
      if(status==='completed') await sendEmail(old.email,`Pesanan ${orderId} selesai`,`<h2>Pesanan selesai</h2><p>${escapeHtml(old.product_name)}</p><pre style="white-space:pre-wrap">${escapeHtml(delivery)}</pre>`);
      data=publicOrder((await q('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0],true);
    }
    else if(action==='getProof'){
      await requireAdmin(req); const {rows}=await q('SELECT proof_name,proof_mime,proof_data FROM orders WHERE id=$1',[text(p.orderId,80)]); const o=rows[0]; if(!o||!o.proof_data) throw safeError('Bukti pembayaran tidak tersedia.'); data={name:o.proof_name,mime:o.proof_mime,base64:o.proof_data};
    }
    else throw safeError('Aksi tidak dikenal.',404);

    return send(res,200,{ok:true,data},headers);
  }catch(e){
    console.error('UPLY API',e); return send(res,e.status||500,{ok:false,error:e.safe?e.message:'Server sedang bermasalah. Periksa konfigurasi Vercel dan database.'},headers);
  }
}
