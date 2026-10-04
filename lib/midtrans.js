import crypto from 'crypto';

function clean(v){ return String(v ?? '').trim(); }
function bool(v){ return v===true || ['1','true','yes','on'].includes(clean(v).toLowerCase()); }
function safeInt(v,fallback=0){ const n=Number(v); return Number.isFinite(n)?Math.round(n):fallback; }
function err(message,status=502,code='MIDTRANS_ERROR'){
  const e=new Error(message); e.safe=true; e.status=status; e.code=code; return e;
}

export function paymentMode(){ return clean(process.env.PAYMENT_MODE).toLowerCase()==='midtrans'?'midtrans':'manual'; }
export function serverKey(){ return clean(process.env.MIDTRANS_SERVER_KEY); }
export function clientKey(){ return clean(process.env.MIDTRANS_CLIENT_KEY); }
export function isProduction(){ return bool(process.env.MIDTRANS_IS_PRODUCTION); }
export function keyEnvironment(){ const k=serverKey(); if(/^SB-Mid-server-/i.test(k)) return 'sandbox'; if(/^Mid-server-/i.test(k)) return 'production'; return k?'unknown':'missing'; }
export function credentialsReady(){ const ke=keyEnvironment(); const mismatch=(isProduction()&&ke==='sandbox')||(!isProduction()&&ke==='production'); return serverKey().length>=10 && !mismatch; }
export function midtransEnabled(){ return paymentMode()==='midtrans' && credentialsReady() && /^https:\/\//i.test(clean(process.env.SITE_URL)); }
export function environmentName(){ return isProduction()?'production':'sandbox'; }
export function snapBase(){ return isProduction()?'https://app.midtrans.com':'https://app.sandbox.midtrans.com'; }
export function apiBase(){ return isProduction()?'https://api.midtrans.com':'https://api.sandbox.midtrans.com'; }
function auth(){ return 'Basic '+Buffer.from(serverKey()+':').toString('base64'); }

function friendlyApiError(data,status){
  const raw = Array.isArray(data?.error_messages) ? data.error_messages.join(' ') : (data?.status_message || data?.message || data?.error_message || '');
  const msg = clean(raw) || `Midtrans HTTP ${status}`;
  if(status===401) return 'Server Key Midtrans tidak valid atau tidak cocok dengan mode Sandbox/Production.';
  if(status===406 && /duplicate|order/i.test(msg)) return 'ID transaksi Midtrans sudah pernah digunakan. Sistem akan membuat percobaan pembayaran baru.';
  return msg.slice(0,500);
}

async function request(url,opt={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch(url,{
      ...opt,
      signal:controller.signal,
      headers:{Accept:'application/json','Content-Type':'application/json',Authorization:auth(),...(opt.headers||{})}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw err(friendlyApiError(data,response.status),(response.status>=400&&response.status<500)?response.status:502,data?.status_code||'API');
    return data;
  }catch(e){
    if(e?.name==='AbortError') throw err('Koneksi ke Midtrans timeout. Silakan coba lagi.',504,'TIMEOUT');
    if(e?.safe) throw e;
    throw err('Tidak dapat terhubung ke Midtrans. Silakan coba lagi.',502,'NETWORK');
  }finally{ clearTimeout(timeout); }
}

function customerDetails(order){
  const out={first_name:clean(order.name||'Pelanggan').slice(0,50),email:clean(order.email).slice(0,50)};
  const digits=clean(order.phone).replace(/\D/g,'');
  if(digits) out.phone=digits.startsWith('62')?`+${digits}`:digits.startsWith('0')?`+62${digits.slice(1)}`:`+${digits}`;
  return out;
}

export async function createPayment(order, gatewayOrderId){
  if(!midtransEnabled()) throw err('Midtrans belum siap. Periksa PAYMENT_MODE=midtrans, MIDTRANS_SERVER_KEY, MIDTRANS_IS_PRODUCTION, dan SITE_URL.',500,'CONFIG');
  const site=clean(process.env.SITE_URL).replace(/\/$/,'');
  const midOrderId=clean(gatewayOrderId).slice(0,50);
  if(!midOrderId) throw err('Gateway order ID kosong.',400,'ORDER_ID');
  const qty=Math.max(1,safeInt(order.quantity,1));
  const price=Math.max(0,safeInt(order.price,0));
  const total=Math.max(0,safeInt(order.total,price*qty));
  const expiresMs=new Date(order.expires_at||Date.now()+24*3600000).getTime();
  const expiryHours=Math.max(1,Math.min(168,Math.ceil((expiresMs-Date.now())/3600000)||24));
  const jakartaStart=new Date(Date.now()+7*3600000).toISOString().slice(0,19).replace('T',' ')+' +0700';
  const body={
    transaction_details:{order_id:midOrderId,gross_amount:total},
    item_details:[{id:clean(order.product_id||'product').slice(0,50),price,quantity:qty,name:clean(order.product_name||'Produk Digital').slice(0,50)}],
    customer_details:customerDetails(order),
    callbacks:{finish:`${site}/?payment_return=${encodeURIComponent(order.id)}#pesanan/${encodeURIComponent(order.id)}`},
    expiry:{start_time:jakartaStart,unit:'hours',duration:expiryHours},
    page_expiry:{unit:'hours',duration:expiryHours},
    credit_card:{secure:true}
  };
  const data=await request(`${snapBase()}/snap/v1/transactions`,{method:'POST',body:JSON.stringify(body)});
  if(!data?.token || !data?.redirect_url) throw err('Midtrans tidak mengembalikan Snap Token/redirect URL.',502,'INVALID_RESPONSE');
  return {...data,order_id:midOrderId};
}

export async function getPaymentStatus(gatewayOrderId){
  if(!credentialsReady()) throw err('MIDTRANS_SERVER_KEY belum diatur atau tidak cocok dengan mode Sandbox/Production.',500,'CONFIG');
  const id=clean(gatewayOrderId);
  if(!id) throw err('ID transaksi Midtrans belum tersedia.',400,'ORDER_ID');
  try{
    const data=await request(`${apiBase()}/v2/${encodeURIComponent(id)}/status`,{method:'GET'});
    if(!data?.transaction_status && String(data?.status_code||'')==='404') return {...data,order_id:id,transaction_status:'pending'};
    return data;
  }catch(e){
    if(e?.status===404) return {order_id:id,transaction_status:'pending',status_code:'404',status_message:'Transaksi Midtrans belum dimulai di halaman pembayaran.'};
    throw e;
  }
}

export async function expirePayment(gatewayOrderId){
  if(!credentialsReady() || !gatewayOrderId) return null;
  try{return await request(`${apiBase()}/v2/${encodeURIComponent(clean(gatewayOrderId))}/expire`,{method:'POST'});}catch(e){return null;}
}

export function classifyPayment(payload){
  const status=clean(payload?.transaction_status).toLowerCase();
  const fraud=clean(payload?.fraud_status).toLowerCase();
  if(status==='settlement') return 'success';
  if(status==='capture') return (fraud==='challenge'||fraud==='deny')?'pending':'success';
  if(['deny','cancel','expire','failure'].includes(status)) return 'failed';
  if(['refund','partial_refund','chargeback','partial_chargeback'].includes(status)) return 'post_success_change';
  return 'pending';
}

export function verifySignature(payload){
  const orderId=clean(payload?.order_id), statusCode=clean(payload?.status_code), gross=clean(payload?.gross_amount), sig=clean(payload?.signature_key).toLowerCase();
  if(!orderId || !statusCode || !gross || !sig || !serverKey()) return false;
  const expected=crypto.createHash('sha512').update(orderId+statusCode+gross+serverKey()).digest('hex').toLowerCase();
  const a=Buffer.from(expected), b=Buffer.from(sig);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
