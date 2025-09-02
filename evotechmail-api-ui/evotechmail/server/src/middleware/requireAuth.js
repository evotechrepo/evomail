// server/src/middleware/requireAuth.js
import { getSessionWithUser } from '../services/auth.js';

export async function requireAuth(req, res, next) {
  try {
    const COOKIE = process.env.SESSION_COOKIE_NAME || 'evomail_sid';
    const sid = req.cookies?.[COOKIE];
    const sess = await getSessionWithUser(sid);

    if (!sess?.user) return res.status(401).json({ error: 'Not signed in' });

    // MUST include display_name and role_cd here
    // Example shape: { user_id, email, display_name, role_cd, is_active }
    req.user = sess.user;
    res.locals.user = sess.user;
    //console.log(req.user);
    next();
  } catch (e) {
    console.error('requireAuth error:', e);
    res.status(500).json({ error: 'Auth error' });
  }
}

export function requireAdmin(req, res, next) {
  const role = (req.user?.role_cd || res.locals.user?.role_cd || '').toLowerCase();
  if (!role) return res.status(401).json({ error: 'Not signed in' });
  if (role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

