import { ensureSchema, q } from '../lib/db.js';
export default async function handler(req,res){
  try{
    await ensureSchema();
    const id=String(req.query?.id||'').slice(0,100);
    if(!id) return res.status(400).end('Bad Request');
    const {rows}=await q('SELECT image_mime,image_data FROM product_media WHERE id=$1 LIMIT 1',[id]);
    const m=rows[0];
    if(!m?.image_data) return res.status(404).end('Not Found');
    res.setHeader('Content-Type',m.image_mime||'image/jpeg');
    res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).end(Buffer.from(m.image_data,'base64'));
  }catch(e){
    console.error('[product-media-image]',e?.message||e);
    return res.status(500).end('Internal Server Error');
  }
}
