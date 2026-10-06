function clean(v){return String(v??'').trim();}
function bool(v){return v===true||['1','true','yes','on'].includes(clean(v).toLowerCase());}
function err(message,status=502,code='BELIBAYAR_ERROR'){const e=new Error(message);e.safe=true;e.status=status;e.code=code;return e;}

function flattenMessage(value,prefix='',depth=0){
  if(value===null||value===undefined||depth>5) return '';
  if(typeof value==='string'||typeof value==='number'||typeof value==='boolean') return clean(value);
  if(Array.isArray(value)) return value.map(v=>flattenMessage(v,prefix,depth+1)).filter(Boolean).join(' · ');
  if(typeof value==='object'){
    const preferred=['message','messages','error','detail','reason','description'];
    for(const key of preferred){
      if(Object.prototype.hasOwnProperty.call(value,key)){
        const x=flattenMessage(value[key],prefix,depth+1);
        if(x) return x;
      }
    }
    return Object.entries(value)
      .filter(([k])=>!['code','status','success'].includes(String(k).toLowerCase()))
      .map(([k,v])=>{const x=flattenMessage(v,k,depth+1);return x?`${k}: ${x}`:'';})
      .filter(Boolean).join(' · ');
  }
  return '';
}
function providerCode(data){return clean(data?.data?.code||data?.code);}
function providerMessage(data,status){
  const code=providerCode(data);
  let message=flattenMessage(data?.messages)||flattenMessage(data?.message)||flattenMessage(data?.error)||flattenMessage(data?.data?.message)||flattenMessage(data?.data?.errors);
  const friendly={
    VALIDATION_ERROR:'Data pembayaran yang dikirim belum valid.',
    CHANNEL_DISABLED:'Channel pembayaran BeliBayar yang dipilih belum aktif untuk merchant ini.',
    MERCHANT_INACTIVE:'Merchant BeliBayar sedang tidak aktif.',
    IP_WHITELIST_REQUIRED:'IP whitelist BeliBayar belum dikonfigurasi.',
    IP_NOT_WHITELISTED:'IP Windows backend belum terdaftar pada whitelist BeliBayar.',
    AMOUNT_BELOW_MINIMUM:'Nominal pembayaran berada di bawah minimum channel yang dipilih.',
    PROVIDER_REJECTED:'Provider pembayaran menolak transaksi ini.',
    PROVIDER_UNAVAILABLE:'Provider pembayaran sedang tidak tersedia.',
    PAYMENT_CREATION_FAILED:'Pembuatan pembayaran belum dapat dipastikan. Sistem akan mencoba mengecek reference yang sama.',
    INVALID_SIGNATURE:'Signature request ke BeliBayar tidak valid.',
    UNAUTHORIZED:'API Key BeliBayar tidak valid.',
    DUPLICATE_ORDER_ID:'Reference pembayaran sudah pernah digunakan.',
    IDEMPOTENCY_CONFLICT:'Reference yang sama pernah dikirim dengan data berbeda.'
  };
  if(friendly[code]) message=message?`${friendly[code]} ${message}`:friendly[code];
  if(!message) message=`Windows backend HTTP ${status}`;
  return code?`${message} [${code}]`:message;
}

