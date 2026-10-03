import { dbReady, ensureSchema, q } from '../lib/db.js';
import { securityReady, credentialSecurityReady } from '../lib/security.js';
import { paymentMode, midtransEnabled, serverKeyReady, isProduction, notificationUrl } from '../lib/midtrans.js';

export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  try{
    if(!dbReady()) return res.status(500).end(JSON.stringify({ok:false,database:'missing',message:'DATABASE_URL belum diatur.'}));
    if(!securityReady()) return res.status(500).end(JSON.stringify({ok:false,database:'configured',sessionSecret:'missing',message:'SESSION_SECRET minimal 32 karakter belum diatur.'}));
    await ensureSchema(); const x=await q('SELECT NOW() AS now');
    const mode=paymentMode()==='midtrans'?'midtrans':'manual';
    const payment={
      mode,
      ready:mode==='manual'||midtransEnabled(),
      serverKey:serverKeyReady()?'configured':'missing',
      environment:isProduction()?'production':'sandbox',
      notificationUrl:notificationUrl()||'missing'
    };
    const ok=payment.ready;
    res.status(ok?200:500).end(JSON.stringify({
      ok,backend:'connected',database:'connected',time:x.rows[0].now,payment,
      credentialEncryption:credentialSecurityReady()?'configured':'missing',
      message:ok?'Semua koneksi utama siap.':'PAYMENT_MODE=midtrans tetapi konfigurasi Midtrans belum lengkap.'
    }));
  }catch(e){res.status(500).end(JSON.stringify({ok:false,backend:'error',message:e.message}));}
}
