import { q, pool, audit } from './db.js';

export function tierFromStats(completedCount=0, spent=0){
  const c=Number(completedCount)||0, s=Number(spent)||0;
  if(c>=30 || s>=3000000) return 'vip';
  if(c>=10 || s>=1000000) return 'reseller';
  if(c>=3 || s>=250000) return 'member';
  return 'customer';
}

export async function syncMembership(userId, actor='system'){
  if(!userId) return null;
  const {rows}=await q(`SELECT u.id,u.membership_tier,u.membership_manual,
    COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_count,
    COALESCE(SUM(CASE WHEN o.status='completed' THEN COALESCE(NULLIF(o.subtotal,0),o.price*o.quantity)-o.discount ELSE 0 END),0)::bigint AS spent
    FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.id=$1 GROUP BY u.id`,[userId]);
  const u=rows[0]; if(!u) return null;
  const setting=await q("SELECT value FROM settings WHERE key='autoRoleEnabled' LIMIT 1");
  const autoEnabled=!setting.rows[0] || String(setting.rows[0].value).toLowerCase()==='true';
  const suggested=tierFromStats(u.completed_count,u.spent);
  if(autoEnabled && !u.membership_manual && u.membership_tier!==suggested){
    await q('UPDATE users SET membership_tier=$2,updated_at=NOW() WHERE id=$1',[userId,suggested]);
    await audit(actor,'membership_auto_updated',userId,{from:u.membership_tier,to:suggested,completed:Number(u.completed_count),spent:Number(u.spent)});
  }
  return {tier:(u.membership_manual||!autoEnabled)?u.membership_tier:suggested,suggested,manual:!!u.membership_manual,autoEnabled,completed:Number(u.completed_count),spent:Number(u.spent)};
}

export async function notifyAdmin(kind,title,message='',recordId=''){
  try{await q('INSERT INTO admin_notifications(kind,title,message,record_id) VALUES($1,$2,$3,$4)',[String(kind||'info').slice(0,30),String(title||'Notifikasi').slice(0,160),String(message||'').slice(0,600),String(recordId||'').slice(0,120)]);}catch{}
}


export async function notifyUser(userId,kind,title,message='',recordId=''){
  try{await q('INSERT INTO customer_notifications(user_id,kind,title,message,record_id) VALUES($1,$2,$3,$4,$5)',[String(userId||''),String(kind||'info').slice(0,30),String(title||'Notifikasi').slice(0,160),String(message||'').slice(0,600),String(recordId||'').slice(0,120)]);}catch{}
}

export async function refundOrderCredits(orderId,actor='system',reason='Order dibatalkan'){
  const client=await pool.connect(); let refunded=0,userId='';let voucher='';
  try{
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT id,user_id,balance_used,voucher_code,credit_refunded FROM orders WHERE id=$1 FOR UPDATE',[orderId]);
    const o=rows[0]; if(!o){await client.query('ROLLBACK');return {refunded:0};}
    if(o.credit_refunded){await client.query('ROLLBACK');return {refunded:0,already:true};}
    userId=o.user_id;voucher=o.voucher_code||'';refunded=Number(o.balance_used||0);
    if(refunded>0){
      await client.query('UPDATE users SET balance=balance+$2,updated_at=NOW() WHERE id=$1',[userId,refunded]);
      await client.query(`INSERT INTO balance_ledger(user_id,amount,type,reference,note,actor) VALUES($1,$2,'refund',$3,$4,$5)`,[userId,refunded,orderId,String(reason).slice(0,300),actor]);
    }
    if(voucher) await client.query('DELETE FROM voucher_usages WHERE order_id=$1',[orderId]);
    await client.query('UPDATE orders SET credit_refunded=TRUE,updated_at=NOW() WHERE id=$1',[orderId]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  if(refunded||voucher) await audit(actor,'order_credits_released',orderId,{balanceRefunded:refunded,voucher});
  return {refunded,voucher,userId};
}
