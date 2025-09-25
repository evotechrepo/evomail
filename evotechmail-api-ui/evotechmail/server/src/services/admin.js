// routes/admin.js (ESM)
import express from 'express';
import argon2  from 'argon2';
import { pool } from './db.js'; // adjust import to your pool

const router = express.Router();

/** POST /evotechmail/api/admin/hash  -> { ok, hash } */
router.post('/hash', async (req, res) => {
  try {
    const password = (req.body?.password || '').toString();
    if (!password) return res.status(400).json({ ok:false, error:'Password required' });

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 1 << 16,   // ~64MB
      parallelism: 1,
    });
    res.json({ ok:true, hash });
  } catch (e) {
    console.error('hash error:', e?.message);
    res.status(500).json({ ok:false, error:'Hash failed' });
  }
});

/** POST /evotechmail/api/admin/users  -> create user */
router.post('/users', async (req, res) => {
  try {
    const emailRaw     = (req.body?.email || '');
    const emailNorm    = emailRaw.normalize('NFKC').trim().toLowerCase(); // match your index
    const password     = String(req.body?.password || '');
    const display_name = (req.body?.display_name || '').toString().trim() || null;
    const role_cd_raw  = (req.body?.role_cd || 'admin').toString().trim().toLowerCase();
    const is_active    = !!req.body?.is_active;

    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ ok:false, error:'Valid email required' });
    }
    if (!password) return res.status(400).json({ ok:false, error:'Password required' });

    const role_cd = (role_cd_raw === 'staff') ? 'staff' : 'admin';

    // OPTIONAL but friendly: preflight exists check (uses your index)
    {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM evomail.user_account
          WHERE lower(btrim(email)) = $1
          LIMIT 1`,
        [emailNorm]
      );
      if (rowCount) return res.status(409).json({ ok:false, error:'Email already exists' });
    }

    const pass_hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 1 << 16,
      parallelism: 1,
    });

    // Store normalized email to keep the table consistent with the index rule
    const q = `
      INSERT INTO evomail.user_account (email, pass_hash, display_name, role_cd, is_active, create_ts)
      VALUES (LOWER(BTRIM($1)), $2, $3, $4, $5, now())
      RETURNING user_id, email, display_name, role_cd, is_active, create_ts
    `;
    const { rows } = await pool.query(q, [emailNorm, pass_hash, display_name, role_cd, is_active]);
    return res.json({ ok:true, user: rows[0] });

  } catch (e) {
    // Race-condition safety: unique violation on your expression index
    if (e?.code === '23505') {
      return res.status(409).json({ ok:false, error:'Email already exists' });
    }
    console.error('users create error:', e);
    return res.status(500).json({ ok:false, error:'Failed to create user' });
  }
});

/** GET /evotechmail/api/admin/users/by-email?email=... -> fetch one user */
router.get('/users/by-email', async (req, res) => {
  try{
    const email = (req.query?.email || '').toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ ok:false, error:'Email required' });
    const q = `
      SELECT user_id, lower(btrim(email)) AS email, display_name, role_cd, is_active, create_ts, last_login_ts
        FROM evomail.user_account
       WHERE lower(btrim(email)) = $1
       LIMIT 1
    `;
    const { rows } = await pool.query(q, [email]);
    if (!rows.length) return res.status(404).json({ ok:false, error:'User not found' });
    return res.json({ ok:true, user: rows[0] });
  } catch(e){
    console.error('users fetch by email error:', e);
    return res.status(500).json({ ok:false, error:'Failed to fetch user' });
  }
});

/** PUT /evotechmail/api/admin/users/:user_id -> update display_name, role_cd, is_active */
router.put('/users/:user_id', async (req, res) => {
  try{
    const user_id = Number(req.params?.user_id);
    if (!Number.isFinite(user_id)) return res.status(400).json({ ok:false, error:'Valid user_id required' });

    const display_name = (req.body?.display_name ?? null);
    const role_cd_raw  = (req.body?.role_cd || '').toString().trim().toLowerCase();
    const is_active    = !!req.body?.is_active;

    const role_cd = (role_cd_raw === 'admin') ? 'admin' : (role_cd_raw === 'staff' ? 'staff' : null);
    if (!role_cd) return res.status(400).json({ ok:false, error:'role_cd must be admin or staff' });

    const q = `
      UPDATE evomail.user_account
         SET display_name = COALESCE($1, display_name),
             role_cd      = $2,
             is_active    = $3
       WHERE user_id = $4
   RETURNING user_id, lower(btrim(email)) AS email, display_name, role_cd, is_active, create_ts
    `;
    const { rows } = await pool.query(q, [display_name, role_cd, is_active, user_id]);
    if (!rows.length) return res.status(404).json({ ok:false, error:'User not found' });
    return res.json({ ok:true, user: rows[0] });
  }catch(e){
    console.error('users update error:', e);
    return res.status(500).json({ ok:false, error:'Failed to update user' });
  }
});


// List users
router.get('/users', async (req,res)=>{
  const limit=Math.min(500,parseInt(req.query.limit||100));
  const offset=parseInt(req.query.offset||0);
  const q=`SELECT user_id,lower(btrim(email)) AS email,display_name,role_cd,is_active,last_login_ts,create_ts
           FROM evomail.user_account ORDER BY email LIMIT $1 OFFSET $2`;
  const {rows}=await pool.query(q,[limit,offset]);
  res.json({ok:true,users:rows});
});


// Reset password
router.put('/users/:user_id/password', async (req,res)=>{
  const user_id=+req.params.user_id;
  const pwd=req.body.password||'';
  const hash=await argon2.hash(pwd,{type:argon2.argon2id,timeCost:3,memoryCost:1<<16});
  const q=`UPDATE evomail.user_account SET pass_hash=$1 WHERE user_id=$2 RETURNING user_id,email`;
  const {rows}=await pool.query(q,[hash,user_id]);
  if(!rows.length) return res.status(404).json({ok:false,error:'Not found'});
  res.json({ok:true,user:rows[0]});
});


/** (optional) roles list for dropdown */
router.get('/roles', (_req, res) => {
  res.json({ roles:[{code:'admin',label:'Admin'},{code:'staff',label:'Staff'}] });
});

export default router;