export function backendUrl(){return clean(process.env.BELIBAYAR_BACKEND_URL).replace(/\/+$/,'');}
export function backendKey(){return clean(process.env.BELIBAYAR_BACKEND_KEY);}
export function backendReadyFlag(){return bool(process.env.BELIBAYAR_BACKEND_READY);}
export function paymentMethod(){return 'qris';}
export function paymentChannel(){return 'QRIS';}
export const BANK_VA_CODES=['BCA','BNI','BRI','MANDIRI','PERMATA','BSI','MUAMALAT','CIMB','SINARMAS','BNC','MAYBANK'];
export function credentialsReady(){return /^https:\/\//i.test(backendUrl())&&backendKey().length>=16;}
export function ipWhitelistReady(){return backendReadyFlag();}
export function belibayarEnabled(){return credentialsReady()&&backendReadyFlag();}
export function environmentName(){return 'production · Windows backend';}

async function proxyRequest(path,{method='GET',json=null}={}){
  if(!credentialsReady()) throw err('Backend BeliBayar Windows belum dikonfigurasi di Vercel.',500,'CONFIG');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const headers={'X-Uply-Backend-Key':backendKey(),Accept:'application/json'};
    let body;
    if(json!==null){headers['Content-Type']='application/json';body=JSON.stringify(json);}
    const response=await fetch(backendUrl()+path,{method,headers,body,signal:controller.signal});
    const text=await response.text();
    let data;try{data=JSON.parse(text||'{}');}catch{data={success:false,message:text||`Windows backend HTTP ${response.status}`};}
    if(!response.ok||data?.success===false){
      let message=providerMessage(data,response.status);
      if(response.status===401) message='Autentikasi Windows backend ditolak. Samakan BELIBAYAR_BACKEND_KEY di Vercel dengan UPLY_BACKEND_KEY terbaru di Windows, lalu Redeploy Vercel.';
      if(response.status===403 && !providerCode(data)) message='Windows backend menolak request BeliBayar. Periksa firewall, whitelist, dan konfigurasi backend.';
      throw err(message.slice(0,700),(response.status>=400&&response.status<500)?response.status:502,providerCode(data)||'PROXY');
    }
    return data;
  }catch(e){
    if(e?.name==='AbortError') throw err('Koneksi ke backend pembayaran Windows timeout.',504,'TIMEOUT');
    if(e?.safe) throw e;
    throw err('Backend pembayaran Windows tidak dapat dihubungi.',502,'NETWORK');
  }finally{clearTimeout(timeout);}
}


export async function probeBelibayarBackend(){
  if(!credentialsReady()) return {ok:false,status:0,auth:false,providerConnected:false,message:'BELIBAYAR_BACKEND_URL / BELIBAYAR_BACKEND_KEY belum lengkap.'};
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const headers={'X-Uply-Backend-Key':backendKey(),Accept:'application/json'};
    // V31.5: verify Windows -> BeliBayar as well, not only Vercel -> Windows.
    let response=await fetch(backendUrl()+'/api/belibayar/diagnostic',{method:'GET',headers,signal:controller.signal});
    let raw=await response.text();
    let data={};try{data=JSON.parse(raw||'{}');}catch{}
    if(response.status===404){
      // Backward-compatible fallback for Windows backend before V31.5.
      response=await fetch(backendUrl()+'/api/payments/local/__uply_health_probe__',{method:'GET',headers,signal:controller.signal});
      raw=await response.text();data={};try{data=JSON.parse(raw||'{}');}catch{}
      if(response.status===401) return {ok:false,status:401,auth:false,providerConnected:false,message:'Backend key Vercel tidak sama dengan Windows.'};
      if(response.status===404) return {ok:true,status:404,auth:true,providerConnected:null,message:'Windows backend terhubung, tetapi backend V31.5 diagnostic belum terpasang.'};
      if(response.ok) return {ok:true,status:response.status,auth:true,providerConnected:null,message:'Windows backend terhubung.'};
      return {ok:false,status:response.status,auth:true,providerConnected:false,message:clean(data?.message||data?.messages||`HTTP ${response.status}`)};
    }
    if(response.status===401) return {ok:false,status:401,auth:false,providerConnected:false,message:'Backend key Vercel tidak sama dengan Windows.'};
    if(response.ok && data?.success!==false && data?.providerConnected!==false){
      return {ok:true,status:response.status,auth:true,providerConnected:true,message:clean(data?.message||'Windows backend dan BeliBayar Live terhubung.'),apiOrigin:clean(data?.apiOrigin)};
    }
    return {ok:false,status:response.status,auth:true,providerConnected:false,message:providerMessage(data,response.status),apiOrigin:clean(data?.apiOrigin)};
  }catch(e){
    return {ok:false,status:0,auth:false,providerConnected:false,message:e?.name==='AbortError'?'Windows backend timeout.':'Windows backend tidak dapat dihubungi.'};
  }finally{clearTimeout(timeout);}
}

