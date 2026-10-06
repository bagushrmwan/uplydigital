import { q, pool, audit } from './db.js';
import { classifyPayment } from './midtrans.js';
import { classifyBelibayar } from './belibayar.js';
import { classifyDuitku } from './duitku.js';
import { sendEmail, emailTemplate } from './email.js';
import { syncMembership, refundOrderCredits, notifyAdmin, notifyUser } from './business.js';

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
    const {rows:items}=o.variant_id
      ? await client.query(`SELECT * FROM inventory WHERE product_id=$1 AND variant_id=$2 AND status='available' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $3`,[o.product_id,o.variant_id,Number(o.quantity)])
      : await client.query(`SELECT * FROM inventory WHERE product_id=$1 AND variant_id='' AND status='available' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,[o.product_id,Number(o.quantity)]);
    if(items.length<Number(o.quantity)){
      await client.query(`UPDATE orders SET note=CASE WHEN note='' THEN $2 ELSE note || E'\n' || $2 END,updated_at=NOW() WHERE id=$1`,[orderId,'Pembayaran diterima, tetapi inventory otomatis tidak mencukupi. Admin perlu menambahkan stok.']);
      await client.query('COMMIT');return null;
    }
    const ids=items.map(x=>x.id),delivery=items.map(x=>x.item_value).join('\n');
    await client.query(`UPDATE inventory SET status='delivered',order_id=$2,updated_at=NOW() WHERE id=ANY($1::text[])`,[ids,orderId]);
    const {rows:done}=await client.query(`UPDATE orders SET status='completed',delivery=$2,inventory_item_id=$3,completed_at=COALESCE(completed_at,NOW()),warranty_until=CASE WHEN warranty_days>0 THEN COALESCE(completed_at,NOW()) + (warranty_days || ' days')::interval ELSE warranty_until END,credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[orderId,delivery,ids.join(',')]);
    await client.query('COMMIT');completed=done[0];
  }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}
  if(completed){await audit(actor,'inventory_auto_delivered',completed.id,{productId:completed.product_id,variantId:completed.variant_id||'',quantity:Number(completed.quantity)});await syncMembership(completed.user_id,actor);await notifyAdmin('success','Pesanan selesai otomatis',`${completed.product_name} telah dikirim otomatis.`,completed.id);await notifyUser(completed.user_id,'success','Pesanan selesai',`${completed.product_name} sudah selesai dan siap dilihat.`,completed.id);const stock=completed.variant_id
      ? await q(`SELECT p.name,p.low_stock_threshold,v.name AS variant_name,COUNT(i.id) FILTER (WHERE i.status='available')::int AS available FROM products p JOIN product_variants v ON v.id=$2 LEFT JOIN inventory i ON i.product_id=p.id AND i.variant_id=v.id WHERE p.id=$1 GROUP BY p.id,v.id`,[completed.product_id,completed.variant_id])
      : await q(`SELECT p.name,p.low_stock_threshold,''::text AS variant_name,COUNT(i.id) FILTER (WHERE i.status='available' AND i.variant_id='')::int AS available FROM products p LEFT JOIN inventory i ON i.product_id=p.id WHERE p.id=$1 GROUP BY p.id`,[completed.product_id]);const sr=stock.rows[0];if(sr&&Number(sr.available)<=Number(sr.low_stock_threshold||3))await notifyAdmin('stock','Inventory menipis',`${sr.name}${sr.variant_name?` · ${sr.variant_name}`:''} tersisa ${sr.available} item.`,completed.variant_id||completed.product_id);await sendEmail(completed.email,`Pesanan ${completed.id} selesai`,emailTemplate({title:'Pesanan selesai',eyebrow:'UPLY DIGITAL · SELESAI',body:`<p><strong>${escapeHtml(completed.product_name)}</strong> sudah selesai dan detail produk siap digunakan.</p><div style="margin-top:16px;padding:15px;background:#f7f9fd;border-radius:12px;white-space:pre-wrap;color:#17233c">${escapeHtml(completed.delivery)}</div>`,ctaLabel:'Buka Dashboard',ctaUrl:`${String(process.env.SITE_URL||'').replace(/\/$/,'')}/#dashboard`,note:Number(completed.warranty_days||0)>0?`Garansi aktif ${Number(completed.warranty_days)} hari sesuai ketentuan produk.`:''}));}
  return completed;
}

