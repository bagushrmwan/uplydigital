import fs from 'fs';
const required=[
  'index.html','app.js','styles.css','market.css','vercel.json','package.json',
  'api/uply.js','api/health.js','api/payment-webhook.js','api/belibayar-webhook.js','api/belibayar-relay.js','api/duitku-webhook.js','api/product-image.js','api/product-media-image.js','api/qris-image.js',
  'lib/db.js','lib/security.js','lib/midtrans.js','lib/belibayar.js','lib/duitku.js','lib/gateways.js','lib/payment-state.js','lib/business.js',
  'assets/products/netflix.svg','assets/products/google-ai.svg','assets/products/youtube.svg',
  'assets/products/stars-6400.svg','assets/products/stars-12800.svg','assets/products/stars-19200.svg','assets/products/imei.svg'
];
let ok=true;
for(const f of required){ if(!fs.existsSync(new URL('../'+f, import.meta.url))){ console.error('MISSING',f); ok=false; } }
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
for(const marker of ['/api/uply']){ if(!app.includes(marker)){ console.error('APP MARKER MISSING',marker); ok=false; } }
const health=fs.readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
if(!health.includes("hosting:'vercel'")){ console.error('Health hosting marker missing'); ok=false; }
if(!health.includes("version:'31.4'")){ console.error('V31.4 health version missing'); ok=false; }

const api=fs.readFileSync(new URL('../api/uply.js',import.meta.url),'utf8');
for(const marker of ['saveVoucher','adjustBalance','setCustomerTier','validateVoucher','markNotificationsRead']){ if(!api.includes(marker)){console.error('API FEATURE MISSING',marker);ok=false;} }
for(const marker of ['saveProductVariant','deleteProductVariant','adjustVariantStock','resolveVariant','variantId','deleteProduct','restoreProduct','saveProductMedia','deleteProductMedia','publicMedia']){ if(!api.includes(marker)){console.error('V27 VARIANT API MISSING',marker);ok=false;} }
for(const marker of ['Smart Voucher System','Balance System','Reporting System','Role Connector Otomatis']){ if(!app.includes(marker)){console.error('UI FEATURE MISSING',marker);ok=false;} }
for(const marker of ['variant-section','data-manage-variants','variantForm','variantStockForm','productPriceText','data-manage-gallery','productMediaForm','data-gallery-select']){ if(!app.includes(marker)){console.error('V27 VARIANT UI MISSING',marker);ok=false;} }
const db=fs.readFileSync(new URL('../lib/db.js',import.meta.url),'utf8');
for(const marker of ['CREATE TABLE IF NOT EXISTS vouchers','CREATE TABLE IF NOT EXISTS balance_ledger','CREATE TABLE IF NOT EXISTS admin_notifications']){if(!db.includes(marker)){console.error('DB FEATURE MISSING',marker);ok=false;}}
for(const marker of ['CREATE TABLE IF NOT EXISTS product_variants','ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_id','ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant_id','CREATE TABLE IF NOT EXISTS product_media']){if(!db.includes(marker)){console.error('V27 VARIANT DB MISSING',marker);ok=false;}}

for(const marker of ['checkout-qty-stepper','data-checkout-minus','checkoutPreflight','data-product-thumb']){ if(!app.includes(marker)){console.error('HOTFIX UI MISSING',marker);ok=false;} }
if(api.includes('`${prod.name} · ${name} ·')){console.error('LEGACY CHECKOUT SCOPE BUG STILL PRESENT');ok=false;}
if(!api.includes('order.name')){console.error('ORDER NAME HOTFIX MISSING');ok=false;}

for(const marker of ['function accountPage()','profileForm','passwordForm','data-logout-all','#akun']){if(!app.includes(marker)){console.error('V26 ACCOUNT UX MISSING',marker);ok=false;}}
for(const marker of ["action==='updateProfile'","action==='changePassword'","action==='logoutAll'"]){if(!api.includes(marker)){console.error('V26 ACCOUNT API MISSING',marker);ok=false;}}
const market=fs.readFileSync(new URL('../market.css',import.meta.url),'utf8');
for(const marker of ['UPLY DIGITAL V26','--uply-primary:#0b5cff','.v18-buy-box .btn.dark','.account-layout-v26','UPLY DIGITAL V27 — PRODUCT VARIANT SYSTEM','.variant-card']){if(!market.includes(marker)){console.error('BRAND/VARIANT CSS MISSING',marker);ok=false;}}

