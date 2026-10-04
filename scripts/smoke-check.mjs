import fs from 'fs';
const required=[
  'index.html','app.js','styles.css','vercel.json','package.json',
  'api/uply.js','api/health.js','api/payment-webhook.js','api/product-image.js',
  'lib/db.js','lib/security.js','lib/midtrans.js','lib/payment-state.js',
  'assets/products/netflix.svg','assets/products/google-ai.svg','assets/products/youtube.svg',
  'assets/products/stars-6400.svg','assets/products/stars-12800.svg','assets/products/stars-19200.svg','assets/products/imei.svg'
];
let ok=true;
for(const f of required){ if(!fs.existsSync(new URL('../'+f, import.meta.url))){ console.error('MISSING',f); ok=false; } }
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
for(const marker of ['/api/uply']){ if(!app.includes(marker)){ console.error('APP MARKER MISSING',marker); ok=false; } }
const health=fs.readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
if(!health.includes("hosting:'vercel'")){ console.error('Health hosting marker missing'); ok=false; }
if(!ok) process.exit(1);
console.log('Smoke check OK');
