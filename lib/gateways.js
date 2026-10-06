import { createPayment as createMidtransPayment, getPaymentStatus as getMidtransStatus, expirePayment as expireMidtransPayment, midtransEnabled, credentialsReady as midtransCredentialsReady, environmentName as midtransEnvironment } from './midtrans.js';
import { createBelibayarPayment, getBelibayarStatus, getBelibayarChannels, probeBelibayarBackend, belibayarEnabled, credentialsReady as belibayarCredentialsReady, ipWhitelistReady as belibayarIpWhitelistReady, environmentName as belibayarEnvironment, paymentMethod as belibayarPaymentMethod, paymentChannel as belibayarPaymentChannel } from './belibayar.js';
import { createDuitkuPayment, getDuitkuStatus, duitkuEnabled, credentialsReady as duitkuCredentialsReady, environmentName as duitkuEnvironment, paymentMethod as duitkuPaymentMethod } from './duitku.js';

export const AUTO_GATEWAYS=['midtrans','belibayar','duitku'];
export function isAutomaticGateway(provider){return AUTO_GATEWAYS.includes(String(provider||'').toLowerCase());}
export function gatewayLabel(provider){return ({midtrans:'Midtrans',belibayar:'BeliBayar',duitku:'Duitku'})[provider]||provider;}
export function gatewayReady(provider){
  if(provider==='midtrans') return midtransEnabled();
  if(provider==='belibayar') return belibayarEnabled();
  if(provider==='duitku') return duitkuEnabled();
  return false;
}
export function gatewayHealth(){
  return {
    midtrans:{label:'Midtrans',configured:midtransCredentialsReady(),ready:midtransEnabled(),environment:midtransEnvironment(),requiresStaticIp:false,note:'Snap/API otomatis. Aktifkan hanya jika merchant dan Server Key sudah siap.'},
    belibayar:{label:'BeliBayar',configured:belibayarCredentialsReady(),ready:belibayarEnabled(),environment:belibayarEnvironment(),requiresStaticIp:true,ipWhitelistReady:belibayarIpWhitelistReady(),note:'V31 mengirim BeliBayar melalui Windows backend static IP. Vercel tidak menyimpan API Key/Secret BeliBayar; hanya URL dan backend key server-to-server.'},
    duitku:{label:'Duitku',configured:duitkuCredentialsReady(),ready:duitkuEnabled(),environment:duitkuEnvironment(),requiresStaticIp:false,note:'API otomatis. Pastikan Merchant Code, API Key, callback URL, dan metode pembayaran aktif.'}
  };
}
export async function probeGatewayConnectivity(provider){
  if(provider==='belibayar') return probeBelibayarBackend();
  return {ok:gatewayReady(provider),status:0,auth:true,message:gatewayReady(provider)?'Gateway siap.':'Gateway belum siap.'};
}
export async function getGatewayChannels(provider){
  if(provider==='belibayar') return getBelibayarChannels();
  return [];
}
export function defaultGatewayMethod(provider){
  if(provider==='midtrans') return {method:'snap',channel:'MIDTRANS'};
  if(provider==='belibayar') return {method:belibayarPaymentMethod(),channel:belibayarPaymentChannel()||'BELIBAYAR'};
  if(provider==='duitku') return {method:duitkuPaymentMethod(),channel:duitkuPaymentMethod()};
  return {method:'',channel:''};
}
export async function createGatewayPayment(provider,order,gatewayOrderId){
  if(provider==='midtrans') return createMidtransPayment(order,gatewayOrderId);
  if(provider==='belibayar') return createBelibayarPayment(order,gatewayOrderId);
  if(provider==='duitku') return createDuitkuPayment(order,gatewayOrderId);
  throw new Error('Gateway tidak didukung.');
}
export async function getGatewayStatus(provider,gatewayOrderId){
  if(provider==='midtrans') return getMidtransStatus(gatewayOrderId);
  if(provider==='belibayar') return getBelibayarStatus(gatewayOrderId);
  if(provider==='duitku') return getDuitkuStatus(gatewayOrderId);
  throw new Error('Gateway tidak didukung.');
}
export async function expireGatewayPayment(provider,gatewayOrderId){
  if(provider==='midtrans') return expireMidtransPayment(gatewayOrderId);
  return null;
}
export function normalizedCreatedPayment(provider,data={}){
  if(provider==='midtrans') return {paymentUrl:String(data.redirect_url||''),transactionId:String(data.transaction_id||''),method:'snap',channel:'MIDTRANS',status:'pending'};
  if(provider==='belibayar') return {paymentUrl:String(data.paymentUrl||data.payment_url||(String(data.payment_method||data.method||'qris').toLowerCase()==='qris'?(data.qrUrl||data.qr_url||''):'')),transactionId:String(data.transactionId||data.transaction_id||''),method:String(data.payment_method||data.method||'qris'),channel:String(data.payment_channel||data.channel||(String(data.payment_method||data.method||'qris').toLowerCase()==='qris'?'QRIS':'')),status:String(data.status||'pending')};
  if(provider==='duitku') return {paymentUrl:String(data.payment_url||data.paymentUrl||data.appUrl||''),transactionId:String(data.transaction_id||data.reference||''),method:String(data.payment_method||data.paymentMethod||''),channel:String(data.payment_channel||data.paymentMethod||''),status:String(data.status||'pending')};
  return {paymentUrl:'',transactionId:'',method:'',channel:'',status:'pending'};
}
export function normalizedStatus(provider,data={}){
  if(provider==='midtrans') return {status:String(data.transaction_status||''),transactionId:String(data.transaction_id||''),method:String(data.payment_type||''),channel:String(data.bank||'')};
  if(provider==='belibayar') return {status:String(data.status||''),transactionId:String(data.transactionId||data.transaction_id||''),method:String(data.payment_method||data.method||'qris'),channel:String(data.payment_channel||data.channel||'QRIS')};
  if(provider==='duitku') return {status:String(data.status||data.statusCode||''),transactionId:String(data.transaction_id||data.reference||''),method:String(data.payment_method||data.paymentMethod||''),channel:String(data.payment_channel||data.paymentMethod||'')};
  return {status:'',transactionId:'',method:'',channel:''};
}