if(!ok) process.exit(1);
for(const marker of ['warranty_claims','customer_notifications','warranty_days','cost_price','sale_price']){if(!db.includes(marker)){console.error('V29 DB FEATURE MISSING',marker);ok=false;}}
for(const marker of ['paymentMethodsPage','warrantyCenterPage','claimForm','adminClaimForm','data-admin-sync-payment','#pembayaran','#garansi']){if(!app.includes(marker)){console.error('V29 UI FEATURE MISSING',marker);ok=false;}}
for(const marker of ["action==='claims'","action==='createWarrantyClaim'","action==='updateWarrantyClaim'","action==='adminSyncPayment'"]){if(!api.includes(marker)){console.error('V29 API FEATURE MISSING',marker);ok=false;}}
if(!ok) process.exit(1);
for(const marker of ['belibayarPaymentEnabled','duitkuPaymentEnabled','createAutomaticPaymentForOrder','applyGatewayStatus']){if(!api.includes(marker)){console.error('V30 MULTI GATEWAY API MISSING',marker);ok=false;}}
for(const marker of ['automaticPaymentIds','belibayarPaymentEnabled','duitkuPaymentEnabled','gatewayHealth']){if(!app.includes(marker)){console.error('V30 MULTI GATEWAY UI MISSING',marker);ok=false;}}
if(!ok) process.exit(1);
for(const marker of ['BELIBAYAR_BACKEND_URL','BELIBAYAR_BACKEND_KEY','BELIBAYAR_BACKEND_READY']){if(!fs.readFileSync(new URL('../lib/belibayar.js',import.meta.url),'utf8').includes(marker)){console.error('V31 WINDOWS BACKEND MARKER MISSING',marker);ok=false;}}
const relay=fs.readFileSync(new URL('../api/belibayar-relay.js',import.meta.url),'utf8');
for(const marker of ['UPLY_RELAY_KEY','applyBelibayarStatus','x-uply-relay-key']){if(!relay.includes(marker)){console.error('V31 RELAY MISSING',marker);ok=false;}}
if(!app.includes('scheduleAutomaticPaymentPoll')){console.error('V31 AUTO PAYMENT POLLING MISSING');ok=false;}

for(const marker of ['belibayarAutoInitializedV311','duitkuAutoInitializedV311']){if(!db.includes(marker)){console.error('V31.1 GATEWAY AUTO INIT MISSING',marker);ok=false;}}
for(const marker of ['gateway-manager','gateway-toggle-card','Aktif / Nonaktif Metode Otomatis']){if(!app.includes(marker)){console.error('V31.1 GATEWAY ADMIN UI MISSING',marker);ok=false;}}
if(!ok) process.exit(1);
for(const marker of ['qrisManualPaymentEnabled','manual-toggle-card','QRIS Manual']){if(!app.includes(marker)){console.error('V31.2 QRIS MANUAL TOGGLE UI MISSING',marker);ok=false;}}
if(!api.includes('qrisManualPaymentEnabled')){console.error('V31.2 QRIS MANUAL API SETTING MISSING');ok=false;}
if(!db.includes("qrisManualPaymentEnabled:'true'")){console.error('V31.2 QRIS MANUAL DEFAULT MISSING');ok=false;}
if(!market.includes('UPLY DIGITAL V31.2 — BALANCED LIGHT/DARK + QRIS MANUAL TOGGLE')){console.error('V31.2 THEME CONTRAST PATCH MISSING');ok=false;}
if(!ok) process.exit(1);
if(!app.includes("const qrisBlock=hasQrisManual?")){console.error('V31.3 QRIS MANUAL CONDITIONAL RENDER MISSING');ok=false;}
if(!market.includes('[hidden]{display:none!important}')){console.error('V31.3 HIDDEN HARDENING MISSING');ok=false;}
const belibayar=fs.readFileSync(new URL('../lib/belibayar.js',import.meta.url),'utf8');
if(!belibayar.includes('probeBelibayarBackend')){console.error('V31.3 BELIBAYAR PROBE MISSING');ok=false;}
if(!health.includes('runtimeConnected')){console.error('V31.3 BELIBAYAR RUNTIME HEALTH MISSING');ok=false;}
if(!ok) process.exit(1);
if(!belibayar.includes('flattenMessage')||!belibayar.includes('providerMessage')){console.error('V31.4 BELIBAYAR ERROR NORMALIZER MISSING');ok=false;}
if(!app.includes('readableError')){console.error('V31.4 FRONTEND ERROR NORMALIZER MISSING');ok=false;}
if(!ok) process.exit(1);
console.log('Smoke check OK — V31.4 BeliBayar error handling + V31.3 payment visibility ready');