function normalizeBelibayarData(d={},fallbackReference='',fallbackMethod='qris',fallbackChannel='QRIS'){
  const reference=clean(d.reference||d.order_id||fallbackReference);
  const transactionId=clean(d.transaction_id||d.transactionId);
  const qrUrl=clean(d.qr_url||d.qrUrl);
  const vaNumber=clean(d.va_number||d.vaNumber);
  const paymentCode=clean(d.payment_code||d.paymentCode);
  const method=clean(d.payment_method||d.method||fallbackMethod||'qris').toLowerCase();
  const channel=clean(d.payment_channel||d.channel||fallbackChannel||(method==='qris'?'QRIS':'')).toUpperCase();
  const paymentUrl=clean(d.payment_url||d.paymentUrl||(method==='qris'?qrUrl:''));
  return {
    ...d,
    reference,
    transaction_id:transactionId,
    transactionId,
    qr_url:qrUrl,
    qrUrl,
    va_number:vaNumber,
    vaNumber,
    payment_code:paymentCode,
    paymentCode,
    payment_url:paymentUrl,
    paymentUrl,
    payment_method:method,
    method,
    payment_channel:channel,
    channel
  };
}

export async function getBelibayarChannels(){
  if(!belibayarEnabled()) return [];
  const response=await proxyRequest('/api/belibayar/channels',{method:'GET'});
  const items=Array.isArray(response?.data?.channels)?response.data.channels:[];
  return items.map(c=>({
    code:clean(c?.code).toUpperCase(),
    name:clean(c?.name||c?.code),
    method:clean(c?.method).toLowerCase(),
    logoUrl:clean(c?.logo_url||c?.logoUrl)
  })).filter(c=>c.code&&['qris','virtual_account'].includes(c.method))
     .filter(c=>c.method==='qris'||BANK_VA_CODES.includes(c.code));
}

export async function createBelibayarPayment(order,reference){
  if(!belibayarEnabled()) throw err('BeliBayar belum siap. Periksa BELIBAYAR_BACKEND_URL, BELIBAYAR_BACKEND_KEY, dan BELIBAYAR_BACKEND_READY di Vercel.',500,'CONFIG');
  const requestedMethod=clean(order?.gateway_payment_method||'qris').toLowerCase();
  const method=['qris','virtual_account'].includes(requestedMethod)?requestedMethod:'qris';
  const requestedChannel=clean(order?.gateway_payment_channel).toUpperCase();
  const channel=method==='qris'?'QRIS':requestedChannel;
  if(method==='virtual_account'&&!BANK_VA_CODES.includes(channel)) throw err('Virtual Account bank belum dipilih atau tidak didukung.',400,'INVALID_VA_CHANNEL');

  const payload={
    reference:clean(reference).slice(0,100),
    amount:Math.max(1,Math.round(Number(order.total)||0)),
    customer_name:clean(order.name||'Pelanggan').slice(0,100),
    customer_email:clean(order.email).slice(0,150),
    payment_method:method,
    payment_channel:channel
  };
  const response=await proxyRequest('/api/payments/belibayar/create',{method:'POST',json:payload});
  const d=normalizeBelibayarData(response?.data||{},payload.reference,method,channel);
  if(!d.reference||!d.transaction_id) throw err('Backend BeliBayar tidak mengembalikan transaksi yang valid.',502,'INVALID_RESPONSE');
  if(method==='qris'&&!d.qrUrl) throw err('BeliBayar tidak mengembalikan QRIS yang dapat ditampilkan.',502,'INVALID_QRIS_RESPONSE');
  if(method==='virtual_account'&&!d.vaNumber&&!d.paymentCode) throw err('BeliBayar tidak mengembalikan nomor Virtual Account.',502,'INVALID_VA_RESPONSE');
  return {...d,provider:'belibayar'};
}

export async function getBelibayarStatus(reference){
  if(!belibayarEnabled()) throw err('Backend BeliBayar Windows belum siap.',500,'CONFIG');
  const ref=clean(reference);if(!ref) throw err('Referensi transaksi BeliBayar kosong.',400,'REFERENCE');
  const response=await proxyRequest('/api/payments/belibayar/status/'+encodeURIComponent(ref),{method:'GET'});
  return normalizeBelibayarData(response?.data||response,ref);
}

export function classifyBelibayar(payload){const s=clean(payload?.status).toLowerCase();if(s==='paid')return 'success';if(['expired','cancelled','canceled','failed','failure'].includes(s))return 'failed';return 'pending';}

