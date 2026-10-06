import crypto from 'crypto';

function clean(v){return String(v??'').trim();}
function bool(v){return v===true||['1','true','yes','on'].includes(clean(v).toLowerCase());}
function err(message,status=502,code='DUITKU_ERROR'){const e=new Error(message);e.safe=true;e.status=status;e.code=code;return e;}
export function merchantCode(){return clean(process.env.DUITKU_MERCHANT_CODE);}
export function apiKey(){return clean(process.env.DUITKU_API_KEY);}
export function isProduction(){return bool(process.env.DUITKU_IS_PRODUCTION);}
export function paymentMethod(){return (clean(process.env.DUITKU_PAYMENT_METHOD)||'SP').toUpperCase();}
export function credentialsReady(){return merchantCode().length>=3&&apiKey().length>=12;}
export function duitkuEnabled(){return credentialsReady()&&/^https:\/\//i.test(clean(process.env.SITE_URL));}
export function environmentName(){return isProduction()?'production':'sandbox';}
function base(){return isProduction()?'https://passport.duitku.com':'https://sandbox.duitku.com';}
function sign(value){return crypto.createHmac('sha256',apiKey()).update(value).digest('hex');}

async function post(path,payload){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),18000);
  try{const response=await fetch(base()+path,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});const data=await response.json().catch(()=>({}));if(!response.ok||String(data?.statusCode||'').startsWith('4')){const msg=clean(data?.statusMessage||data?.Message||data?.message||`Duitku HTTP ${response.status}`);throw err(msg.slice(0,500),(response.status>=400&&response.status<500)?response.status:502,'API');}return data;}
  catch(e){if(e?.name==='AbortError')throw err('Koneksi ke Duitku timeout. Silakan coba lagi.',504,'TIMEOUT');if(e?.safe)throw e;throw err('Tidak dapat terhubung ke Duitku. Silakan coba lagi.',502,'NETWORK');}finally{clearTimeout(timeout);}
}

export async function createDuitkuPayment(order,gatewayOrderId){
  if(!duitkuEnabled())throw err('Duitku belum siap. Periksa Merchant Code, API Key, mode Sandbox/Production, dan SITE_URL.',500,'CONFIG');
  const site=clean(process.env.SITE_URL).replace(/\/$/,'');const total=Math.max(1,Math.round(Number(order.total)||0));const ref=clean(gatewayOrderId).slice(0,50);const method=paymentMethod();
  const mins=Math.max(5,Math.min(1440,Math.ceil((new Date(order.expires_at||Date.now()+3600000).getTime()-Date.now())/60000)||60));
  const payload={merchantCode:merchantCode(),paymentAmount:total,paymentMethod:method,merchantOrderId:ref,productDetails:clean(order.product_name||'Produk Digital').slice(0,255),additionalParam:'',merchantUserInfo:clean(order.email).slice(0,255),customerVaName:clean(order.name||'Pelanggan').slice(0,20),email:clean(order.email).slice(0,255),phoneNumber:clean(order.phone).slice(0,50),itemDetails:[{name:clean(order.product_name||'Produk Digital').slice(0,255),price:total,quantity:1}],callbackUrl:`${site}/api/duitku-webhook`,returnUrl:`${site}/?payment_return=${encodeURIComponent(order.id)}#pesanan/${encodeURIComponent(order.id)}`,signature:sign(merchantCode()+ref+total),expiryPeriod:mins};
  const data=await post('/webapi/api/merchant/v2/inquiry',payload);
  if(!data?.reference)throw err('Duitku tidak mengembalikan referensi transaksi.',502,'INVALID_RESPONSE');
  return {...data,transaction_id:data.reference,payment_method:method,payment_channel:method,payment_url:data.paymentUrl||data.appUrl||'',qr_content:data.qrString||'',va_number:data.vaNumber||'',status:String(data.statusCode)==='00'?'paid':'pending',provider:'duitku'};
}

export async function getDuitkuStatus(gatewayOrderId){
  if(!credentialsReady())throw err('Kredensial Duitku belum siap.',500,'CONFIG');const ref=clean(gatewayOrderId);if(!ref)throw err('Order ID Duitku kosong.',400,'REFERENCE');
  const data=await post('/webapi/api/merchant/transactionStatus',{merchantCode:merchantCode(),merchantOrderId:ref,signature:sign(merchantCode()+ref)});
  return {...data,gateway_reference:ref,merchantOrderId:ref,provider_reference:data.reference||'',transaction_id:data.reference||'',status:String(data.statusCode)==='00'?'paid':String(data.statusCode)==='02'?'cancelled':'pending',amount:Number(data.amount||0),payment_method:paymentMethod(),payment_channel:paymentMethod()};
}

export function classifyDuitku(payload){const c=clean(payload?.resultCode||payload?.statusCode);const s=clean(payload?.status).toLowerCase();if(c==='00'||s==='paid'||s==='success')return 'success';if(c==='02'||['cancelled','canceled','expired','failed','failure'].includes(s))return 'failed';return 'pending';}
export function verifyDuitkuCallback(payload){const mc=clean(payload?.merchantCode),amount=clean(payload?.amount),orderId=clean(payload?.merchantOrderId),sig=clean(payload?.signature).toLowerCase();if(!mc||!amount||!orderId||!sig||mc!==merchantCode())return false;const expected=sign(mc+amount+orderId).toLowerCase();const a=Buffer.from(expected),b=Buffer.from(sig);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
