// server/src/services/auth.js
import express from 'express';
import cookie from 'cookie';
import argon2 from 'argon2';
import { pool } from './db.js'; // or your existing pool

const router = express.Router();

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'evomail_sid';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 72);
const COOKIE_SECURE = String(process.env.SESSION_SECURE || '0') === '1';
const COOKIE_SAMESITE = process.env.SESSION_SAMESITE || 'Lax';
const COOKIE_DOMAIN = process.env.SESSION_DOMAIN || undefined; // e.g. .evotechservice.com

function makeCookie(sid){
  return cookie.serialize(COOKIE_NAME, sid, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: '/',                // works for /evotechmail/* too
    domain: COOKIE_DOMAIN,
    maxAge: SESSION_TTL_HOURS * 3600
  });
}

export async function getSessionWithUser(sid) {
  if (!sid) return null;

  const q = `
    SELECT
      s.user_id AS user_id,
      s.expires_ts,
      u.email,
      u.display_name,
      u.role_cd,
      u.is_active
    FROM evomail.user_session s
    JOIN evomail.user_account u ON u.user_id = s.user_id
    WHERE s.session_id = $1
      AND s.expires_ts > now()
  `;
  const { rows } = await pool.query(q, [sid]);
  if (!rows.length) return null;

  const r = rows[0];
  return {
    user: {
      user_id: r.user_id,
      email: r.email,
      display_name: r.display_name,
      role_cd: r.role_cd,
      is_active: r.is_active,
    },
    expires_ts: r.expires_ts,
  };
}


export async function requireAdmin(req, res, next) {
  try {
    // however you already read sessions:
    // (you showed getSessionWithUser(sid) earlier)
    const COOKIE = process.env.SESSION_COOKIE_NAME || 'evomail_sid';
    const sid = req.cookies?.[COOKIE];
    const sess = await getSessionWithUser(sid);   // should include user.role_cd
    const role = (sess?.user?.role_cd || '').toLowerCase();
    if (!sess?.user) return res.status(401).json({ error: 'Not signed in' });
    if (role !== 'admin') return res.status(403).json({ error: 'Admins only' });

    // make user reachable to handlers
    req.user = sess.user;
    res.locals.me = sess.user;
    next();
  } catch (e) {
    next(e);
  }
}


router.post('/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    const pw = String(password || '');

    if (!em || !pw) return res.status(400).json({ ok:false, error:'Email and password required' });

    const { rows } = await pool.query(
      `SELECT user_id, email, pass_hash, display_name, role_cd, is_active
         FROM user_account
        WHERE lower(email) = $1
        LIMIT 1`, [em]
    );
    const u = rows[0];
    if (!u || !u.is_active) return res.status(401).json({ ok:false, error:'Invalid credentials' });

    const ok = await argon2.verify(u.pass_hash, pw);
    if (!ok) return res.status(401).json({ ok:false, error:'Invalid credentials' });

    // create session
    const expires = new Date(Date.now() + (SESSION_TTL_HOURS * 3600_000) * (remember ? 2 : 1)); // double if remember
    const { rows: srows } = await pool.query(
      `INSERT INTO user_session (user_id, ip_addr, user_agent, expires_ts)
       VALUES ($1, $2::inet, $3, $4)
       RETURNING session_id`,
      [u.user_id, req.headers['x-forwarded-for']?.split(',')[0] || req.ip, req.headers['user-agent'] || '', expires]
    );
    const sid = srows[0].session_id;

    setSessionCookie(res, sid, { remember: !!remember });

    // update last login
    await pool.query(`UPDATE user_account SET last_login_ts = now() WHERE user_id = $1`, [u.user_id]);

    res.setHeader('Set-Cookie', makeCookie(sid));
    return res.json({
      ok: true,
      user: { email: u.email, display_name: u.display_name, role: u.role_cd }
    });
  } catch (e){
    console.error('login error', e);
    return res.status(500).json({ ok:false, error:'Login failed' });
  }
});

function setSessionCookie(res, sid, { remember = false } = {}) {
  const base = {
    httpOnly: true,
    secure: String(process.env.SESSION_SECURE || '0') === '1',
    sameSite: process.env.SESSION_SAMESITE || 'Lax',
    path: '/',
  };
  const opts = remember ? { ...base, maxAge: Number(process.env.SESSION_TTL_HOURS || 72) * 3600 } : base;
  res.setHeader('Set-Cookie', cookie.serialize(process.env.SESSION_COOKIE_NAME || 'evomail_sid', sid, opts));
}


router.get('/me', async (req, res) => {
  try {
    const sid = req.cookies?.[COOKIE_NAME] || null;
    const sess = await getSessionWithUser(sid);
    if (!sess) return res.status(401).json({ ok:false });
    return res.json({
      ok: true,
      user: { email: sess.email, display_name: sess.display_name, role: sess.role_cd }
    });
  } catch (e){
    return res.status(500).json({ ok:false });
  }
});

router.post('/logout', async (req, res) => {
    const sidName = process.env.SESSION_COOKIE_NAME || 'evomail_sid';
    const sid = req.cookies?.[sidName];
    if (sid) await pool.query('DELETE FROM user_session WHERE session_id = $1', [sid]);
    res.setHeader('Set-Cookie', cookie.serialize(sidName, '', {
      httpOnly: true, secure: false, sameSite: 'Lax', path: '/', maxAge: 0
    }));
    res.json({ ok: true });
  });
  
//export {getSessionWithUser};

export default router;
