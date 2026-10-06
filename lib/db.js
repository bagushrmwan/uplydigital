import pg from 'pg';
const { Pool } = pg;

function connectionString(){ return process.env.DATABASE_URL || process.env.POSTGRES_URL || ''; }

if (!globalThis.__UPLY_V25_POOL && connectionString()) {
  const cs=connectionString();
  globalThis.__UPLY_V25_POOL = new Pool({
    connectionString: cs,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    ssl: /localhost|127\.0\.0\.1/.test(cs) ? false : { rejectUnauthorized: false }
  });
}

export const pool = globalThis.__UPLY_V25_POOL || null;
export function dbReady(){ return !!pool; }
export async function q(text, params=[]){
  if(!pool) throw new Error('DATABASE_URL belum diatur di Vercel Environment Variables.');
  return pool.query(text, params);
}

let schemaPromise = null;
export function ensureSchema() {
  if (!schemaPromise) schemaPromise = initSchema().catch(err => { schemaPromise = null; throw err; });
  return schemaPromise;
}

async function initSchemaAttempt() {
  if (!pool) throw new Error('DATABASE_URL belum diatur.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // V31.9: serialize schema DDL across ALL Vercel instances.
    // schemaPromise only protects one warm runtime; PostgreSQL advisory lock
    // protects concurrent cold starts so CREATE/ALTER TABLE cannot deadlock.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('uply-digital-schema-v31'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Digital',
        duration TEXT NOT NULL DEFAULT '',
        price BIGINT NOT NULL CHECK(price >= 0),
        description TEXT NOT NULL DEFAULT '',
        benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
        terms TEXT NOT NULL DEFAULT '',
        stock INTEGER NOT NULL DEFAULT -1,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        badge TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'generic',
        fulfillment_mode TEXT NOT NULL DEFAULT 'manual' CHECK (fulfillment_mode IN ('manual','inventory')),
        thumbnail_url TEXT NOT NULL DEFAULT '',
        thumbnail_mime TEXT NOT NULL DEFAULT '',
        thumbnail_data TEXT NOT NULL DEFAULT '',
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        requires_login_credentials BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS banks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        number TEXT NOT NULL,
        holder TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT,
        role TEXT NOT NULL CHECK(role IN ('user','admin')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL DEFAULT 'email',
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        duration TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL DEFAULT 1,
        price BIGINT NOT NULL,
        total BIGINT NOT NULL,
        bank_id TEXT NOT NULL DEFAULT '',
        bank_name TEXT NOT NULL DEFAULT '',
        bank_number TEXT NOT NULL DEFAULT '',
        bank_holder TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending_payment',
        payment_mode TEXT NOT NULL DEFAULT 'manual',
        gateway_status TEXT NOT NULL DEFAULT '',
        payment_url TEXT NOT NULL DEFAULT '',
        gateway_transaction_id TEXT NOT NULL DEFAULT '',
        gateway_order_id TEXT NOT NULL DEFAULT '',
        gateway_attempt INTEGER NOT NULL DEFAULT 0,
        gateway_payment_method TEXT NOT NULL DEFAULT '',
        gateway_payment_channel TEXT NOT NULL DEFAULT '',
        gateway_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        payment_submitted_at TIMESTAMPTZ,
        payment_verified_at TIMESTAMPTZ,
        processing_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        proof_name TEXT NOT NULL DEFAULT '',
        proof_mime TEXT NOT NULL DEFAULT '',
        proof_data TEXT NOT NULL DEFAULT '',
        delivery TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        request_id TEXT UNIQUE NOT NULL,
        inventory_item_id TEXT,
        stock_reserved BOOLEAN NOT NULL DEFAULT FALSE,
        product_thumbnail TEXT NOT NULL DEFAULT '',
        credentials_enc TEXT NOT NULL DEFAULT '',
        credentials_status TEXT NOT NULL DEFAULT '',
        credentials_viewed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        item_value TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','delivered','disabled')),
        order_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_product_status ON inventory(product_id, status);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        id BIGSERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        record_id TEXT NOT NULL DEFAULT '',
        detail JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE IF NOT EXISTS payment_events (
        id BIGSERIAL PRIMARY KEY,
        event_key TEXT UNIQUE NOT NULL,
        order_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        processed_at TIMESTAMPTZ,
        error TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK(discount_type IN ('fixed','percent')),
        discount_value BIGINT NOT NULL DEFAULT 0,
        min_spend BIGINT NOT NULL DEFAULT 0,
        max_discount BIGINT NOT NULL DEFAULT 0,
        usage_limit INTEGER NOT NULL DEFAULT 0,
        per_user_limit INTEGER NOT NULL DEFAULT 1,
        category TEXT NOT NULL DEFAULT '',
        product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        new_customers_only BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS voucher_usages (
        id BIGSERIAL PRIMARY KEY,
        voucher_code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        discount BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(voucher_code, order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_voucher_usage_user ON voucher_usages(voucher_code,user_id);
      CREATE TABLE IF NOT EXISTS balance_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount BIGINT NOT NULL,
        type TEXT NOT NULL DEFAULT 'adjustment',
        reference TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'system',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_balance_ledger_user ON balance_ledger(user_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications(is_read,created_at DESC);
      CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        price BIGINT NOT NULL CHECK(price >= 0),
        compare_at_price BIGINT NOT NULL DEFAULT 0 CHECK(compare_at_price >= 0),
        stock INTEGER NOT NULL DEFAULT -1,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        badge TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, active, sort_order, created_at);
      CREATE TABLE IF NOT EXISTS product_media (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL DEFAULT '',
        caption TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        image_mime TEXT NOT NULL DEFAULT '',
        image_data TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_product_media_product ON product_media(product_id, active, sort_order, created_at);
      CREATE TABLE IF NOT EXISTS warranty_claims (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'kendala_produk',
        description TEXT NOT NULL DEFAULT '',
        screenshot_name TEXT NOT NULL DEFAULT '',
        screenshot_mime TEXT NOT NULL DEFAULT '',
        screenshot_data TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','review','processing','approved','rejected','resolved')),
        admin_note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_warranty_claims_user ON warranty_claims(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON warranty_claims(status,created_at DESC);
      CREATE TABLE IF NOT EXISTS customer_notifications (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_notifications_user ON customer_notifications(user_id,is_read,created_at DESC);
      CREATE TABLE IF NOT EXISTS payment_attempts (
        gateway_order_id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'midtrans',
        attempt_no INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT '',
        transaction_id TEXT NOT NULL DEFAULT '',
        payment_url TEXT NOT NULL DEFAULT '',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id, attempt_no DESC);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'customer';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_manual BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 3;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_days INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS cost_price BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS warranty_days INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_price BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ;
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_code TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS balance_used BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_refunded BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_price BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS warranty_days INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS warranty_until TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_applied BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_subtitle TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_mime TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_data TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_login_credentials BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_thumbnail TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credentials_enc TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credentials_status TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credentials_viewed_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_order_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_attempt INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_payment_method TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_payment_channel TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS gateway_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
      ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS error TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_orders_gateway_order_id ON orders(gateway_order_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_product_variant_status ON inventory(product_id,variant_id,status);
      CREATE INDEX IF NOT EXISTS idx_orders_variant_id ON orders(variant_id);
      UPDATE orders SET subtotal=CASE WHEN subtotal=0 THEN price*quantity ELSE subtotal END WHERE subtotal=0;
      INSERT INTO payment_attempts(gateway_order_id,order_id,provider,attempt_no,status,transaction_id,payment_url,payload)
        SELECT gateway_order_id,id,CASE WHEN payment_mode='midtrans' THEN 'midtrans' ELSE payment_mode END,GREATEST(gateway_attempt,1),gateway_status,gateway_transaction_id,payment_url,gateway_payload
        FROM orders WHERE gateway_order_id<>''
        ON CONFLICT(gateway_order_id) DO NOTHING;
    `);

    const products = [
      ['netflix','Netflix Premium Sharing','Streaming','1 bulan',40000,'Netflix sharing untuk kebutuhan hiburan harian.',JSON.stringify(['1 profil untuk 1 pengguna','PIN profil pribadi','Kualitas hingga 4K UHD','Login di 1 perangkat','Full garansi sesuai S&K']),'Garansi sesuai S&K toko selama masa aktif. Jangan ubah email atau sandi akun.',-1,true,'Favorit','netflix','manual','/assets/products/netflix.svg',true,false],
      ['google-ai','Google AI Pro','AI & Produktivitas','18 bulan',25000,'Paket AI untuk kerja, ide, konten, dan produktivitas.',JSON.stringify(['Aktivasi melalui link','Garansi link aktivasi','Cloud hingga 5 TB','Kredit Flow sesuai paket aktivasi']),'Benefit mengikuti penawaran aktivasi yang tersedia saat pemrosesan.',-1,true,'Untuk kreator','ai','manual','/assets/products/google-ai.svg',true,false],
      ['youtube','YouTube Premium','Streaming','1 bulan',7000,'Nikmati video dan musik dengan lebih nyaman.',JSON.stringify(['Aktivasi via undangan','Full garansi sesuai S&K']),'Gunakan akun yang memenuhi syarat undangan.',-1,true,'Rp7 ribu','youtube','manual','/assets/products/youtube.svg',false,false],
      ['unblock-imei','Unblock IMEI','Perangkat','3 bulan',250000,'Layanan unblock IMEI dengan masa aktif tiga bulan.',JSON.stringify(['Durasi 3 bulan','Bergaransi sesuai S&K','Proses maksimal 1x24 jam']),'Ketersediaan mengikuti status perangkat dan ketentuan yang berlaku.',-1,true,'3 bulan','generic','manual','/assets/products/imei.svg',false,false],
      ['stars-6400','Facebook Stars','Top Up','6.400 Stars',45000,'Paket top up Stars untuk kebutuhan kreator.',JSON.stringify(['Paket 6.400 Stars','Proses manual oleh admin','Login akun diperlukan saat checkout']),'Proses dilakukan manual melalui login akun. Jangan kirim OTP, recovery code, atau kode keamanan.',-1,true,'Top up','stars','manual','/assets/products/stars-6400.svg',true,true],
      ['stars-12800','Facebook Stars','Top Up','12.800 Stars',85000,'Pilih jumlah Stars sesuai kebutuhan.',JSON.stringify(['Paket 12.800 Stars','Proses manual oleh admin','Login akun diperlukan saat checkout']),'Proses dilakukan manual melalui login akun. Jangan kirim OTP, recovery code, atau kode keamanan.',-1,true,'','stars','manual','/assets/products/stars-12800.svg',false,true],
      ['stars-19200','Facebook Stars','Top Up','19.200 Stars',120000,'Paket Stars lebih besar untuk kebutuhanmu.',JSON.stringify(['Paket 19.200 Stars','Proses manual oleh admin','Login akun diperlukan saat checkout']),'Proses dilakukan manual melalui login akun. Jangan kirim OTP, recovery code, atau kode keamanan.',-1,true,'','stars','manual','/assets/products/stars-19200.svg',false,true]
    ];
    for (const p of products) {
      await client.query(`INSERT INTO products(id,name,category,duration,price,description,benefits,terms,stock,active,badge,icon,fulfillment_mode,thumbnail_url,featured,requires_login_credentials)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO NOTHING`, p);
    }
    await client.query(`UPDATE products SET thumbnail_url=CASE id
      WHEN 'netflix' THEN '/assets/products/netflix.svg' WHEN 'google-ai' THEN '/assets/products/google-ai.svg' WHEN 'youtube' THEN '/assets/products/youtube.svg'
      WHEN 'unblock-imei' THEN '/assets/products/imei.svg' WHEN 'stars-6400' THEN '/assets/products/stars-6400.svg' WHEN 'stars-12800' THEN '/assets/products/stars-12800.svg'
      WHEN 'stars-19200' THEN '/assets/products/stars-19200.svg' ELSE thumbnail_url END WHERE thumbnail_url=''`);
    await client.query(`UPDATE products SET fulfillment_mode='manual', requires_login_credentials=TRUE WHERE LOWER(REPLACE(category,' ',''))='topup'`);
    const banks = [
      ['seabank','SeaBank','901966141255','Bagus Hermawan',true],
      ['superbank','SuperBank','000004350393','Bagus Hermawan',true],
      ['blu','blu by BCA Digital','009329592649','Bagus Hermawan',true],
      ['jago','Bank Jago','101254170755','Bagus Hermawan',true]
    ];
    for (const b of banks) {
      await client.query(`INSERT INTO banks(id,name,number,holder,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`, b);
    }
    const defaults = {
      storeName:'Uply Digital', whatsapp:'628987659162', hours:'Setiap hari · konfirmasi via admin', storeOpen:'true', paymentHours:'24', notice:'', promoBanner:'Promo dan produk unggulan terbaru tersedia di Uply Digital.', manualPaymentEnabled:'true', qrisManualPaymentEnabled:'true', midtransPaymentEnabled:'true', belibayarPaymentEnabled:'false', duitkuPaymentEnabled:'false', balancePaymentEnabled:'true', autoRoleEnabled:'true', lowStockDefault:'3', qrisName:'QRIS Manual', qrisImageData:'', qrisImageMime:''
    };
    for (const [k,v] of Object.entries(defaults)) {
      await client.query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`, [k,v]);
    }

    // V31.1 one-time gateway initialization.
    // If a gateway is already fully configured at deploy time, enable it once so
    // an old database default (false) does not hide a working provider forever.
    // A marker is written after initialization, so an admin can still switch the
    // gateway OFF later without a future cold start turning it back on.
    const envBool=v=>v===true||['1','true','yes','on'].includes(String(v??'').trim().toLowerCase());
    const belibayarReady=/^https:\/\//i.test(String(process.env.BELIBAYAR_BACKEND_URL||'').trim())
      && String(process.env.BELIBAYAR_BACKEND_KEY||'').trim().length>=16
      && envBool(process.env.BELIBAYAR_BACKEND_READY);
    const duitkuReady=String(process.env.DUITKU_MERCHANT_CODE||'').trim().length>=3
      && String(process.env.DUITKU_API_KEY||'').trim().length>=12
      && /^https:\/\//i.test(String(process.env.SITE_URL||'').trim());

    const gatewayInit=[
      ['belibayarPaymentEnabled','belibayarAutoInitializedV311',belibayarReady],
      ['duitkuPaymentEnabled','duitkuAutoInitializedV311',duitkuReady]
    ];
    for(const [settingKey,markerKey,ready] of gatewayInit){
      if(!ready) continue;
      const marker=await client.query('SELECT value FROM settings WHERE key=$1 LIMIT 1',[markerKey]);
      if(!marker.rowCount){
        await client.query(`INSERT INTO settings(key,value) VALUES($1,'true') ON CONFLICT(key) DO UPDATE SET value='true'`,[settingKey]);
        await client.query(`INSERT INTO settings(key,value) VALUES($1,'true') ON CONFLICT(key) DO NOTHING`,[markerKey]);
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.release();
  }
}


async function initSchema() {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await initSchemaAttempt();
    } catch (err) {
      // 40P01 = deadlock_detected. This can briefly occur while old deployment
      // instances (without the advisory lock) are still draining.
      if (String(err?.code || '') !== '40P01' || attempt >= maxAttempts) throw err;
      const delayMs = 150 * attempt + Math.floor(Math.random() * 200);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return true;
}

export async function getSettings() {
  const { rows } = await q('SELECT key,value FROM settings');
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}

export async function audit(actor, action, recordId='', detail={}) {
  try { await q('INSERT INTO audit(actor,action,record_id,detail) VALUES($1,$2,$3,$4::jsonb)', [actor,action,recordId,JSON.stringify(detail)]); } catch {}
}
