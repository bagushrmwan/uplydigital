import crypto from 'crypto';
import { q } from './db.js';

const secret = process.env.SESSION_SECRET || '';
export function securityReady(){ return secret.length >= 32; }
export function id(prefix='id'){ return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
export function normalizeEmail(v){ return String(v||'').trim().toLowerCase(); }
export function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 190; }
export function hashToken(v){ return crypto.createHmac('sha256', secret).update(String(v)).digest('hex'); }
export function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, salt, expected){
  const actual=crypto.scryptSync(String(password), String(salt), 64);
  const exp=Buffer.from(String(expected), 'hex');
  return actual.length===exp.length && crypto.timingSafeEqual(actual,exp);
}
export function safeEqual(a,b){
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
export async function createSession({userId=null, role='user', hours=24}){
  const token=crypto.randomBytes(32).toString('hex');
  await q('INSERT INTO sessions(token_hash,user_id,role,expires_at) VALUES($1,$2,$3,NOW()+($4 || \' hours\')::interval)', [hashToken(token),userId,role,String(hours)]);
  return token;
}
export function bearer(req){
  const h=String(req.headers.authorization||'');
  return h.startsWith('Bearer ')?h.slice(7).trim():'';
}
export async function auth(req){
  const token=bearer(req); if(!token) return null;
  const { rows }=await q(`SELECT s.user_id,s.role,s.expires_at,u.email,u.name,u.phone
    FROM sessions s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW() LIMIT 1`,[hashToken(token)]);
  if(!rows[0]) return null;
  return {id:rows[0].user_id,email:rows[0].email||process.env.ADMIN_EMAIL||'',name:rows[0].role==='admin'?'Admin Uply':rows[0].name,phone:rows[0].phone||'',role:rows[0].role,token};
}
export async function requireAuth(req){ const u=await auth(req); if(!u) throw Object.assign(new Error('Silakan masuk kembali.'),{status:401,safe:true}); return u; }
export async function requireAdmin(req){ const u=await requireAuth(req); if(u.role!=='admin') throw Object.assign(new Error('Akses khusus admin.'),{status:403,safe:true}); return u; }
export async function destroySession(req){ const token=bearer(req); if(token) await q('DELETE FROM sessions WHERE token_hash=$1',[hashToken(token)]); }


const credentialSecret = process.env.CREDENTIAL_ENCRYPTION_KEY || '';
export function credentialSecurityReady(){ return credentialSecret.length >= 32; }
function credentialKey(){
  if(!credentialSecurityReady()) throw Object.assign(new Error('CREDENTIAL_ENCRYPTION_KEY belum diatur di Netlify.'),{status:500,safe:true});
  return crypto.createHash('sha256').update(credentialSecret).digest();
}
export function encryptCredentialPayload(payload){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',credentialKey(),iv);
  const plaintext=Buffer.from(JSON.stringify(payload),'utf8');
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,encrypted]).toString('base64');
}
export function decryptCredentialPayload(blob){
  const raw=Buffer.from(String(blob||''),'base64');
  if(raw.length<29) throw Object.assign(new Error('Data login tidak valid.'),{status:400,safe:true});
  const iv=raw.subarray(0,12), tag=raw.subarray(12,28), encrypted=raw.subarray(28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',credentialKey(),iv);
  decipher.setAuthTag(tag);
  const decrypted=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}
