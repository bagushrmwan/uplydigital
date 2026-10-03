import crypto from 'crypto';
import { ensureSchema, q } from '../lib/db.js';
import { verifyNotification } from '../lib/midtrans.js';
import { applyMidtransStatus } from '../lib/payment-state.js';

export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).end(JSON.stringify({ok:false,error:'method not allowed'}));
  try{
    await ensureSchema();
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(!verifyNotification(body)) return res.status(401).end(JSON.stringify({ok:false,error:'invalid signature'}));

    const gatewayOrderId=String(body.order_id||'');
    const eventKey=crypto.createHash('sha256').update(JSON.stringify([
      gatewayOrderId,body.status_code,body.transaction_status,body.transaction_id,body.signature_key
    ])).digest('hex');

    const existing=await q('SELECT id,processed_at FROM payment_events WHERE event_key=$1 LIMIT 1',[eventKey]);
    if(existing.rows[0]?.processed_at) return res.status(200).end(JSON.stringify({ok:true,duplicate:true}));
    if(!existing.rowCount){
      await q(`INSERT INTO payment_events(event_key,order_id,payload,error) VALUES($1,$2,$3::jsonb,'') ON CONFLICT(event_key) DO NOTHING`,[eventKey,gatewayOrderId,JSON.stringify(body)]);
    }else{
      await q(`UPDATE payment_events SET payload=$2::jsonb,error='' WHERE event_key=$1`,[eventKey,JSON.stringify(body)]);
    }

    const result=await applyMidtransStatus(body,'midtrans-webhook');
    await q(`UPDATE payment_events SET processed_at=NOW(),error='' WHERE event_key=$1`,[eventKey]);

    if(!result.found) return res.status(200).end(JSON.stringify({ok:true,ignored:'unknown order'}));
    if(result.state==='amount_mismatch') return res.status(200).end(JSON.stringify({ok:true,review:true,reason:'amount_mismatch'}));
    return res.status(200).end(JSON.stringify({ok:true,state:result.state}));
  }catch(e){
    console.error('MIDTRANS WEBHOOK',e);
    try{
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const eventKey=crypto.createHash('sha256').update(JSON.stringify([
        body.order_id,body.status_code,body.transaction_status,body.transaction_id,body.signature_key
      ])).digest('hex');
      await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,String(e?.message||'server error').slice(0,500)]);
    }catch{}
    return res.status(500).end(JSON.stringify({ok:false,error:'server error'}));
  }
}
