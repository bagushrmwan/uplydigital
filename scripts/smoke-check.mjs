import fs from 'fs';
const required=[
  'index.html','app.js','styles.css','market.css','vercel.json','package.json',
  'api/uply.js','api/health.js','api/payment-webhook.js','api/product-image.js','api/qris-image.js',
  'lib/db.js','lib/security.js','lib/midtrans.js','lib/payment-state.js','lib/business.js',
  'assets/products/netflix.svg','assets/products/google-ai.svg','assets/products/youtube.svg',
  'assets/products/stars-6400.svg','assets/products/stars-12800.svg','assets/products/stars-19200.svg','assets/products/imei.svg'
];
let ok=true;
for(const f of required){ if(!fs.existsSync(new URL('../'+f, import.meta.url))){ console.error('MISSING',f); ok=false; } }
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
for(const marker of ['/api/uply']){ if(!app.includes(marker)){ console.error('APP MARKER MISSING',marker); ok=false; } }
const health=fs.readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
if(!health.includes("hosting:'vercel'")){ console.error('Health hosting marker missing'); ok=false; }

const api=fs.readFileSync(new URL('../api/uply.js',import.meta.url),'utf8');
for(const marker of ['saveVoucher','adjustBalance','setCustomerTier','validateVoucher','markNotificationsRead']){ if(!api.includes(marker)){console.error('API FEATURE MISSING',marker);ok=false;} }
for(const marker of ['Smart Voucher System','Balance System','Reporting System','Role Connector Otomatis']){ if(!app.includes(marker)){console.error('UI FEATURE MISSING',marker);ok=false;} }
const db=fs.readFileSync(new URL('../lib/db.js',import.meta.url),'utf8');
for(const marker of ['CREATE TABLE IF NOT EXISTS vouchers','CREATE TABLE IF NOT EXISTS balance_ledger','CREATE TABLE IF NOT EXISTS admin_notifications']){if(!db.includes(marker)){console.error('DB FEATURE MISSING',marker);ok=false;}}

for(const marker of ['checkout-qty-stepper','data-checkout-minus','checkoutPreflight','data-product-thumb']){ if(!app.includes(marker)){console.error('HOTFIX UI MISSING',marker);ok=false;} }
if(api.includes('`${prod.name} · ${name} ·')){console.error('LEGACY CHECKOUT SCOPE BUG STILL PRESENT');ok=false;}
if(!api.includes("`${prod.name} · ${order.name} ·")){console.error('ORDER NAME HOTFIX MISSING');ok=false;}

if(!ok) process.exit(1);
console.log('Smoke check OK');
