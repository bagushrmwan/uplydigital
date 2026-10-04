import { ensureSchema,q } from '../lib/db.js';
import { paymentMode,midtransEnabled,credentialsReady,isProduction,environmentName,keyEnvironment } from '../lib/midtrans.js';
export default async function handler(req,res){
  try{
    await ensureSchema(); await q('SELECT 1');
    const mode=paymentMode();
    const payment={
      mode,
      provider:mode==='midtrans'?'midtrans':'manual',
      ready:mode==='manual'||midtransEnabled(),
      credentials:credentialsReady()?'configured':'missing-or-mismatch',
      keyEnvironment:keyEnvironment(),
      environment:environmentName(),
      production:isProduction(),
      requiresStaticIp:false,
      notificationPath:'/api/payment-webhook'
    };
    return res.status(200).json({ok:payment.ready,backend:'connected',database:'connected',hosting:'vercel',payment});
  }catch(e){return res.status(500).json({ok:false,error:String(e.message||e)})}
}
