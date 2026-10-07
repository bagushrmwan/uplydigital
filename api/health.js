import { ensureSchema,q,getSettings } from '../lib/db.js';
import { paymentMode } from '../lib/midtrans.js';
import { gatewayHealth, probeGatewayConnectivity, getGatewayChannels } from '../lib/gateways.js';
import { emailHealth, probeEmailBackend } from '../lib/email.js';
function bool(v){return v===true||String(v).toLowerCase()==='true';}
export default async function handler(req,res){
  try{
    await ensureSchema(); await q('SELECT 1');
    const [settings,banks]=await Promise.all([getSettings(),q('SELECT COUNT(*)::int AS n FROM banks WHERE active=TRUE')]);
    const mode=paymentMode(),health=gatewayHealth();
    const emailProbe=await probeEmailBackend();
    const belibayarProbe=health.belibayar.configured&&health.belibayar.ready
      ? await probeGatewayConnectivity('belibayar')
      : {ok:false,status:0,auth:false,message:'BeliBayar belum dikonfigurasi/ready.'};
    let belibayarChannels=[];
    if(belibayarProbe.ok){
      try{belibayarChannels=await getGatewayChannels('belibayar');}catch{}
    }
    const transferManualReady=bool(settings.manualPaymentEnabled) && Number(banks.rows[0]?.n||0)>0;
    const qrisManualReady=bool(settings.qrisManualPaymentEnabled) && !!settings.qrisImageData;
    const manualReady=transferManualReady||qrisManualReady;
    const enabled={midtrans:bool(settings.midtransPaymentEnabled)&&health.midtrans.ready,belibayar:bool(settings.belibayarPaymentEnabled)&&health.belibayar.ready,duitku:bool(settings.duitkuPaymentEnabled)&&health.duitku.ready};
    const automaticReady=Object.values(enabled).some(Boolean);
    const payment={mode,provider:[...Object.entries(enabled).filter(([,v])=>v).map(([k])=>k),...(transferManualReady?['manual']:[]),...(qrisManualReady?['qris_manual']:[])].join('+')||'none',ready:automaticReady||manualReady,automaticReady,manualReady,transferManualReady,qrisManualReady,qrisManualConfigured:!!settings.qrisImageData,qrisManualEnabled:bool(settings.qrisManualPaymentEnabled),gateways:{midtrans:{...health.midtrans,enabled:bool(settings.midtransPaymentEnabled)},belibayar:{...health.belibayar,enabled:bool(settings.belibayarPaymentEnabled),runtimeConnected:belibayarProbe.ok,backendAuth:belibayarProbe.auth,providerConnected:belibayarProbe.providerConnected,backendHttpStatus:belibayarProbe.status,runtimeMessage:belibayarProbe.message,apiOrigin:belibayarProbe.apiOrigin||'',activeChannels:belibayarChannels.map(c=>({code:c.code,name:c.name,method:c.method}))},duitku:{...health.duitku,enabled:bool(settings.duitkuPaymentEnabled)}},notifications:{midtrans:'/api/payment-webhook',belibayarWindows:'https://uplyapi.duckdns.org/api/belibayar-webhook',belibayarRelay:'/api/belibayar-relay',duitku:'/api/duitku-webhook'}};
    const schema=await q(`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name='balance') OR (table_name='orders' AND column_name IN ('subtotal','discount','voucher_code','balance_used','variant_id','variant_name')) OR (table_name='products' AND column_name='low_stock_threshold') OR (table_name='inventory' AND column_name='variant_id'))`);
    const variants=await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='product_variants'`);
    const media=await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='product_media'`);
    const checkoutSchemaReady=Number(schema.rows[0]?.n||0)>=9&&Number(variants.rows[0]?.n||0)===1;
    const gallerySystemReady=Number(media.rows[0]?.n||0)===1;
    const growth=await q(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('warranty_claims','customer_notifications')`);
    const growthSuiteReady=Number(growth.rows[0]?.n||0)===2;
    return res.status(200).json({ok:payment.ready&&checkoutSchemaReady&&gallerySystemReady&&growthSuiteReady,backend:'connected',database:'connected',hosting:'vercel',version:'32.4',checkoutSchemaReady,variantSystemReady:Number(variants.rows[0]?.n||0)===1,gallerySystemReady,growthSuiteReady,email:{...emailHealth(),runtimeConnected:emailProbe.ok,runtimeStatus:emailProbe.status,staticEgress:emailProbe.staticEgress===true,runtimeMessage:emailProbe.message||''},payment});
  }catch(e){return res.status(500).json({ok:false,error:String(e.message||e)})}
}
