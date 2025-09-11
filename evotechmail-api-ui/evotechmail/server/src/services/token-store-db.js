// token-store-db.js
import crypto from 'crypto';
import { pool } from './db.js';

const KEY = crypto.createHash('sha256').update(process.env.TOKEN_ENC_KEY || 'dev').digest(); // 32B

function enc(obj){
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const json = Buffer.from(JSON.stringify(obj));
  const ct = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}
function dec(b64){
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0,12), tag = buf.subarray(12,28), ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

export async function saveGlobalTokens(tokens){
  const encrypted = enc(tokens); // stores the whole tokens object encrypted
  await pool.query(
    `INSERT INTO oauth_tokens (id, refresh_token)
     VALUES ('google-drive-global', $1)
     ON CONFLICT (id) DO UPDATE
     SET refresh_token = EXCLUDED.refresh_token,
         updated_at = now()`,
    [encrypted]
  );
}


export async function loadGlobalTokens(){
  const { rows } = await pool.query(
    `SELECT refresh_token FROM oauth_tokens WHERE id = 'google-drive-global' LIMIT 1`
  );
  if (!rows.length) return null;
  return dec(rows[0].refresh_token);
}
