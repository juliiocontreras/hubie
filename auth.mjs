import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {executeSql} from './database.mjs';
import {requireMembership} from './tenant.mjs';
const digest=token=>createHash('sha256').update(token).digest('hex');
const cellRows=result=>result?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
export function newSessionToken(){return randomBytes(32).toString('base64url');}
export async function createSession(userId,{ttlHours=24}={}){if(!userId)throw Error('User required');const token=newSessionToken();const id=randomBytes(16).toString('hex');const expiresAt=new Date(Date.now()+ttlHours*3600000).toISOString();await executeSql('INSERT INTO session_tokens(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)',[id,userId,digest(token),expiresAt]);return {token,expiresAt};}
export async function verifySession(token){if(typeof token!=='string'||token.length<30||token.length>256)return null;const hash=digest(token);const r=await executeSql('SELECT user_id,token_hash,expires_at,revoked_at FROM session_tokens WHERE token_hash=?',[hash]);const row=cellRows(r)[0];if(!row||row[3]||Date.parse(row[2])<=Date.now())return null;if(!timingSafeEqual(Buffer.from(row[1],'hex'),Buffer.from(hash,'hex')))return null;return {userId:row[0]};}
export async function revokeSession(token){if(typeof token!=='string'||token.length<30)return;await executeSql('UPDATE session_tokens SET revoked_at=? WHERE token_hash=?',[new Date().toISOString(),digest(token)]);}
export async function requireTenantSession(token,organizationId,roles=['owner','admin','member','viewer']){const session=await verifySession(token);if(!session)throw Error('Unauthorized');const role=await requireMembership(organizationId,session.userId,roles);return {...session,organizationId,role};}
export function readSessionCookie(header){const match=String(header||'').match(/(?:^|;\s*)__Host-hubie_session=([^;]+)/);return match?decodeURIComponent(match[1]):null;}
