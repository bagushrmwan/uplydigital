import crypto from 'crypto';
import { ensureSchema, q, pool, audit } from '../lib/db.js';
import { verifyNotification } from '../lib/midtrans.js';
import { sendEmail } from '../lib/email.js';

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function fulfill(orderId){
  const client=await pool.connect(); let done=null;
  try{
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT o.*,p.fulfillment_mode FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=$1 FOR UPDATE`,[orderId]); const o=rows[0];
    if(!o||o.status!=='processing'||o.fulfillment_mode!=='inventory'){await client.query('ROLLBACK');return null;}
    const items=(await client.query(`SELECT * FROM inventory WHERE product_id=$1 AND status='available' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,[o.product_id,Number(o.quantity)])).rows;
    if(items.length<Number(o.quantity)){await client.query(`UPDATE orders SET note='Pembayaran berhasil, tetapi inventory otomatis tidak mencukupi. Admin perlu menambahkan stok.',updated_at=NOW() WHERE id=$1`,[orderId]);await client.query('COMMIT');return null;}
    const ids=items.map(x=>x.id); const delivery=items.map(x=>x.item_value).join('\n');
    await client.query(`UPDATE inventory SET status='delivered',order_id=$2,updated_at=NOW() WHERE id = ANY($1::text[])`,[ids,orderId]);
    done=(await client.query(`UPDATE orders SET status='completed',delivery=$2,inventory_item_id=$3,updated_at=NOW() WHERE id=$1 RETURNING *`,[orderId,delivery,ids.join(',')])).rows[0]; await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  if(done){await audit('midtrans','inventory_auto_delivered',done.id,{quantity:Number(done.quantity)});await sendEmail(done.email,`Pesanan ${done.id} selesai`,`<h2>Pesanan Uply Digital selesai</h2><p>${escapeHtml(done.product_name)}</p><pre style="white-space:pre-wrap">${escapeHtml(done.delivery)}</pre>`);} return done;
}
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).end(JSON.stringify({ok:false}));
  try{
    await ensureSchema(); const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(!verifyNotification(body)) return res.status(401).end(JSON.stringify({ok:false,error:'invalid signature'}));
    const orderId=String(body.order_id||''); const eventKey=crypto.createHash('sha256').update(JSON.stringify([orderId,body.status_code,body.transaction_status,body.signature_key])).digest('hex');
    const duplicate=await q('SELECT 1 FROM payment_events WHERE event_key=$1',[eventKey]); if(duplicate.rowCount) return res.status(200).end(JSON.stringify({ok:true,duplicate:true}));
    await q('INSERT INTO payment_events(event_key,order_id,payload) VALUES($1,$2,$3::jsonb)',[eventKey,orderId,JSON.stringify(body)]);
    const {rows}=await q('SELECT * FROM orders WHERE id=$1 LIMIT 1',[orderId]); const order=rows[0]; if(!order) return res.status(200).end(JSON.stringify({ok:true,ignored:'unknown order'}));
    const status=String(body.transaction_status||''); const fraud=String(body.fraud_status||'').toLowerCase(); const success=(status==='settlement'||status==='capture')&&(!fraud||fraud==='accept')&&String(body.status_code)==='200';
    if(success){
      await q(`UPDATE orders SET status='processing',gateway_status=$2,gateway_transaction_id=$3,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1 AND status<>'completed'`,[orderId,status,String(body.transaction_id||'')]);
      await audit('midtrans','payment_verified',orderId,{status,paymentType:body.payment_type||''}); await fulfill(orderId);
    } else if(['expire','cancel','deny','failure'].includes(status)){
      if(order.status==='pending_payment' && order.stock_reserved){await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[order.product_id,order.quantity]);}
      await q(`UPDATE orders SET status='cancelled',gateway_status=$2,note='Pembayaran tidak diselesaikan atau ditolak oleh payment gateway.',stock_reserved=FALSE,updated_at=NOW() WHERE id=$1 AND status='pending_payment'`,[orderId,status]); await audit('midtrans','payment_failed',orderId,{status});
    } else await q('UPDATE orders SET gateway_status=$2,updated_at=NOW() WHERE id=$1',[orderId,status]);
    return res.status(200).end(JSON.stringify({ok:true}));
  }catch(e){console.error('MIDTRANS WEBHOOK',e);return res.status(500).end(JSON.stringify({ok:false,error:'server error'}));}
}
