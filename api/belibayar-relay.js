import { ensureSchema,q } from '../lib/db.js';
import { safeEqual } from '../lib/security.js';
import { applyBelibayarStatus } from '../lib/payment-state.js';

function clean(v){return String(v??'').trim();}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method Not Allowed'});
  let eventKey='';
  try{
    const expected=clean(process.env.UPLY_RELAY_KEY);
    const received=clean(req.headers['x-uply-relay-key']);
    if(expected.length<16||!safeEqual(expected,received)) return res.status(401).json({ok:false,error:'Unauthorized relay'});
    await ensureSchema();
    const payload=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const reference=clean(payload.reference),tx=clean(payload.transaction_id),status=clean(payload.status).toLowerCase();
    if(!reference||!tx||!status) return res.status(400).json({ok:false,error:'reference, transaction_id, status required'});
    eventKey=`belibayar-relay:${reference}:${tx}:${status}`;
    await q(`INSERT INTO payment_events(event_key,order_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(event_key) DO NOTHING`,[eventKey,reference,JSON.stringify(payload)]);
    const existing=await q('SELECT processed_at FROM payment_events WHERE event_key=$1',[eventKey]);
    if(existing.rows[0]?.processed_at) return res.status(200).json({ok:true,duplicate:true});
    const result=await applyBelibayarStatus(payload,'belibayar-windows-relay');
    if(!result.found){await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,'Order mapping not found']);return res.status(202).json({ok:true,found:false});}
    await q(`UPDATE payment_events SET processed_at=NOW(),error='' WHERE event_key=$1`,[eventKey]);
    return res.status(200).json({ok:true,state:result.state});
  }catch(e){
    console.error('BELIBAYAR RELAY',e);
    if(eventKey){try{await q(`UPDATE payment_events SET error=$2 WHERE event_key=$1`,[eventKey,String(e?.message||e).slice(0,500)]);}catch{}}
    return res.status(500).json({ok:false});
  }
}
