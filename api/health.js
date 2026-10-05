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
    const schema=await q(`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name='balance') OR (table_name='orders' AND column_name IN ('subtotal','discount','voucher_code','balance_used','variant_id','variant_name')) OR (table_name='products' AND column_name='low_stock_threshold') OR (table_name='inventory' AND column_name='variant_id'))`);
    const variants=await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='product_variants'`);
    const media=await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='product_media'`);
    const checkoutSchemaReady=Number(schema.rows[0]?.n||0)>=9&&Number(variants.rows[0]?.n||0)===1;
    const gallerySystemReady=Number(media.rows[0]?.n||0)===1;
    const growth=await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('warranty_claims','customer_notifications')`);
    const growthSuiteReady=Number(growth.rows[0]?.n||0)===2;
    return res.status(200).json({ok:payment.ready&&checkoutSchemaReady&&gallerySystemReady&&growthSuiteReady,backend:'connected',database:'connected',hosting:'vercel',version:'29.0',checkoutSchemaReady,variantSystemReady:Number(variants.rows[0]?.n||0)===1,gallerySystemReady,growthSuiteReady,payment});
  }catch(e){return res.status(500).json({ok:false,error:String(e.message||e)})}
}
