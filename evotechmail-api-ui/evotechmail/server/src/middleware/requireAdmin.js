export function requireAdmin(req, res, next) {
    const u = req.user || res.locals.user;
    if (u?.role_cd?.toLowerCase() === 'admin') return next();
    return res.status(403).json({ ok:false, error: 'Admin only' });
  }
  