function amountFrom(payload){
  const n=Number(payload?.gross_amount ?? payload?.amount ?? payload?.paymentAmount);
  return Number.isFinite(n)?Math.round(n):NaN;
}

// BeliBayar membedakan base_amount (nominal invoice sebelum biaya)
// dan amount (total yang dibayar pelanggan). Jika biaya ditanggung customer,
// amount dapat lebih besar dari harga order walaupun transaksi valid.
function belibayarAmountFrom(payload){
  const base=Number(payload?.base_amount ?? payload?.baseAmount);
  if(Number.isFinite(base)&&base>0) return Math.round(base);
  const amount=Number(payload?.amount ?? payload?.paymentAmount);
  return Number.isFinite(amount)?Math.round(amount):NaN;
}

function normalizeGatewayPayload(provider,payload){
  const p=payload||{};
  if(provider==='belibayar') return {
    gatewayOrderId:String(p.reference||p.order_id||'').trim(),
    state:classifyBelibayar(p),
    status:String(p.status||'pending').toLowerCase(),
    tx:String(p.transaction_id||''),
    paymentType:String(p.payment_method||p.method||''),
    paymentChannel:String(p.payment_channel||p.channel||''),
    fraud:'', amount:belibayarAmountFrom(p)
  };
  if(provider==='duitku') return {
    gatewayOrderId:String(p.merchantOrderId||p.gateway_reference||p.gatewayOrderId||'').trim(),
    state:classifyDuitku(p),
    status:String(p.status||p.statusCode||p.resultCode||'pending').toLowerCase(),
    tx:String(p.transaction_id||p.provider_reference||p.reference||''),
    paymentType:String(p.payment_method||p.paymentMethod||''),
    paymentChannel:String(p.payment_channel||p.paymentMethod||''),
    fraud:'', amount:amountFrom(p)
  };
  return {
    gatewayOrderId:String(p.order_id||'').trim(),
    state:classifyPayment(p),
    status:String(p.transaction_status||'').toLowerCase(),
    tx:String(p.transaction_id||''),
    paymentType:String(p.payment_type||''),
    paymentChannel:String(p.bank||''),
    fraud:String(p.fraud_status||''), amount:amountFrom(p)
  };
}

const providerLabels={midtrans:'Midtrans',belibayar:'BeliBayar',duitku:'Duitku'};

