import { ensureSchema, getSettings } from '../lib/db.js';
export default async function handler(req,res){
  try{
    await ensureSchema();
    const s=await getSettings();
    if(!s.qrisImageData) return res.status(404).send('QRIS belum diatur.');
    const mime=['image/png','image/jpeg','image/webp'].includes(s.qrisImageMime)?s.qrisImageMime:'image/png';
    const buf=Buffer.from(String(s.qrisImageData),'base64');
    res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','public, max-age=300');return res.status(200).send(buf);
  }catch(e){return res.status(500).send('QRIS tidak tersedia.');}
}
