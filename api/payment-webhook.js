import { ensureSchema, q } from '../lib/db.js';
import { verifySignature, getPaymentStatus } from '../lib/midtrans.js';
import { applyMidtransStatus } from '../lib/payment-state.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end('Method Not Allowed');
  let eventKey='';
  try{
    await ensureSchema();
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(!verifySignature(payload)) return res.status(401).json({ok:false,error:'Invalid Midtrans signature'});
    const gatewayOrderId=String(payload.order_id||'').trim();
    if(!gatewayOrderId) return res.status(400).json({ok:false,error:'order_id missing'});
    eventKey=`midtrans:${gatewayOrderId}:${String(payload.transaction_id||'')}:${String(payload.transaction_status||'')}:${String(payload.status_code||'')}`;
    await q(`INSERT INTO payment_events(event_key,order_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(event_key) DO NOTHING`,[eventKey,gatewayOrderId,JSON.stringify(payload)]);
    const existing=await q('SELECT processed_at FROM payment_events WHERE event_key=$1',[eventKey]);
    if(existing.rows[0]?.processed_at) return res.status(200).json({ok:true,duplicate:true});

    let verifiedPayload=payload;
    try{
      const status=await getPaymentStatus(gatewayOrderId);
      if(status?.order_id) verifiedPayload=status;
    }catch(e){
      // Signature verification above is already the official Midtrans integrity check.
      // If status API is temporarily unavailable, process the signed notification and let retries/status-sync reconcile later.
      console.warn('MIDTRANS STATUS VERIFY FALLBACK',e?.message||e);
    }

    const result=await applyMidtransStatus(verifiedPayload,'midtrans-webhook');
    if(!result.found){
      await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,'Order mapping not found']);
      return res.status(202).json({ok:true,found:false});
    }
    await q(`UPDATE payment_events SET processed_at=NOW(),error='' WHERE event_key=$1`,[eventKey]);
    return res.status(200).json({ok:true,state:result.state});
  }catch(e){
    console.error('MIDTRANS WEBHOOK',e);
    if(eventKey){try{await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,String(e?.message||e).slice(0,500)]);}catch{}}
    return res.status(500).json({ok:false});
  }
}
