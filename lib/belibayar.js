function clean(v){return String(v??'').trim();}
function bool(v){return v===true||['1','true','yes','on'].includes(clean(v).toLowerCase());}
function err(message,status=502,code='BELIBAYAR_ERROR'){const e=new Error(message);e.safe=true;e.status=status;e.code=code;return e;}

export function backendUrl(){return clean(process.env.BELIBAYAR_BACKEND_URL).replace(/\/+$/,'');}
export function backendKey(){return clean(process.env.BELIBAYAR_BACKEND_KEY);}
export function backendReadyFlag(){return bool(process.env.BELIBAYAR_BACKEND_READY);}
export function paymentMethod(){return 'qris';}
export function paymentChannel(){return 'QRIS';}
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
      let message=clean(data?.messages||data?.message||data?.error||`Windows backend HTTP ${response.status}`)||'BeliBayar backend error.';
      if(response.status===401) message='Autentikasi Windows backend ditolak. Samakan BELIBAYAR_BACKEND_KEY di Vercel dengan UPLY_BACKEND_KEY terbaru di Windows, lalu Redeploy Vercel.';
      if(response.status===403) message='Windows backend menolak request BeliBayar. Periksa firewall, whitelist, dan konfigurasi backend.';
      throw err(message.slice(0,500),(response.status>=400&&response.status<500)?response.status:502,data?.data?.code||data?.code||'PROXY');
    }
    return data;
  }catch(e){
    if(e?.name==='AbortError') throw err('Koneksi ke backend pembayaran Windows timeout.',504,'TIMEOUT');
    if(e?.safe) throw e;
    throw err('Backend pembayaran Windows tidak dapat dihubungi.',502,'NETWORK');
  }finally{clearTimeout(timeout);}
}


export async function probeBelibayarBackend(){
  if(!credentialsReady()) return {ok:false,status:0,auth:false,message:'BELIBAYAR_BACKEND_URL / BELIBAYAR_BACKEND_KEY belum lengkap.'};
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(backendUrl()+'/api/payments/local/__uply_health_probe__',{
      method:'GET',
      headers:{'X-Uply-Backend-Key':backendKey(),Accept:'application/json'},
      signal:controller.signal
    });
    const raw=await response.text();
    let data={};try{data=JSON.parse(raw||'{}');}catch{}
    if(response.status===401) return {ok:false,status:401,auth:false,message:'Backend key Vercel tidak sama dengan Windows.'};
    // Endpoint protected: 404 Payment not found means authentication passed.
    if(response.status===404) return {ok:true,status:404,auth:true,message:'Windows backend terhubung dan backend key valid.'};
    if(response.ok) return {ok:true,status:response.status,auth:true,message:'Windows backend terhubung.'};
    return {ok:false,status:response.status,auth:true,message:clean(data?.message||data?.messages||`HTTP ${response.status}`)};
  }catch(e){
    return {ok:false,status:0,auth:false,message:e?.name==='AbortError'?'Windows backend timeout.':'Windows backend tidak dapat dihubungi.'};
  }finally{clearTimeout(timeout);}
}

export async function createBelibayarPayment(order,reference){
  if(!belibayarEnabled()) throw err('BeliBayar belum siap. Periksa BELIBAYAR_BACKEND_URL, BELIBAYAR_BACKEND_KEY, dan BELIBAYAR_BACKEND_READY di Vercel.',500,'CONFIG');
  const payload={
    reference:clean(reference).slice(0,100),
    amount:Math.max(1,Math.round(Number(order.total)||0)),
    customer_name:clean(order.name||'Pelanggan').slice(0,100),
    customer_email:clean(order.email).slice(0,150)
  };
  const response=await proxyRequest('/api/payments/belibayar/qris',{method:'POST',json:payload});
  const d=response?.data||{};
  if(!d.reference||!d.transaction_id) throw err('Backend BeliBayar tidak mengembalikan transaksi yang valid.',502,'INVALID_RESPONSE');
  return {...d,payment_url:d.payment_url||'',provider:'belibayar'};
}

export async function getBelibayarStatus(reference){
  if(!belibayarEnabled()) throw err('Backend BeliBayar Windows belum siap.',500,'CONFIG');
  const ref=clean(reference);if(!ref) throw err('Referensi transaksi BeliBayar kosong.',400,'REFERENCE');
  const response=await proxyRequest('/api/payments/belibayar/status/'+encodeURIComponent(ref),{method:'GET'});
  return response?.data||response;
}

export function classifyBelibayar(payload){const s=clean(payload?.status).toLowerCase();if(s==='paid')return 'success';if(['expired','cancelled','canceled','failed','failure'].includes(s))return 'failed';return 'pending';}

