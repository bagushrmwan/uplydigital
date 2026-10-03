import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (!globalThis.__UPLY_POOL && connectionString) {
  globalThis.__UPLY_POOL = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
  });
}
export const pool = globalThis.__UPLY_POOL || null;

export function dbReady() { return !!pool; }
export async function q(text, params=[]) {
  if (!pool) throw new Error('DATABASE_URL belum diatur.');
  return pool.query(text, params);
}

let schemaPromise = null;
export function ensureSchema() {
  if (!schemaPromise) schemaPromise = initSchema().catch(err => { schemaPromise = null; throw err; });
  return schemaPromise;
}

async function initSchema() {
  if (!pool) throw new Error('DATABASE_URL belum diatur.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_login_credentials BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_thumbnail TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credentials_enc TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credentials_status TEXT NOT NULL DEFAULT '';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS credentials_viewed_at TIMESTAMPTZ;
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
      storeName:'Uply Digital', whatsapp:'628987659162', hours:'Setiap hari · konfirmasi via admin', storeOpen:'true', paymentHours:'24', notice:'', promoBanner:'Promo dan produk unggulan terbaru tersedia di Uply Digital.'
    };
    for (const [k,v] of Object.entries(defaults)) {
      await client.query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`, [k,v]);
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getSettings() {
  const { rows } = await q('SELECT key,value FROM settings');
  return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}

export async function audit(actor, action, recordId='', detail={}) {
  try { await q('INSERT INTO audit(actor,action,record_id,detail) VALUES($1,$2,$3,$4::jsonb)', [actor,action,recordId,JSON.stringify(detail)]); } catch {}
}
