export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method Not Allowed'});
  return res.status(410).json({ok:false,error:'V31 memakai webhook BeliBayar di Windows backend dan /api/belibayar-relay untuk sinkronisasi Vercel.'});
}
