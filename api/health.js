import { dbReady, ensureSchema, q } from '../lib/db.js';
import { securityReady, credentialSecurityReady } from '../lib/security.js';
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  try{
    if(!dbReady()) return res.status(500).end(JSON.stringify({ok:false,database:'missing',message:'DATABASE_URL belum diatur.'}));
    if(!securityReady()) return res.status(500).end(JSON.stringify({ok:false,database:'configured',sessionSecret:'missing',message:'SESSION_SECRET minimal 32 karakter belum diatur.'}));
    await ensureSchema(); const x=await q('SELECT NOW() AS now');
    res.status(200).end(JSON.stringify({ok:true,backend:'connected',database:'connected',time:x.rows[0].now,paymentMode:String(process.env.PAYMENT_MODE||'manual').toLowerCase(),credentialEncryption:credentialSecurityReady()?'configured':'missing'}));
  }catch(e){res.status(500).end(JSON.stringify({ok:false,backend:'error',message:e.message}));}
}
