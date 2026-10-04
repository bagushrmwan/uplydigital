import { q, pool, audit } from './db.js';
import { classifyPayment } from './midtrans.js';
import { sendEmail } from './email.js';

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export async function findOrderByGatewayReference(reference){
  const ref=String(reference||'').trim();
  if(!ref) return null;
  const byAttempt=await q(`SELECT o.* FROM payment_attempts pa JOIN orders o ON o.id=pa.order_id WHERE pa.gateway_order_id=$1 ORDER BY pa.attempt_no DESC LIMIT 1`,[ref]);
  if(byAttempt.rows[0]) return byAttempt.rows[0];
  const {rows}=await q(`SELECT * FROM orders WHERE id=$1 OR gateway_order_id=$1 ORDER BY CASE WHEN id=$1 THEN 0 ELSE 1 END LIMIT 1`,[ref]);
  return rows[0]||null;
}

export async function autoFulfillOrder(orderId,actor='system'){
  const client=await pool.connect();let completed=null;
  try{
    await client.query('BEGIN');
    const {rows:ors}=await client.query(`SELECT o.*,p.fulfillment_mode FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=$1 FOR UPDATE`,[orderId]);
    const o=ors[0];
    if(!o||o.status!=='processing'||o.fulfillment_mode!=='inventory'){await client.query('ROLLBACK');return null;}
    const {rows:items}=await client.query(`SELECT * FROM inventory WHERE product_id=$1 AND status='available' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,[o.product_id,Number(o.quantity)]);
    if(items.length<Number(o.quantity)){
      await client.query(`UPDATE orders SET note=CASE WHEN note='' THEN $2 ELSE note || E'\n' || $2 END,updated_at=NOW() WHERE id=$1`,[orderId,'Pembayaran diterima, tetapi inventory otomatis tidak mencukupi. Admin perlu menambahkan stok.']);
      await client.query('COMMIT');return null;
    }
    const ids=items.map(x=>x.id),delivery=items.map(x=>x.item_value).join('\n');
    await client.query(`UPDATE inventory SET status='delivered',order_id=$2,updated_at=NOW() WHERE id=ANY($1::text[])`,[ids,orderId]);
    const {rows:done}=await client.query(`UPDATE orders SET status='completed',delivery=$2,inventory_item_id=$3,completed_at=COALESCE(completed_at,NOW()),credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[orderId,delivery,ids.join(',')]);
    await client.query('COMMIT');completed=done[0];
  }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}
  if(completed){await audit(actor,'inventory_auto_delivered',completed.id,{productId:completed.product_id,quantity:Number(completed.quantity)});await sendEmail(completed.email,`Pesanan ${completed.id} selesai`,`<h2>Pesanan Uply Digital selesai</h2><p>${escapeHtml(completed.product_name)}</p><pre style="white-space:pre-wrap">${escapeHtml(completed.delivery)}</pre>`);}
  return completed;
}

function amountFrom(payload){
  const n=Number(payload?.gross_amount ?? payload?.amount);
  return Number.isFinite(n)?Math.round(n):NaN;
}

