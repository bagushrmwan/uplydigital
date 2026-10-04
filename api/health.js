import { ensureSchema,q,getSettings } from '../lib/db.js';
import { paymentMode,midtransEnabled,credentialsReady,isProduction,environmentName,keyEnvironment } from '../lib/midtrans.js';
export default async function handler(req,res){
  try{
    await ensureSchema(); await q('SELECT 1');
    const [settings,banks]=await Promise.all([getSettings(),q('SELECT COUNT(*)::int AS n FROM banks WHERE active=TRUE')]);
    const mode=paymentMode();
    const manualReady=String(settings.manualPaymentEnabled||'true').toLowerCase()==='true' && (Number(banks.rows[0]?.n||0)>0 || !!settings.qrisImageData);
    const gatewayReady=String(settings.midtransPaymentEnabled||'true').toLowerCase()==='true' && midtransEnabled();
    const payment={
      mode,
      provider:gatewayReady&&manualReady?'multi':gatewayReady?'midtrans':'manual',
      ready:gatewayReady||manualReady,
      midtransReady:gatewayReady,
      manualReady,
      qrisManualReady:!!settings.qrisImageData,
      credentials:credentialsReady()?'configured':'missing-or-mismatch',
      keyEnvironment:keyEnvironment(),
      environment:environmentName(),
      production:isProduction(),
      requiresStaticIp:false,
      notificationPath:'/api/payment-webhook'
    };
    return res.status(200).json({ok:payment.ready,backend:'connected',database:'connected',hosting:'vercel',version:'25',payment});
  }catch(e){return res.status(500).json({ok:false,error:String(e.message||e)})}
}
