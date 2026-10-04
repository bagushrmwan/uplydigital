import { ensureSchema, q } from '../lib/db.js';
export default async function handler(req,res){
  try{
    await ensureSchema();const id=String(req.query?.id||'').slice(0,100);if(!id) return res.status(400).end('Bad Request');
    const {rows}=await q('SELECT thumbnail_mime,thumbnail_data FROM products WHERE id=$1 LIMIT 1',[id]);const p=rows[0];
    if(!p?.thumbnail_data) return res.status(404).end('Not Found');
    res.setHeader('Content-Type',p.thumbnail_mime||'image/jpeg');res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).end(Buffer.from(p.thumbnail_data,'base64'));
  }catch(e){console.error('PRODUCT IMAGE',e);return res.status(500).end('Image error');}
}