export async function applyMidtransStatus(payload,actor='midtrans'){
  const gatewayOrderId=String(payload?.order_id||'').trim();
  const order=await findOrderByGatewayReference(gatewayOrderId);
  if(!order) return {found:false,order:null,state:'unknown'};
  const amount=amountFrom(payload);
  if(Number.isFinite(amount)&&amount>0&&amount!==Number(order.total)){
    await audit(actor,'payment_amount_mismatch',order.id,{gatewayOrderId,amount,expected:Number(order.total)});
    await q(`UPDATE orders SET gateway_status=$2,note=CASE WHEN note='' THEN $3 ELSE note || E'\n' || $3 END,updated_at=NOW() WHERE id=$1`,[order.id,String(payload?.transaction_status||'amount_mismatch'),'Nominal pembayaran dari Midtrans tidak cocok. Perlu pemeriksaan admin.']);
    return {found:true,order,state:'amount_mismatch'};
  }

  const state=classifyPayment(payload);
  const status=String(payload?.transaction_status||'').toLowerCase();
  const tx=String(payload?.transaction_id||'');
  const paymentType=String(payload?.payment_type||'');
  const fraud=String(payload?.fraud_status||'');

  const client=await pool.connect();
  let fresh=null, shouldAutoFulfill=false, auditAction='payment_status_updated', auditDetail={status,gatewayOrderId,transactionId:tx,paymentType,fraud};
  try{
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[order.id]);
    const locked=rows[0];
    if(!locked){await client.query('ROLLBACK');return {found:false,order:null,state:'unknown'};}

    await client.query(`INSERT INTO payment_attempts(gateway_order_id,order_id,provider,attempt_no,status,transaction_id,payment_url,payload,updated_at)
      VALUES($1,$2,'midtrans',GREATEST($3,1),$4,$5,'',$6::jsonb,NOW())
      ON CONFLICT(gateway_order_id) DO UPDATE SET status=EXCLUDED.status,transaction_id=CASE WHEN EXCLUDED.transaction_id<>'' THEN EXCLUDED.transaction_id ELSE payment_attempts.transaction_id END,payload=EXCLUDED.payload,updated_at=NOW()`,
      [gatewayOrderId,locked.id,Number(locked.gateway_attempt)||1,status,tx,JSON.stringify(payload)]);

    if(state==='success'){
      if(locked.status==='cancelled'){
        await client.query(`UPDATE orders SET status='review',gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,payment_submitted_at=COALESCE(payment_submitted_at,NOW()),note=CASE WHEN note='' THEN $5 ELSE note || E'\n' || $5 END,updated_at=NOW() WHERE id=$1`,[locked.id,status,tx,paymentType,'Pembayaran Midtrans masuk setelah order sebelumnya dibatalkan/kedaluwarsa. Admin harus memeriksa stok dan pembayaran sebelum fulfillment.']);
        auditAction='late_payment_after_cancel';
      }else{
        await client.query(`UPDATE orders SET status=CASE WHEN status='completed' THEN 'completed' ELSE 'processing' END,gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,payment_submitted_at=COALESCE(payment_submitted_at,NOW()),payment_verified_at=COALESCE(payment_verified_at,NOW()),processing_at=CASE WHEN status='completed' THEN processing_at ELSE COALESCE(processing_at,NOW()) END,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1`,[locked.id,status,tx,paymentType]);
        auditAction='payment_verified'; shouldAutoFulfill=locked.status!=='completed';
      }
    }else if(state==='failed'){
      if(!['processing','completed'].includes(locked.status)){
        if(locked.stock_reserved) await client.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[locked.product_id,locked.quantity]);
        await client.query(`UPDATE orders SET status='cancelled',gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,note=CASE WHEN note='' THEN $5 ELSE note || E'\n' || $5 END,credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1`,[locked.id,status,tx,paymentType,'Pembayaran Midtrans gagal, dibatalkan, atau kedaluwarsa. Jika kemudian terdapat pembayaran terlambat, order akan masuk review admin.']);
      }else{
        await client.query(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,updated_at=NOW() WHERE id=$1`,[locked.id,status,tx]);
      }
      auditAction='payment_failed';
    }else if(state==='post_success_change'){
      await client.query(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,note=CASE WHEN note='' THEN $4 ELSE note || E'\n' || $4 END,updated_at=NOW() WHERE id=$1`,[locked.id,status,tx,`Status pascapembayaran Midtrans berubah menjadi ${status}. Periksa dashboard Midtrans.`]);
      auditAction='payment_post_success_change';
    }else{
      await client.query(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,updated_at=NOW() WHERE id=$1`,[locked.id,status,tx,paymentType]);
      auditAction='payment_pending';
    }
    fresh=(await client.query('SELECT * FROM orders WHERE id=$1',[locked.id])).rows[0];
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}

  await audit(actor,auditAction,order.id,auditDetail);
  if(shouldAutoFulfill) await autoFulfillOrder(order.id,actor);
  fresh=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
  return {found:true,order:fresh,state};
}