export async function applyGatewayStatus(provider,payload,actor=provider){
  provider=String(provider||'').toLowerCase();
  if(!['midtrans','belibayar','duitku'].includes(provider)) throw new Error('Unsupported payment provider');
  const label=providerLabels[provider]||provider;
  const n=normalizeGatewayPayload(provider,payload);
  if(!n.gatewayOrderId) return {found:false,order:null,state:'unknown'};
  const order=await findOrderByGatewayReference(n.gatewayOrderId);
  if(!order) return {found:false,order:null,state:'unknown'};

  const mismatchNote=`Nominal pembayaran dari ${label} tidak cocok. Perlu pemeriksaan admin.`;
  if(Number.isFinite(n.amount)&&n.amount>0&&n.amount!==Number(order.total)){
    await audit(actor,'payment_amount_mismatch',order.id,{provider,gatewayOrderId:n.gatewayOrderId,amount:n.amount,expected:Number(order.total)});
    await q(`UPDATE orders SET gateway_status=$2,note=CASE WHEN POSITION($3 IN note)>0 THEN note WHEN note='' THEN $3 ELSE note || E'\n' || $3 END,updated_at=NOW() WHERE id=$1`,[order.id,n.status||'amount_mismatch',mismatchNote]);
    return {found:true,order,state:'amount_mismatch'};
  }

  // Bersihkan warning lama yang berasal dari bug perbandingan amount vs base_amount
  // setelah payload BeliBayar berikutnya terbukti memiliki nominal invoice yang benar.
  if(provider==='belibayar'&&String(order.note||'').includes(mismatchNote)){
    const cleaned=String(order.note||'').split(/\r?\n/).filter(line=>line.trim()!==mismatchNote).join('\n').trim();
    await q(`UPDATE orders SET note=$2,updated_at=NOW() WHERE id=$1`,[order.id,cleaned]);
    order.note=cleaned;
  }

  const client=await pool.connect();
  let fresh=null, shouldAutoFulfill=false, paymentJustVerified=false, auditAction='payment_status_updated';
  const auditDetail={provider,status:n.status,gatewayOrderId:n.gatewayOrderId,transactionId:n.tx,paymentType:n.paymentType,paymentChannel:n.paymentChannel,fraud:n.fraud};
  try{
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[order.id]);
    const locked=rows[0];
    if(!locked){await client.query('ROLLBACK');return {found:false,order:null,state:'unknown'};}

    await client.query(`INSERT INTO payment_attempts(gateway_order_id,order_id,provider,attempt_no,status,transaction_id,payment_url,payload,updated_at)
      VALUES($1,$2,$3,GREATEST($4,1),$5,$6,'',$7::jsonb,NOW())
      ON CONFLICT(gateway_order_id) DO UPDATE SET provider=EXCLUDED.provider,status=EXCLUDED.status,transaction_id=CASE WHEN EXCLUDED.transaction_id<>'' THEN EXCLUDED.transaction_id ELSE payment_attempts.transaction_id END,payload=EXCLUDED.payload,updated_at=NOW()`,
      [n.gatewayOrderId,locked.id,provider,Number(locked.gateway_attempt)||1,n.status,n.tx,JSON.stringify(payload||{})]);

    if(n.state==='success'){
      if(locked.status==='cancelled'){
        await client.query(`UPDATE orders SET status='review',gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_channel END,payment_submitted_at=COALESCE(payment_submitted_at,NOW()),note=CASE WHEN note='' THEN $6 ELSE note || E'\n' || $6 END,updated_at=NOW() WHERE id=$1`,[locked.id,n.status,n.tx,n.paymentType,n.paymentChannel,`Pembayaran ${label} masuk setelah order sebelumnya dibatalkan/kedaluwarsa. Admin harus memeriksa stok dan pembayaran sebelum fulfillment.`]);
        auditAction='late_payment_after_cancel';
      }else{
        paymentJustVerified=!['processing','completed'].includes(locked.status);
        await client.query(`UPDATE orders SET status=CASE WHEN status='completed' THEN 'completed' ELSE 'processing' END,gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_channel END,payment_submitted_at=COALESCE(payment_submitted_at,NOW()),payment_verified_at=COALESCE(payment_verified_at,NOW()),processing_at=CASE WHEN status='completed' THEN processing_at ELSE COALESCE(processing_at,NOW()) END,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1`,[locked.id,n.status,n.tx,n.paymentType,n.paymentChannel]);
        auditAction='payment_verified'; shouldAutoFulfill=locked.status!=='completed';
      }
    }else if(n.state==='failed'){
      if(!['processing','completed'].includes(locked.status)){
        if(locked.stock_reserved){if(locked.variant_id)await client.query('UPDATE product_variants SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[locked.variant_id,locked.quantity]);else await client.query('UPDATE products SET stock=stock+$2,updated_at=NOW() WHERE id=$1 AND stock<>-1',[locked.product_id,locked.quantity]);}
        await client.query(`UPDATE orders SET status='cancelled',gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_channel END,note=CASE WHEN note='' THEN $6 ELSE note || E'\n' || $6 END,credentials_enc='',credentials_status=CASE WHEN credentials_enc<>'' THEN 'purged' ELSE credentials_status END,stock_reserved=FALSE,updated_at=NOW() WHERE id=$1`,[locked.id,n.status,n.tx,n.paymentType,n.paymentChannel,`Pembayaran ${label} gagal, dibatalkan, atau kedaluwarsa. Jika kemudian terdapat pembayaran terlambat, order akan masuk review admin.`]);
      }else{
        await client.query(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,updated_at=NOW() WHERE id=$1`,[locked.id,n.status,n.tx]);
      }
      auditAction='payment_failed';
    }else if(n.state==='post_success_change'){
      await client.query(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,note=CASE WHEN note='' THEN $4 ELSE note || E'\n' || $4 END,updated_at=NOW() WHERE id=$1`,[locked.id,n.status,n.tx,`Status pascapembayaran ${label} berubah menjadi ${n.status}. Periksa dashboard ${label}.`]);
      auditAction='payment_post_success_change';
    }else{
      await client.query(`UPDATE orders SET gateway_status=$2,gateway_transaction_id=CASE WHEN $3<>'' THEN $3 ELSE gateway_transaction_id END,gateway_payment_method=CASE WHEN $4<>'' THEN $4 ELSE gateway_payment_method END,gateway_payment_channel=CASE WHEN $5<>'' THEN $5 ELSE gateway_payment_channel END,updated_at=NOW() WHERE id=$1`,[locked.id,n.status,n.tx,n.paymentType,n.paymentChannel]);
      auditAction='payment_pending';
    }
    fresh=(await client.query('SELECT * FROM orders WHERE id=$1',[locked.id])).rows[0];
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.release();}

  await audit(actor,auditAction,order.id,auditDetail);
  if(n.state==='failed') await refundOrderCredits(order.id,actor,'Pembayaran gateway gagal/dibatalkan/kedaluwarsa.');
  if(n.state==='success') await notifyAdmin('payment','Pembayaran terverifikasi',`${order.product_name} · ${order.id}`,order.id);
  if(n.state==='success') await notifyUser(order.user_id,'payment','Pembayaran terverifikasi',`${order.product_name} sudah dibayar dan masuk proses.`,order.id);
  if(n.state==='success'&&paymentJustVerified){
    const paidOrder=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0]||fresh||order;
    const orderUrl=`${String(process.env.SITE_URL||'').replace(/\/$/,'')}/#pesanan`;
    await sendEmail(paidOrder.email,`Pembayaran ${paidOrder.id} berhasil`,emailTemplate({title:'Pembayaran berhasil',eyebrow:'UPLY DIGITAL · PEMBAYARAN',body:`<p>Pembayaran untuk <strong>${escapeHtml(paidOrder.product_name)}</strong> sudah terverifikasi.</p><div style="margin:18px 0;padding:16px;background:#f7faff;border:1px solid #e2ebff;border-radius:12px"><div style="font-size:12px;color:#74829a">Order ID</div><strong style="color:#0f1d3a">${escapeHtml(paidOrder.id)}</strong><div style="margin-top:10px;font-size:12px;color:#74829a">Total dibayar</div><strong style="font-size:20px;color:#0b5cff">Rp${Number(paidOrder.total||0).toLocaleString('id-ID')}</strong></div><p>Pesanan sekarang masuk tahap pemrosesan.</p>`,ctaLabel:'Lihat Status Pesanan',ctaUrl:orderUrl,note:'Kamu tidak perlu mengirim bukti pembayaran untuk pembayaran otomatis.'}));
  }
  if(shouldAutoFulfill) await autoFulfillOrder(order.id,actor);
  fresh=(await q('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];
  return {found:true,order:fresh,state:n.state};
}

export async function applyMidtransStatus(payload,actor='midtrans'){return applyGatewayStatus('midtrans',payload,actor);}
export async function applyBelibayarStatus(payload,actor='belibayar'){return applyGatewayStatus('belibayar',payload,actor);}
export async function applyDuitkuStatus(payload,actor='duitku'){return applyGatewayStatus('duitku',payload,actor);}
