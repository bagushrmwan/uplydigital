import { q, pool, audit } from './db.js';
import { classifyTransaction } from './midtrans.js';
import { sendEmail } from './email.js';

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export async function findOrderByGatewayId(midtransOrderId){
  const {rows}=await q(`SELECT * FROM orders WHERE gateway_order_id=$1 OR id=$1 ORDER BY CASE WHEN gateway_order_id=$1 THEN 0 ELSE 1 END LIMIT 1`,[String(midtransOrderId||'')]);
  return rows[0] || null;
}

export async function autoFulfillOrder(orderId, actor='system'){
  const client=await pool.connect(); let completed=null;
  try{
    await client.query('BEGIN');
    const {rows:ors}=await client.query(`SELECT o.*,p.fulfillment_mode FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=$1 FOR UPDATE`,[orderId]);
    const o=ors[0];
    if(!o || o.status!=='processing' || o.fulfillment_mode!=='inventory'){await client.query('ROLLBACK');return null;}
    const {rows:items}=await client.query(`SELECT * FROM inventory WHERE product_id=$1 AND status='available' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,[o.product_id,Number(o.quantity)]);
    if(items.length<Number(o.quantity)){
      await client.query(`UPDATE orders SET note=CASE WHEN note='' THEN $2 ELSE note || E'\n' || $2 END,updated_at=NOW() WHERE id=$1`,[orderId,'Pembayaran diterima, tetapi inventory otomatis tidak mencukupi. Admin perlu menambahkan stok.']);
      await client.query('COMMIT'); return null;
    }
    const ids=items.map(x=>x.id), delivery=items.map(x=>x.item_value).join('\n');
    await client.query(`UPDATE inventory SET status='delivered',order_id=$2,updated_at=NOW() WHERE id = ANY($1::text[])`,[ids,orderId]);
    const {rows:done}=await client.query(`UPDATE orders SET status='completed',delivery=$2,inventory_item_id=$3,completed_at=COALESCE(completed_at,NOW()),credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[orderId,delivery,ids.join(',')]);
    await client.query('COMMIT'); completed=done[0];
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  if(completed){
    await audit(actor,'inventory_auto_delivered',completed.id,{productId:completed.product_id,quantity:Number(completed.quantity)});
    await sendEmail(completed.email,`Pesanan ${completed.id} selesai`,`<h2>Pesanan Uply Digital selesai</h2><p>${escapeHtml(completed.product_name)}</p><pre style="white-space:pre-wrap">${escapeHtml(completed.delivery)}</pre>`);
  }
  return completed;
}

export async function applyMidtransStatus(body, actor='midtrans'){
  const gatewayOrderId=String(body?.order_id||'');
  const order=await findOrderByGatewayId(gatewayOrderId);
  if(!order) return {found:false,order:null,state:'unknown'};

  const gross=Math.round(Number(body?.gross_amount));
  if(Number.isFinite(gross) && gross>0 && gross!==Number(order.total)){
    await audit(actor,'payment_amount_mismatch',order.id,{gatewayOrderId,gross,expected:Number(order.total)});
    await q(`UPDATE orders SET gateway_status=$2,note=CASE WHEN note='' THEN $3 ELSE note || E'\n' || $3 END,updated_at=NOW() WHERE id=$1`,[order.id,String(body?.transaction_status||'amount_mismatch'),'Nominal pembayaran dari gateway tidak cocok. Perlu pemeriksaan admin.']);
    return {found:true,order,state:'amount_mismatch'};
  }

  const state=classifyTransaction(body), status=String(body?.transaction_status||''), tx=String(body?.transaction_id||'');
  if(state==='success'){
    if(order.status==='cancelled'){
      await q(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=$3,note=CASE WHEN note='' THEN $4 ELSE note || E'\n' || $4 END,updated_at=NOW() WHERE id=$1`,[order.id,status,tx,'Pembayaran terdeteksi setelah order dibatalkan. Perlu pemeriksaan/refund manual oleh admin.']);
      await audit(actor,'late_payment_after_cancel',order.id,{status,paymentType:body?.payment_type||'',gatewayOrderId});
      return {found:true,order:(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0],state:'review'};
    }
    await q(`UPDATE orders SET status=CASE WHEN status='completed' THEN 'completed' ELSE 'processing' END,gateway_status=$2,gateway_transaction_id=$3,payment_submitted_at=COALESCE(payment_submitted_at,NOW()),payment_verified_at=COALESCE(payment_verified_at,NOW()),processing_at=CASE WHEN status='completed' THEN processing_at ELSE COALESCE(processing_at,NOW()) END,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1`,[order.id,status,tx]);
    await audit(actor,'payment_verified',order.id,{status,paymentType:body?.payment_type||'',gatewayOrderId});
    await autoFulfillOrder(order.id,actor);
  }else if(state==='failed'){
    if(['pending_payment','review'].includes(order.status) && order.stock_reserved){
      await q('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[order.product_id,order.quantity]);
    }
    if(!['processing','completed'].includes(order.status)){
      await q(`UPDATE orders SET status='cancelled',gateway_status=$2,note=CASE WHEN note='' THEN $3 ELSE note || E'\n' || $3 END,credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1`,[order.id,status,'Pembayaran tidak diselesaikan atau ditolak oleh payment gateway.']);
    }else{
      await q('UPDATE orders SET gateway_status=$2,updated_at=NOW() WHERE id=$1',[order.id,status]);
    }
    await audit(actor,'payment_failed',order.id,{status,gatewayOrderId});
  }else if(state==='review'){
    await q(`UPDATE orders SET gateway_status=$2,note=CASE WHEN note='' THEN $3 ELSE note || E'\n' || $3 END,updated_at=NOW() WHERE id=$1`,[order.id,status,'Status pembayaran membutuhkan pemeriksaan admin.']);
    await audit(actor,'payment_requires_review',order.id,{status,gatewayOrderId});
  }else{
    await q('UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>\'\' THEN $3 ELSE gateway_transaction_id END,updated_at=NOW() WHERE id=$1',[order.id,status,tx]);
  }
  const fresh=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
  return {found:true,order:fresh,state};
}
