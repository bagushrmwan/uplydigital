import crypto from 'crypto';

export function paymentMode(){ return String(process.env.PAYMENT_MODE || 'manual').trim().toLowerCase(); }
export function serverKeyReady(){ return String(process.env.MIDTRANS_SERVER_KEY || '').trim().length > 8; }
export function midtransEnabled(){ return paymentMode() === 'midtrans' && serverKeyReady(); }
export function isProduction(){ return String(process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() === 'true'; }

function authHeader(){
  const key = String(process.env.MIDTRANS_SERVER_KEY || '').trim();
  if (!key) throw midtransError('MIDTRANS_SERVER_KEY belum diatur di Vercel.', 500, 'CONFIG');
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}
function snapBase(){ return isProduction() ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'; }
function apiBase(){ return isProduction() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'; }
export function notificationUrl(){
  const explicit = String(process.env.MIDTRANS_NOTIFICATION_URL || '').trim();
  if (/^https:\/\//i.test(explicit)) return explicit.replace(/\/$/, '');
  const site = String(process.env.SITE_URL || '').trim().replace(/\/$/, '');
  return /^https:\/\//i.test(site) ? `${site}/api/payment-webhook` : '';
}
function midtransError(message, status=502, code='MIDTRANS_ERROR'){
  const e = new Error(message); e.safe = true; e.status = status; e.code = code; return e;
}
async function fetchWithTimeout(url, options={}, timeoutMs=15000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, {...options, signal: controller.signal}); }
  catch (e) {
    if (e?.name === 'AbortError') throw midtransError('Koneksi ke Midtrans timeout. Silakan coba lagi.', 504, 'TIMEOUT');
    throw midtransError('Tidak dapat terhubung ke Midtrans. Periksa koneksi dan konfigurasi.', 502, 'NETWORK');
  } finally { clearTimeout(timer); }
}
function sanitizeMessage(data, fallback){
  const msgs = Array.isArray(data?.error_messages) ? data.error_messages : [];
  const raw = msgs.join(', ') || data?.status_message || data?.message || fallback;
  return String(raw || fallback).slice(0, 500);
}
function validateOrderId(orderId){
  const id = String(orderId || '');
  if (!/^[A-Za-z0-9._~-]{1,50}$/.test(id)) throw midtransError('ID transaksi Midtrans tidak valid.', 400, 'ORDER_ID');
  return id;
}

export async function createSnap(order){
  const orderId = validateOrderId(order.id);
  const total = Number(order.total);
  const price = Number(order.price);
  const quantity = Number(order.quantity);
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(price) || price < 1 || !Number.isInteger(quantity) || quantity < 1) {
    throw midtransError('Nominal transaksi Midtrans tidak valid.', 400, 'AMOUNT');
  }
  const body = {
    transaction_details: { order_id: orderId, gross_amount: total },
    customer_details: {
      first_name: String(order.name || 'Pelanggan').slice(0, 50),
      email: String(order.email || '').slice(0, 190),
      phone: String(order.phone || '') || undefined
    },
    item_details: [{
      id: String(order.product_id || 'product').slice(0, 50),
      price,
      quantity,
      name: String(order.product_name || 'Produk Uply Digital').slice(0, 50)
    }],
    credit_card: { secure: true }
  };
  const site = String(process.env.SITE_URL || '').trim().replace(/\/$/, '');
  const localOrderId = String(order.callback_order_id || order.local_order_id || order.id || '');
  if (/^https:\/\//i.test(site) && localOrderId) {
    body.callbacks = { finish: `${site}/?payment_return=${encodeURIComponent(localOrderId)}#pesanan/${encodeURIComponent(localOrderId)}` };
  }
  const headers = {
    'Accept':'application/json',
    'Content-Type':'application/json',
    'Authorization': authHeader()
  };
  const notify = notificationUrl();
  if (notify) headers['X-Override-Notification'] = notify;

  const r = await fetchWithTimeout(`${snapBase()}/snap/v1/transactions`, {
    method:'POST', headers, body:JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.redirect_url) {
    const message = sanitizeMessage(data, `Midtrans menolak transaksi (HTTP ${r.status}).`);
    if (r.status === 401) throw midtransError('Server Key Midtrans tidak valid atau tidak sesuai mode Sandbox/Production.', 502, 'AUTH');
    throw midtransError(message, 502, 'CREATE');
  }
  return data;
}

export async function getTransactionStatus(orderId){
  const id = validateOrderId(orderId);
  const r = await fetchWithTimeout(`${apiBase()}/v2/${encodeURIComponent(id)}/status`, {
    method:'GET',
    headers:{'Accept':'application/json','Content-Type':'application/json','Authorization':authHeader()}
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (String(data.status_code || '').startsWith('4') && !data.transaction_status)) {
    if (r.status === 401) throw midtransError('Server Key Midtrans tidak valid atau tidak sesuai mode Sandbox/Production.', 502, 'AUTH');
    throw midtransError(sanitizeMessage(data, `Status pembayaran tidak dapat diperiksa (HTTP ${r.status}).`), 502, 'STATUS');
  }
  return data;
}

export function classifyTransaction(body){
  const status = String(body?.transaction_status || '').toLowerCase();
  const fraud = String(body?.fraud_status || '').toLowerCase();
  const statusCode = String(body?.status_code || '');
  if ((status === 'settlement' || status === 'capture') && statusCode === '200' && (!fraud || fraud === 'accept')) return 'success';
  if (['expire','cancel','deny','failure'].includes(status)) return 'failed';
  if (['refund','partial_refund','chargeback','partial_chargeback'].includes(status)) return 'review';
  return 'pending';
}

export function verifyNotification(body){
  const key = String(process.env.MIDTRANS_SERVER_KEY || '');
  const input = `${body.order_id || ''}${body.status_code || ''}${body.gross_amount || ''}${key}`;
  const expected = crypto.createHash('sha512').update(input).digest('hex');
  const actual = String(body.signature_key || '');
  return expected.length === actual.length && expected.length > 0 && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
