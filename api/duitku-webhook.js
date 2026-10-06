import { ensureSchema,q } from '../lib/db.js';
import { verifyDuitkuCallback } from '../lib/duitku.js';
import { applyDuitkuStatus } from '../lib/payment-state.js';

function payloadFrom(req){
  if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)) return req.body;
  const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'');
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end('Method Not Allowed');
  let eventKey='';
  try{
    await ensureSchema(); const payload=payloadFrom(req);
    if(!verifyDuitkuCallback(payload)) return res.status(401).json({ok:false,error:'Invalid Duitku signature'});
    const reference=String(payload.merchantOrderId||'').trim(); if(!reference) return res.status(400).json({ok:false,error:'merchantOrderId missing'});
    payload.gateway_reference=reference; payload.transaction_id=String(payload.reference||''); payload.status=String(payload.resultCode)==='00'?'paid':'failed';
    eventKey=`duitku:${reference}:${String(payload.reference||'')}:${String(payload.resultCode||'')}`;
    await q(`INSERT INTO payment_events(event_key,order_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(event_key) DO NOTHING`,[eventKey,reference,JSON.stringify(payload)]);
    const existing=await q('SELECT processed_at FROM payment_events WHERE event_key=$1',[eventKey]); if(existing.rows[0]?.processed_at) return res.status(200).json({ok:true,duplicate:true});
    const result=await applyDuitkuStatus(payload,'duitku-webhook');
    if(!result.found){await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,'Order mapping not found']);return res.status(202).json({ok:true,found:false});}
    await q(`UPDATE payment_events SET processed_at=NOW(),error='' WHERE event_key=$1`,[eventKey]);
    return res.status(200).json({ok:true,state:result.state});
  }catch(e){console.error('DUITKU WEBHOOK',e);if(eventKey){try{await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,String(e?.message||e).slice(0,500)]);}catch{}}return res.status(500).json({ok:false});}
}
