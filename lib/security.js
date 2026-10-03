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
