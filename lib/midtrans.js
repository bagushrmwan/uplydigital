import crypto from 'crypto';

export function midtransEnabled(){ return String(process.env.PAYMENT_MODE||'manual').toLowerCase()==='midtrans' && !!process.env.MIDTRANS_SERVER_KEY; }
export function isProduction(){ return String(process.env.MIDTRANS_IS_PRODUCTION||'false').toLowerCase()==='true'; }
export async function createSnap(order){
  const key=process.env.MIDTRANS_SERVER_KEY; if(!key) throw new Error('MIDTRANS_SERVER_KEY belum diatur.');
  const base=isProduction()?'https://app.midtrans.com':'https://app.sandbox.midtrans.com';
  const body={
    transaction_details:{order_id:order.id,gross_amount:Number(order.total)},
    customer_details:{first_name:order.name,email:order.email,phone:order.phone||undefined},
    item_details:[{id:order.product_id,price:Number(order.price),quantity:Number(order.quantity),name:String(order.product_name).slice(0,50)}],
    credit_card:{secure:true}
  };
  const site=String(process.env.SITE_URL||'').replace(/\/$/,'');
  if(site) body.callbacks={finish:`${site}/#pesanan/${encodeURIComponent(order.id)}`};
  const r=await fetch(`${base}/snap/v1/transactions`,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json','Authorization':'Basic '+Buffer.from(key+':').toString('base64')},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.redirect_url) throw new Error(data.error_messages?.join(', ')||data.status_message||'Gagal membuat pembayaran Midtrans.');
  return data;
}
export function verifyNotification(body){
  const key=process.env.MIDTRANS_SERVER_KEY||'';
  const input=`${body.order_id||''}${body.status_code||''}${body.gross_amount||''}${key}`;
  const expected=crypto.createHash('sha512').update(input).digest('hex');
  const actual=String(body.signature_key||'');
  return expected.length===actual.length && crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual));
}
