
import express from 'express';
import pkg from 'pg';
import { getTransport, saveToGmailSent } from './mailer.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';   // for batch_id
import { requireAuth } from '../middleware/requireAuth.js';
// routes-evomail.js (ESM)
import {
  logEmailAttempt,
  listNotifications,
  getNotification,
  getBatch,
  updateNotificationAttempt
} from './notifications.js';
import {
  getMailItem,
  listSubscriberInbox
} from './mail-inbox.js'
import { pool } from './db.js';
import { normalize_image_attachment } from './mail_path.js'


// ESM-safe __dirname / __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const logoPath = path.resolve(__dirname, '../../..', 'public', 'assets', 'evo.png');
const haveLogo = fs.existsSync(logoPath);
const LOGO_CID = 'evo-logo';

// --- simple in-proc cache for the portalless subs (5 min)
const cache = new Map();
const CACHE_MS = 0 * 60 * 1000;   // 5 minutes=5 * 60 * 1000

function cacheSet(key, val) {
  cache.set(key, { val, exp: Date.now() + CACHE_MS });
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.val;
}

const router = express.Router();

/** Health */
router.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok:false, error: String(e) }); }
});

/** Header summaries as three text columns */
router.get('/header-values', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
        WITH activesubsperpartner AS 
            (
            SELECT mp.partner_cd AS partner,
                COUNT(*)::int  AS acnt
              FROM evomail.subscriber s
              JOIN evomail.status       st ON st.status_id       = s.fk_status_id
              JOIN evomail.mail_partner mp ON mp.mail_partner_id = s.fk_mail_partner_id
            WHERE lower(st.status_cd) = 'active'
            GROUP BY mp.partner_cd
            ),
            all_subs as
            (
            SELECT initcap(st.status_cd) status, COUNT(*)::int  AS bcnt
              FROM evomail.subscriber s
              JOIN evomail.status       st ON st.status_id       = s.fk_status_id
              JOIN evomail.mail_partner mp ON mp.mail_partner_id = s.fk_mail_partner_id
            GROUP BY st.status_cd
            ),
            bcg_prompts as
            (
            Select case when lower(st.status_cd) = 'closed' then '' else initcap(bs.bcg_status_cd) end bcg_status_cd, initcap(st.status_cd) status_cd,  count(*) ccnt 
            From evomail.subscriber s, evomail.status st, evomail.bcg_status bs
            WHere s.fk_status_id = st.status_id
            And s.fk_bcg_status_id = bs.bcg_status_id
            And (
                (
                    lower(bs.bcg_status_cd) in ( 'new','update')
                And lower(st.status_cd) in ('onboarding','active')
                )
              OR
                (
                    lower(st.status_cd)     = 'closed'
                And lower(bs.bcg_status_cd) != 'closed'
                )
              )
          Group by case when lower(st.status_cd) = 'closed' then '' else initcap(bs.bcg_status_cd) end, initcap(st.status_cd)
            )
        SELECT
              COALESCE(
                (SELECT string_agg( a.partner || ' = ' || a.acnt, E'\\n' ORDER BY a.acnt DESC, a.partner  ) FROM activesubsperpartner a) ,'') AS "Active Subscribers",
              COALESCE(
                (SELECT string_agg( b.status || ' = ' || b.bcnt, E'\\n' ORDER BY b.bcnt DESC, b.status ) FROM all_subs b) ,'') AS "All Subscribers",
              COALESCE(
                (SELECT string_agg( trim(c.bcg_status_cd || ' ' || c.status_cd || ' = ' || c.ccnt), E'\\n' ORDER BY c.ccnt DESC, c.status_cd ) FROM bcg_prompts c ) ,'') AS "USPS BCG Actions"
    `);

    const row = rows[0] || {};
    res.json({
      "Active Subscribers":   row["Active Subscribers"]   || "",
      "All Subscribers":      row["All Subscribers"]      || "",
      "USPS BCG Actions":     row["USPS BCG Actions"]     || ""
    });

  } catch (e) { res.status(500).json({ ok:false, error: String(e) }); }
});

/** Shared ORDER BY block: Active → Owner → Onboarding first, then PMB numerically */
const ORDER_BLOCK = `
  ORDER BY 
  (
    CASE LOWER(COALESCE(v.status,''))      -- priority group
      WHEN 'active'        THEN 0
      WHEN 'owner'         THEN 1
      WHEN 'closed'        THEN 4
      ELSE 3
    END 
  ) ASC ,  v.pmb::int  ASC
`;


/** Base SELECT with latest note (if any) */
const BASE_SELECT = `
    SELECT
      v.subscriber_id,v.pmb, v.first_name, v.last_name, COALESCE(v.company,'Individual') AS company,
      v.phone, v.email, v.primary_address, LOWER(COALESCE(v.status,'')) AS status,
      v.source, v.bcg, v.notes_json, v.addresses_json
    FROM evomail.subscriber_vw v
`;

// --- GET /fetch-all — cached
router.get('/fetch-all', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 2000), 5000);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const cacheKey = `fetch-all:${limit}:${offset}`;

  try {
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const sql = `${BASE_SELECT} ${ORDER_BLOCK} LIMIT $1 OFFSET $2`;
    const { rows } = await pool.query(sql, [limit, offset]);

    const headers = [
      'PMB', 'First Name', 'Last Name', 'Company', 'Phone', 'Email',
      'Primary Address', 'Status', 'Source', 'BCG'
    ];

    const results = rows.map(r => ({
      id: r.subscriber_id,
      row: [
        r.pmb, r.first_name, r.last_name, r.company, r.phone, r.email,
        r.primary_address,
        r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '',
        r.source, r.bcg
      ],
      notesJson: r.notes_json || [],
      addressesJson: r.addresses_json || [],
      isActive: String(r.status).toLowerCase() !== 'closed'
    }));

    const response = { headers, results };
    cacheSet(cacheKey, response);

    res.json(response);
  } catch (e) {
    console.error('fetch-all error:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/** POST /search  — expects JSON body with any of:
 *  { pmb, firstName, lastName, company, phone, email, primaryAddress, status, source, bcg, notes, limit, offset }
 */
router.post('/search', async (req, res) => {
  const f = req.body || {};
  const limit = Math.min(Number(f.limit||2000), 5000);
  const offset = Math.max(Number(f.offset||0), 0);

  const cond = [];
  const params = [];

  /*
  if (f.pmb && String(f.pmb).trim()) {
    const digits = String(f.pmb).replace(/\D/g, '');   // keep only 0-9
    if (digits) {
      params.push(`${digits}%`);
      cond.push(`v.pmb::int LIKE $${params.length}`);
    }
  }
  */

  // contains match anywhere (will match 211 too)
  if (f.pmb && String(f.pmb).trim())  {
    params.push(`%${String(f.pmb).trim()}%`);
    cond.push(`v.pmb::text ILIKE $${params.length}`);   // <- ::text, not ::string
  }
  if (f.firstName) { params.push(`%${f.firstName}%`); cond.push(`v.first_name ILIKE $${params.length}`); }
  if (f.lastName)  { params.push(`%${f.lastName }%`); cond.push(`v.last_name  ILIKE $${params.length}`); }
  if (f.company)   { params.push(`%${f.company  }%`); cond.push(`v.company    ILIKE $${params.length}`); }
  if (f.phone)     { params.push(`%${f.phone    }%`); cond.push(`v.phone      ILIKE $${params.length}`); }
  if (f.email)     { params.push(`%${f.email    }%`); cond.push(`v.email      ILIKE $${params.length}`); }
  if (f.primaryAddress) { params.push(`%${f.primaryAddress}%`); cond.push(`v.primary_address ILIKE $${params.length}`); }
  if (f.status) { params.push(f.status.toString().toLowerCase()); cond.push(`LOWER(v.status) = $${params.length}`); }
  if (f.source) { params.push(`%${f.source}%`); cond.push(`v.source ILIKE $${params.length}`); }
  if (f.bcg)    { params.push(`%${f.bcg   }%`); cond.push(`v.bcg    ILIKE $${params.length}`); }

  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const sql = `${BASE_SELECT} ${where} ${ORDER_BLOCK} LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(limit, offset);

  try {
    const { rows } = await pool.query(sql, params);
    const headers = ['PMB','First Name','Last Name','Company','Phone','Email','Primary Address','Status','Source','BCG'];

    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const results = rows.map(r => ({
      id: r.subscriber_id,  // NEW
      row: [
        r.pmb, r.first_name, r.last_name, r.company, r.phone, r.email,
        r.primary_address,
        r.status ? r.status.charAt(0).toUpperCase()+r.status.slice(1) : '',
        r.source, r.bcg
      ],
      notesJson: r.notes_json || [],
      addressesJson: r.addresses_json || [],
      isActive: String(r.status).toLowerCase() !== 'closed'
    }));
    res.json({ headers, results });
  } catch (e) {
    console.error('search error:', e);
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Update a subscriber by subscriber_id (and upsert primary address + insert note)
// Expects JSON body fields: firstName,lastName,company,phone,email,primaryAddress,status,source,bcg,notes,modUser
router.put('/subscribers/by-id/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok:false, error:'Invalid subscriber_id' });

  const {
    firstName, lastName, company, phone, email,
    primaryAddress,
    status, source, bcg,
    notes,               // optional single note text (legacy)
    notesJson,           // NEW: array of {note_id?, note_text}
    addressesJson,       // NEW
    modUser
  } = req.body || {};

  const { display_name, uemail, user_id } = req.user;  // set by middleware now
  const userId = display_name || email || 'web';
  //console.log("Session user name = " + userId);

  const nz = v => (v === undefined ? null : (v === '' ? null : v));

  const sql = `
    WITH m_status AS (
      SELECT status_id
      FROM evomail.status
      WHERE lower(status_cd) = lower(NULLIF($8,''))
      LIMIT 1
    ),
    m_partner AS (
      SELECT mail_partner_id
      FROM evomail.mail_partner
      WHERE lower(partner_cd) = lower(NULLIF($9,''))
      LIMIT 1
    ),
    m_bcg AS (
      SELECT bcg_status_id
      FROM evomail.bcg_status
      WHERE lower(bcg_status_cd) = lower(NULLIF($10,''))
      LIMIT 1
    ),
    upd_sub AS (
      UPDATE evomail.subscriber s
      SET
        first_name         = COALESCE($2, s.first_name),
        last_name          = COALESCE($3, s.last_name),
        company            = COALESCE($4, s.company),
        phone              = COALESCE($5, s.phone),
        email              = COALESCE($6, s.email),
        fk_status_id       = COALESCE((SELECT status_id       FROM m_status),  s.fk_status_id),
        fk_mail_partner_id = COALESCE((SELECT mail_partner_id FROM m_partner), s.fk_mail_partner_id),
        fk_bcg_status_id   = COALESCE((SELECT bcg_status_id   FROM m_bcg),     s.fk_bcg_status_id),
        last_mod_user_id   = COALESCE(NULLIF($12,''), s.last_mod_user_id),
        last_mod_ts        = now(),
        create_user_id     = COALESCE(s.create_user_id, COALESCE(NULLIF($12,''), 'web'))
      WHERE s.subscriber_id = $1
      RETURNING s.subscriber_id
    ),
    prim AS (
      SELECT sa.address_id
      FROM evomail.subscriber_address sa
      WHERE sa.fk_subscriber_id = $1 AND sa.is_primary IS TRUE
      ORDER BY sa.address_id
      LIMIT 1
    ),
     input_addresses_tmp AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE($14::jsonb, '[]'::jsonb))
        AS x(address_id BIGINT, address_line_1 TEXT, is_primary BOOLEAN, deleted BOOLEAN)
    ),
    -- only run legacy primary update when no JSON addresses payload was provided
    addr_upd AS (
      UPDATE evomail.subscriber_address sa
      SET
        address_line_1   = COALESCE(NULLIF($7,''), sa.address_line_1),
        last_mod_user_id = COALESCE(NULLIF($12,''), 'web'),
        last_mod_ts      = now(),
        create_user_id   = COALESCE(sa.create_user_id, COALESCE(NULLIF($12,''), 'web'))
      FROM prim
      WHERE sa.address_id = prim.address_id
        AND NOT EXISTS (SELECT 1 FROM input_addresses_tmp)   --  guard
      RETURNING sa.address_id
    ),
    addr_ins AS (
      INSERT INTO evomail.subscriber_address
        (fk_subscriber_id, address_line_1, is_primary, create_user_id, last_mod_user_id)
      SELECT $1, NULLIF($7,''), TRUE, COALESCE(NULLIF($12,''), 'web'), COALESCE(NULLIF($12,''), 'web')
      WHERE (SELECT address_id FROM prim) IS NULL
        AND NULLIF($7,'') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM input_addresses_tmp)   --  guard
      RETURNING address_id
    ),

    /* ===== Notes upsert/delete from JSON ===== */
    input_notes AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE($13::jsonb, '[]'::jsonb))
        AS x(
          note_id       BIGINT,
          note_text     TEXT,
          note_type_cd  TEXT,     -- NEW
          deleted       BOOLEAN
        )
    ),
    del_notes AS (
      DELETE FROM evomail.subscriber_note sn
      USING input_notes x
      WHERE x.deleted IS TRUE
        AND x.note_id IS NOT NULL
        AND sn.note_id = x.note_id
        AND sn.fk_subscriber_id = $1
        AND lower(sn.note_type_cd) not in ('system','compliance')          -- block delete of system notes
      RETURNING sn.note_id
    ),
    upd_notes AS (
      UPDATE evomail.subscriber_note sn
      SET note_text        = COALESCE(NULLIF(x.note_text,''), sn.note_text),
          last_mod_user_id = COALESCE(NULLIF($12,''), 'web'),
          last_mod_ts      = now()
      FROM input_notes x
      WHERE (x.deleted IS DISTINCT FROM TRUE)    -- not deleted
        AND x.note_id IS NOT NULL                -- existing
        AND sn.note_id = x.note_id
        AND sn.fk_subscriber_id = $1
        AND lower(sn.note_type_cd) not in ('system','compliance')         -- block edits of system notes
      RETURNING sn.note_id
    ),
    ins_notes AS (
      INSERT INTO evomail.subscriber_note
        (fk_subscriber_id, note_text, note_ts, note_user_id, note_type_cd, create_user_id, last_mod_user_id)
      SELECT
        $1,
        x.note_text,
        now(),
        COALESCE(NULLIF($12,''), 'web'),
        CASE WHEN lower(NULLIF(x.note_type_cd,'')) = 'system'
            THEN 'system'                        -- allow explicit system auto-note
            ELSE 'user'                          -- default new notes to user
        END,
        COALESCE(NULLIF($12,''), 'web'),
        COALESCE(NULLIF($12,''), 'web')
      FROM input_notes x
      WHERE (x.deleted IS DISTINCT FROM TRUE)    -- not deleted
        AND x.note_id IS NULL                    -- new
        AND NULLIF(x.note_text,'') IS NOT NULL
      RETURNING note_id
    ),

    /* Legacy single-note support (optional) -> force user type */
    note_single AS (
      INSERT INTO evomail.subscriber_note
        (fk_subscriber_id, note_text, note_ts, note_user_id, note_type_cd, create_user_id, last_mod_user_id)
      SELECT
        $1,
        NULLIF($11,''),
        now(),
        COALESCE(NULLIF($12,''), 'web'),
        'user',                                   -- legacy single note is user-authored
        COALESCE(NULLIF($12,''), 'web'),
        COALESCE(NULLIF($12,''), 'web')
      WHERE $11 IS NOT NULL AND $11 <> '' AND (SELECT COUNT(*) FROM input_notes)=0
      RETURNING note_id
    )


     /* ===== Addresses upsert/delete from JSON ===== */
    , input_addresses AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE($14::jsonb, '[]'::jsonb))
        AS x(address_id BIGINT, address_line_1 TEXT, is_primary BOOLEAN, deleted BOOLEAN)
    ),
    del_addr AS (
      DELETE FROM evomail.subscriber_address sa
      USING input_addresses x
      WHERE x.deleted IS TRUE
        AND x.address_id IS NOT NULL
        AND sa.address_id = x.address_id
        AND sa.fk_subscriber_id = $1
      RETURNING sa.address_id
    ),
    upd_addr AS (
      UPDATE evomail.subscriber_address sa
      SET address_line_1   = COALESCE(NULLIF(x.address_line_1,''), sa.address_line_1),
          is_primary       = COALESCE(x.is_primary, sa.is_primary),
          last_mod_user_id = COALESCE(NULLIF($12,''), 'web'),
          last_mod_ts      = now()
      FROM input_addresses x
      WHERE (x.deleted IS DISTINCT FROM TRUE)
        AND x.address_id IS NOT NULL
        AND sa.address_id = x.address_id
        AND sa.fk_subscriber_id = $1
      RETURNING sa.address_id
    ),
    ins_addr AS (
      INSERT INTO evomail.subscriber_address
        (fk_subscriber_id, address_line_1, is_primary, create_user_id, last_mod_user_id)
      SELECT $1,
            x.address_line_1,
            COALESCE(x.is_primary, FALSE),
            COALESCE(NULLIF($12,''), 'web'),
            COALESCE(NULLIF($12,''), 'web')
      FROM input_addresses x
      WHERE (x.deleted IS DISTINCT FROM TRUE)
        AND x.address_id IS NULL
        AND NULLIF(x.address_line_1,'') IS NOT NULL
      RETURNING address_id
    )

    SELECT
      (SELECT subscriber_id FROM upd_sub) AS subscriber_id,
      COALESCE((SELECT address_id FROM addr_upd),
               (SELECT address_id FROM addr_ins)) AS primary_address_id,
      (SELECT COUNT(*) FROM upd_notes) AS notes_updated,
      (SELECT COUNT(*) FROM ins_notes) AS notes_inserted,
      (SELECT COUNT(*) FROM note_single) AS single_note_inserted,
      (SELECT COUNT(*) FROM del_addr) AS addresses_deleted,
      (SELECT COUNT(*) FROM upd_addr) AS addresses_updated,
      (SELECT COUNT(*) FROM ins_addr) AS addresses_inserted
  `;

  try {
    const params = [
      id,                       // $1
      nz(firstName),            // $2
      nz(lastName),             // $3
      nz(company),              // $4
      nz(phone),                // $5
      nz(email),                // $6
      nz(primaryAddress),       // $7
      nz(status),               // $8
      nz(source),               // $9
      nz(bcg),                  // $10
      nz(notes),                // $11 (legacy single note)
      nz(userId),               // $12
      notesJson ? JSON.stringify(notesJson) : null,   // $13
      addressesJson ? JSON.stringify(addressesJson) : null // $14      
    ];

    const { rows } = await pool.query(sql, params);
    if (!rows[0]?.subscriber_id) return res.status(404).json({ ok:false, error:'Subscriber not found' });
    res.json({ ok:true, ...rows[0] });
  } catch (e) {
    console.error('update by id error:', e);
    res.status(500).json({ ok:false, error: e.message });
  }
});


const q_sources = `
  select partner_cd  as code,
         partner_cd as label
  from evomail.mail_partner
  order by partner_desc nulls last, partner_cd
`;

const q_statuses = `
  select status_cd   as code,
         status_cd   as label
  from evomail.status
  order by status_desc nulls last, status_cd
`;

const q_bcg = `
  select bcg_status_cd as code,
         bcg_status_cd as label
  from evomail.bcg_status
  order by bcg_status_desc nulls last, bcg_status_cd
`;

const q_mailType = `
  select mail_type_cd as code,
         mail_type_cd as label
  from evomail.mail_type
  order by mail_type_desc nulls last, mail_type_cd
`;

const q_mailStatus = `
  select mail_status_cd as code,
         mail_status_cd as label
  from evomail.mail_status
  order by mail_status_desc nulls last, mail_status_cd
`;



router.get('/lookups', async (_req, res) => {
  try {
    const [src, sts, bcg, mailType, mailStatus] = await Promise.all([
      pool.query(q_sources),
      pool.query(q_statuses),
      pool.query(q_bcg),
      pool.query(q_mailType),
      pool.query(q_mailStatus)
    ]);

    const map = r => r.rows.map(x => ({
      code: String(x.code || '').trim(),
      label: String(x.label || x.code || '').trim()
    }));

    res.json({
      sources:    map(src),
      statuses:   map(sts),
      bcg:        map(bcg),
      mailType:   map(mailType),
      mailStatus: map(mailStatus),
    });
  } catch (err) {
    console.error('GET /lookups error:', err);
    res.status(500).json({ error: 'Failed to load lookups' });
  }
});


router.post('/subscribers/:id/inactivate', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send('valid subscriber id is required');
  }

  //Get session cookie and extract display name
  const { display_name, email, user_id } = req.user;  // set by middleware now
  const user = display_name || email || 'web';
  //console.log("Session user name = " + user_name);

  const bcg  = 'closed';

  const noteText =
    String(req.body?.note_text || '').trim()
    || `Account closed: BCG set to '${bcg}'`; // by ${user}`;

  try {
    const sql = `
      with m_bcg as (
        select bcg_status_id,
               coalesce(bcg_status_desc, bcg_status_cd) as label
          from evomail.bcg_status
         where lower(bcg_status_cd) = lower($1)
         limit 1
      ),
      upd as (
        update evomail.subscriber s
           set fk_bcg_status_id = (select bcg_status_id from m_bcg),
               last_mod_user_id = $2,
               last_mod_ts      = now()
         where s.subscriber_id   = $3
           and (s.fk_bcg_status_id is distinct from (select bcg_status_id from m_bcg))
        returning s.subscriber_id
      ),
      ins as (
        insert into evomail.subscriber_note
            (fk_subscriber_id, note_text, note_ts,
             note_user_id, create_user_id, last_mod_user_id)
        select $3, $4, now(), $2, $2, $2
         where exists (select 1 from upd)
        returning note_id
      )
      select
        (select label from m_bcg)                                  as label,
        (select count(*) from upd)                                 as updated,
        exists (select 1 from evomail.subscriber where subscriber_id = $3) as exists,
        (select note_id from ins)                                  as note_id
    `;

    const { rows } = await pool.query(sql, [bcg, user, id, noteText]);
    const row = rows?.[0];

    if (!row?.label) {
      return res.status(400).send(`Unknown BCG code '${bcg}'.`);
    }
    if (!row.exists) {
      return res.status(404).send(`Subscriber ${id} not found.`);
    }
    if (Number(row.updated) > 0) {
      // Successfully changed + note inserted
      return res.send(`Subscriber(${id}) account completely closed.`);
    }
    // Already closed — no new note
    //return res.status(200).send(`Subscriber ${id} BCG already '${row.label}'.`);
  } catch (e) {
    console.error(e);
    res.status(500).send('DB error: ' + e.message);
  }
});



router.post('/subscribers/:id/reactivate', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send('valid subscriber id is required');
  }

  const bcg  = 'complete';
  
  //Get session cookie and extract display name
  const { display_name, email, user_id } = req.user;  // set by middleware now
  const user = display_name || email || 'web';
  //console.log("Session user name = " + user);

  //const user = (req.user?.email || 'web');
  const noteText =
    String(req.body?.note_text || '').trim()
    || `Account restored: BCG set to '${bcg}'`; // by ${user}`;

  try {
    const sql = `
      with m_bcg as (
        select bcg_status_id,
               coalesce(bcg_status_desc, bcg_status_cd) as label
          from evomail.bcg_status
         where lower(bcg_status_cd) = lower($1)
         limit 1
      ),
      m_closed as (
        select status_id as closed_id
          from evomail.status
         where lower(status_cd) = 'closed'
         limit 1
      ),
      -- PMB of the target subscriber
      tgt as (
        select subscriber_id, pmb
          from evomail.subscriber
         where subscriber_id = $3
         limit 1
      ),
      -- Any other subscriber on the same PMB with status <> closed?
      conflict as (
        select 1
          from evomail.subscriber s2
         where s2.pmb = (select pmb from tgt)
           and s2.subscriber_id <> (select subscriber_id from tgt)
           and s2.fk_status_id is distinct from (select closed_id from m_closed)
         limit 1
      ),
      upd as (
        update evomail.subscriber s
           set fk_bcg_status_id = (select bcg_status_id from m_bcg),
               last_mod_user_id = $2,
               last_mod_ts      = now()
         where s.subscriber_id   = $3
           and not exists (select 1 from conflict)
           and s.fk_bcg_status_id is distinct from (select bcg_status_id from m_bcg)
        returning s.subscriber_id
      ),
      ins as (
        insert into evomail.subscriber_note
            (fk_subscriber_id, note_text, note_ts,
             note_user_id, create_user_id, last_mod_user_id)
        select $3, $4, now(), $2, $2, $2
         where exists (select 1 from upd)
        returning note_id
      )
      select
        exists (select 1 from tgt)                                    as exists,
        (select label from m_bcg)                                     as label,
        (select count(*) from conflict)                               as has_conflict,
        (select count(*) from upd)                                    as updated,
        (select note_id from ins)                                     as note_id
    `;

    const { rows } = await pool.query(sql, [bcg, user, id, noteText]);
    const row = rows?.[0];

    if (!row?.exists)      return res.status(404).send(`Subscriber ${id} not found.`);
    if (!row?.label)       return res.status(400).send(`Unknown BCG code '${bcg}'.`);
    if (Number(row.has_conflict) > 0) {
      return res.status(409).send(`Cannot reactivate: another subscriber on the same PMB is not closed.`);
    }
    if (Number(row.updated) > 0) {
      return res.send(`Subscriber(${id}) account restored successfully.`);
    }
    //return res.status(200).send(`Subscriber ${id} BCG already '${row.label}'.`);
  } catch (e) {
    console.error(e);
    res.status(500).send('DB error: ' + e.message);
  }
});




// Create a new subscriber (no duplicate PMB+Status if status != 'closed')
router.post('/subscribers', async (req, res) => {
  const {
    pmb,
    firstName,
    lastName,
    company,
    phone,
    email,
    status,          // code or label (we match case-insensitively)
    source,          // code or label
    primaryAddress,  // free-form textarea, will be normalized to one line
    notes            // optional: user-entered note at creation time
  } = req.body || {};

  //Get session cookie and extract display name
  const { display_name, uemail, user_id } = req.user;  // set by middleware now
  const user = display_name || email || 'web';
  //console.log("Session user name = " + user);

  //const user = (req.user?.email || 'web');
  const nz = v => (v === undefined || v === null || v === '') ? null : v;

  // basic validation
  if (!pmb || !/^\d+$/.test(String(pmb))) {
    return res.status(400).json({ error: 'Valid numeric PMB is required' });
  }
  if (!status) return res.status(400).json({ error: 'Status is required' });
  if (!source) return res.status(400).json({ error: 'Source is required' });

  // normalize the address to a single line
  const oneLineAddress = String(primaryAddress || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve foreign keys (status, partner/source, bcg=new)
    const sel = await client.query(
      `
      with m_status as (
        select status_id, lower(status_cd) as status_cd
          from evomail.status
         where lower(status_cd) = lower($1)
         limit 1
      ),
      m_partner as (
        select mail_partner_id, lower(partner_cd) as partner_cd
          from evomail.mail_partner
         where lower(partner_cd) = lower($2)
         limit 1
      ),
      m_bcg as (
        select bcg_status_id, lower(bcg_status_cd) as bcg_status_cd
          from evomail.bcg_status
         where lower(bcg_status_cd) = 'new'
         limit 1
      )
      select
        (select status_id  from m_status)       as status_id,
        (select partner_cd from m_partner)      as partner_cd,
        (select mail_partner_id from m_partner) as mail_partner_id,
        (select bcg_status_id from m_bcg)       as bcg_status_id
      `,
      [String(status), String(source)]
    );

    const row = sel.rows[0] || {};
    if (!row.status_id)  { await client.query('ROLLBACK'); return res.status(400).json({ error: `Unknown status '${status}'` }); }
    if (!row.mail_partner_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Unknown source '${source}'` }); }
    if (!row.bcg_status_id)   { await client.query('ROLLBACK'); return res.status(400).json({ error: `BCG code 'new' not found` }); }

    // Duplicate check: same PMB + same Status, where status != 'closed'
    const dupe = await client.query(
      `
      select 1
        from evomail.subscriber s
        join evomail.status st on st.status_id = s.fk_status_id
       where s.pmb::text = $1
         And lower(st.status_cd) <> 'closed'
       limit 1
      `,
      [String(pmb)]
    );
    if (dupe.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `A non-closed subscriber with PMB ${pmb} and status '${String(status).toLowerCase()}' already exists.`
      });
    }

    // Insert subscriber
    const insSub = await client.query(
      `
      insert into evomail.subscriber
        (pmb, first_name, last_name, company, phone, email,
         fk_status_id, fk_mail_partner_id, fk_bcg_status_id,
         create_user_id, last_mod_user_id)
      values
        ($1, $2, $3, nullif($4,''), nullif($5,''), nullif($6,''),
         $7, $8, $9,
         $10, $10)
      returning subscriber_id
      `,
      [
        String(pmb), nz(firstName), nz(lastName), nz(company), nz(phone), nz(email),
        row.status_id, row.mail_partner_id, row.bcg_status_id,
        user
      ]
    );

    const subscriber_id = insSub.rows[0].subscriber_id;

    // Insert primary address (single-line), if provided
    if (oneLineAddress) {
      await client.query(
        `
        insert into evomail.subscriber_address
          (fk_subscriber_id, address_line_1, is_primary, create_user_id, last_mod_user_id)
        values ($1, $2, true, $3, $3)
        `,
        [subscriber_id, oneLineAddress, user]
      );
    }

    // Insert creation note (always add one)
    const noteText = (String(notes || '').trim())
      ? `Account added by ${user} — ${String(notes).trim()}`
      : `Account added by ${user}`;
    await client.query(
      `
      insert into evomail.subscriber_note
        (fk_subscriber_id, note_text, note_ts, note_user_id, create_user_id, last_mod_user_id)
      values ($1, $2, now(), $3, $3, $3)
      `,
      [subscriber_id, noteText, user]
    );

    await client.query('COMMIT');
    res.json({ ok: true, subscriber_id });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('add subscriber error:', e);
    res.status(500).json({ error: e.message || 'DB error' });
  } finally {
    client.release();
  }
});



/* Fetch all partner groups + emails */
router.get('/mail/group-emails', async (req, res) => {
  try {
    const sql = `
      SELECT mp.partner_cd,
             array_agg(DISTINCT lower(trim(s.email)) ORDER BY lower(trim(s.email))) AS emails
      FROM evomail.subscriber s
      JOIN evomail.status st
        ON st.status_id = s.fk_status_id
      JOIN evomail.mail_partner mp
        ON mp.mail_partner_id = s.fk_mail_partner_id
      WHERE lower(st.status_cd) <> 'closed'
        AND s.email IS NOT NULL
        AND trim(s.email) <> ''
      GROUP BY mp.partner_cd
      ORDER BY mp.partner_cd;
    `;
    const { rows } = await pool.query(sql);
    // map to { iPostal:[], AnyTimeMailBox:[], ... }
    const out = {};
    for (const r of rows) out[r.partner_cd] = r.emails || [];
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load group emails.');
  }
});

/* Optional: fetch one partner */
router.get('/mail/group-emails/:partner_cd', async (req, res) => {
  try {
    const { partner_cd } = req.params;
    const sql = `
      SELECT DISTINCT lower(trim(s.email)) AS email
      FROM evomail.subscriber s
      JOIN evomail.status st
        ON st.status_id = s.fk_status_id
      JOIN evomail.mail_partner mp
        ON mp.mail_partner_id = s.fk_mail_partner_id
      WHERE lower(st.status_cd) <> 'closed'
        AND s.email IS NOT NULL
        AND trim(s.email) <> ''
        AND lower(mp.partner_cd) = lower($1)
      ORDER BY email;
    `;
    const { rows } = await pool.query(sql, [partner_cd]);
    res.json(rows.map(r => r.email));
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load partner emails.');
  }
});




// Replace any src that points to assets/evo.png (absolute, relative, or full URL)
function applyCidLogo(html = '') {
  return String(html)
    // src=".../assets/evo.png"  →  src="cid:evo-logo"
    .replace(
      /\bsrc\s*=\s*(['"])\s*(?:https?:\/\/[^"']+)?(?:\/evotechmail)?\/?assets\/evo\.png\1/ig,
      `src=$1cid:${LOGO_CID}$1`
    )
    // fallback: any bare occurrences of assets/evo.png that might remain
    .replace(/assets\/evo\.png/ig, `cid:${LOGO_CID}`);
}

/* Send email via Gmail SMTP (App Password recommended) */
router.post('/mail/send', async (req, res) => {
  const { to, cc, bcc, subject, html, text, context } = req.body || {};
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!subject || !(to || bcc)) {
    return res.status(400).json({ ok:false, error:'Missing subject and recipients' });
  }

  //Get session cookie and extract display name
  const { display_name, email, user_id } = req.user;  // set by middleware now
  const createUser = display_name || email || 'web';
  //console.log("Session user name = " + createUser);

  const batchId = randomUUID();
  const attemptNo = 1;


  try {
    const tx = await getTransport();
    const normList = v => Array.isArray(v) ? v
      : (typeof v === 'string' ? v.split(',').map(s=>s.trim()).filter(Boolean) : []);
    const toList  = normList(to);
    const ccList  = normList(cc);
    const bccList = normList(bcc);

    // optional batching for big BCC lists
    const maxBcc = Number(process.env.BCC_BATCH || 85);
    const batches = bccList.length
      ? Array.from({ length: Math.ceil(bccList.length / maxBcc) }, (_, i) => bccList.slice(i * maxBcc, (i + 1) * maxBcc))
      : [null];


    // logo CID
    let htmlwithcid = String(html || '');

    // replace the common forms → cid:evo-logo (keep it dead simple)
    htmlwithcid = htmlwithcid
      .split('src="/evotechmail/assets/evo.png"').join(`src="cid:${LOGO_CID}"`)
      .split("src='/evotechmail/assets/evo.png'").join(`src='cid:${LOGO_CID}'`)
      .split('src="assets/evo.png"').join(`src="cid:${LOGO_CID}"`)
      .split("src='assets/evo.png'").join(`src='cid:${LOGO_CID}'`)
      // final broad fallback in case src=… isn’t matched exactly
      .split('assets/evo.png').join(`cid:${LOGO_CID}`);

    // tiny sanity log while debugging
    if (!/src\s*=\s*['"]cid:evo-logo['"]/i.test(htmlwithcid)) {
      console.warn('CID not referenced in HTML — inline image will not show');
    }

    // wherever you build the message:

    const baseAttachments = haveLogo ? [{
      filename: 'evo.png',
      path: logoPath, 
      cid: LOGO_CID,
      contentType: 'image/png',
      contentDisposition: 'inline'
    }] : [];
    
    const bodyToStore = htmlwithcid || text || '';

    const sent = [];
    for (const batch of batches) {
      const began = Date.now();
      let info = null;
      let imapInfo = null;
      let status = 'SUCCESS';
      let errMsg = null;

      try {
        info = await tx.sendMail({
          from,
          to: toList.length ? toList : undefined,
          cc: ccList.length ? ccList : undefined,
          bcc: batch || undefined,
          subject,
          html: htmlwithcid,
          text,
          attachments: baseAttachments
        });

        if (process.env.SAVE_TO_SENT === '1') {
          try {
            await saveToGmailSent({
              from, to: toList, cc: ccList, bcc: batch || undefined,
              subject, html: htmlwithcid, text, attachments: baseAttachments
            });
            imapInfo = { appended: true, folder: process.env.IMAP_SENT || '[Gmail]/Sent Mail' };
          } catch (e) {
            imapInfo = { appended: false, error: e?.message || String(e), code: e?.code || null };
            console.warn('IMAP append failed:', e?.code || e?.message || e);
          }
        }

      } catch (e) {
        status = 'FAILED';
        errMsg = e?.message || String(e);
        info = info || { accepted: [], rejected: [], response: e?.response };
      }

      const durationMs = Date.now() - began;

      // log this attempt (per batch)
      await logEmailAttempt({
        batchId, attemptNo, from, subject,
        toList, ccList, bccBatch: batch || [],
        body: bodyToStore,
        attachmentsCount: baseAttachments.length,
        provider: process.env.SMTP_MODE || 'gmail',
        host: tx.options?.host || 'smtp.gmail.com',
        port: tx.options?.port || Number(process.env.SMTP_PORT || 465),
        authUser: process.env.SMTP_USER,
        messageId: info?.messageId || null,
        durationMs,
        smtpAccepted: info?.accepted || [],
        smtpRejected: info?.rejected || [],
        smtpResponse: info?.response || (errMsg ? `ERROR: ${errMsg}` : null),
        imapInfo,
        status,
        context,
        createUser
      });

      if (status === 'FAILED') {
        // Stop and report failure after logging
        return res.status(502).json({ ok:false, error:'SMTP failed for a batch', details: errMsg, batchId });
      }

      sent.push({ messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
    }

    return res.json({ ok:true, batchId, sent });
    } catch (err) {
    const details = {
      name: err?.name,
      code: err?.code,
      command: err?.command,
      responseCode: err?.responseCode,
      message: err?.message
    };
    console.error('send-mail error:', details);
    res.status(502).json({ ok:false, error:'SMTP failed for a batch', details });
  }
});



// ADD: export emails by partners + status (+ optional business-owner filter)
router.get('/mail/export-emails', async (req, res) => {
  try {
    const rawPartners = (req.query.partners || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const status = (req.query.status || 'active').toLowerCase();
    const businessOwner = String(req.query.business_owner || '').toLowerCase() === 'true';

    if (!['active','closed'].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'closed'" });
    }
    if (!rawPartners.length && !businessOwner) {
      return res.status(400).json({ error: 'choose at least one partner or business_owner=true' });
    }

    const partners = Array.from(new Set(rawPartners)); // stable de-dupe
    const conds = [
      "s.email IS NOT NULL",
      "trim(s.email) <> ''",
      (status === 'closed') ? "lower(st.status_cd) = 'closed'" : "lower(st.status_cd) <> 'closed'"
    ];
    const params = [];

    if (partners.length) {
      conds.push("mp.partner_cd = ANY($1::text[])");
      params.push(partners);
    }
    if (businessOwner) {
      conds.push("(s.company IS NOT NULL AND trim(s.company) <> '' AND lower(trim(s.company)) <> 'individual')");
    }

    const sql = `
      SELECT DISTINCT lower(trim(s.email)) AS email
      FROM evomail.subscriber s
      JOIN evomail.status st ON st.status_id = s.fk_status_id
      JOIN evomail.mail_partner mp ON mp.mail_partner_id = s.fk_mail_partner_id
      WHERE ${conds.join(' AND ')}
      ORDER BY email
    `;

    const { rows } = await pool.query(sql, params);
    return res.json({ emails: rows.map(r => r.email).filter(Boolean).join(', ') });
  } catch (e) {
    console.error('export-emails error:', e);
    return res.status(500).json({ error: 'failed to export emails' });
  }
});





// List notifications with filters + pagination
router.get('/notifications', async (req, res) => {
  try {
    const {
      limit, offset, status, context, batch_id: batchId,
      email, q, since, until
    } = req.query;

    const data = await listNotifications({
      limit, offset, status, context, batchId,
      email, q, since, until
    });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('notifications list error:', e);
    res.status(500).json({ ok:false, error:'failed to list notifications' });
  }
});

// Get a single notification by ID
router.get('/notifications/:id', async (req, res) => {
  try {
    const row = await getNotification(Number(req.params.id));
    if (!row) return res.status(404).json({ ok:false, error:'not found' });
    res.json({ ok:true, notification: row });
  } catch (e) {
    console.error('notification get error:', e);
    res.status(500).json({ ok:false, error:'failed to get notification' });
  }
});

// Get all attempts/chunks for a batch
router.get('/notifications/batch/:batchId', async (req, res) => {
  try {
    const rows = await getBatch(req.params.batchId);
    res.json({ ok:true, batch_id: req.params.batchId, items: rows });
  } catch (e) {
    console.error('notification batch error:', e);
    res.status(500).json({ ok:false, error:'failed to get batch' });
  }
});


// simple text fallback from HTML
function htmlToText(h=''){
  return String(h).replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

router.post('/notifications/:id/resend', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok:false, error:'invalid id' });

  //Get session cookie and extract display name
  const { display_name, email, user_id } = req.user;  // set by middleware now
  const createUser = display_name || email || 'web';
  //console.log("Session user name = " + createUser);

  //const createUser = (req.user?.email) || req.get('X-User') || 'web';  
  //const createUser = (req.user?.email || 'web');

  try {
    const row = await getNotification(id);
    if (!row) return res.status(404).json({ ok:false, error:'not found' });

    const from     = row.from_addr;
    const subject  = row.subject || '';
    const stored   = String(row.body || '');
    const isHtml   = /<\w+[^>]*>/.test(stored);
    const htmlBody = isHtml ? stored : `<pre style="font-family:monospace;white-space:pre-wrap;margin:0;">${stored.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>`;
    const html     = applyCidLogo(htmlBody);
    const text     = htmlToText(html);

    const toList   = Array.isArray(row.to_addrs)  ? row.to_addrs  : [];
    const ccList   = Array.isArray(row.cc_addrs)  ? row.cc_addrs  : [];
    const bccList  = Array.isArray(row.bcc_addrs) ? row.bcc_addrs : [];

    const tx       = await getTransport();
    const maxBcc   = Number(process.env.BCC_BATCH || 85);
    const batches  = bccList.length
      ? Array.from({length: Math.ceil(bccList.length/maxBcc)}, (_,i)=> bccList.slice(i*maxBcc,(i+1)*maxBcc))
      : [null];

    const attachments = (haveLogo ? [{
      filename: 'evo.png',
      path: logoPath,
      cid: LOGO_CID,
      contentType: 'image/png',
      contentDisposition: 'inline'
    }] : []);

    const outcomes = [];
    for (const batch of batches) {
      const started = Date.now();
      try {
        const info = await tx.sendMail({
          from,
          to: toList.length ? toList : undefined,
          cc: ccList.length ? ccList : undefined,
          bcc: batch || undefined,
          subject,
          html,
          text,
          attachments
        });
        outcomes.push({
          ok: true,
          messageId: info.messageId,
          batchSize: (batch || []).length,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
          durationMs: Date.now() - started
        });
      } catch (err) {
        outcomes.push({
          ok: false,
          error: {
            name: err?.name,
            code: err?.code,
            responseCode: err?.responseCode,
            message: err?.message
          },
          batchSize: (batch || []).length,
          durationMs: Date.now() - started
        });
      }
    }

    const allOk = outcomes.every(o => o.ok);
    const overallStatus = allOk ? 'SUCCESS' : 'FAILED';
    const attemptNo = (row.attempt_no || 1) + 1;

    const resultDetails = {
      resent: true,
      outcomes
    };
    const deliveryMetaPatch = {
      provider: 'gmail',
      smtp_host: tx.options?.host,
      smtp_port: tx.options?.port,
      auth_user: process.env.SMTP_USER
    };

    await updateNotificationAttempt({
      notificationId: id,
      attemptNo,
      overallStatus,
      resultDetails,
      createUser,
      deliveryMetaPatch
    });

    return res.status(allOk ? 200 : 207).json({ ok: allOk, partial: !allOk, outcomes });
  } catch (e) {
    console.error('resend failed:', e);
    return res.status(500).json({ ok:false, error: e?.message || 'resend failed' });
  }
});


///notifications/:id/resend'
////// subscribers mail:::

// GET inbox items for a subscriber (emit correct preview URL)
// GET /mailinbox/subscribers/:id/inbox
router.get('/mailinbox/subscribers/:id/inbox', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad subscriber id' });

  try {
    const { limit = 150, offset = 0, statuses } = req.query;
    // statuses can be: undefined -> default (inserted,scanned)
    //                  "all"     -> all statuses
    //                  "inserted,scanned" -> custom set
    let statusCds;
    if (typeof statuses === 'string') {
      if (statuses.toLowerCase() === 'all') {
        statusCds = null; // no filter
      } else {
        const parts = statuses.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        statusCds = parts.length ? [...new Set(parts)] : null;
      }
    } else {
      statusCds = ['inserted','scanned']; // default inbox
    }

    const items = await listSubscriberInbox({ subscriberId: id, limit, offset, statusCds });
    const out = items.map(r => ({
      ...r,
      preview_url: r.image_path ? `/evotechmail/api/mailinbox/${r.mail_id}/image` : null,
    }));
    res.json({ items: out });
  } catch (e) {
    console.error('GET inbox failed:', e);
    res.status(500).json({ error: 'Failed to load inbox' });
  }
});



router.get('/mailinbox/:mailId/image', async (req, res) => {
  const mailId = Number(req.params.mailId);
  if (!Number.isFinite(mailId)) return res.sendStatus(404);

  try {
    const row = await getMailItem(mailId);
    if (!row || !row.image_path) return res.sendStatus(404);

    const { attachment, public_url } = normalize_image_attachment(row.image_path);

    // Case 1: We have a local filesystem path we can stream
    if (attachment?.path && !/^https?:\/\//i.test(attachment.path)) {
      const filePath = attachment.path;           // already resolved by mail_path.js
      const type = attachment.contentType || mime.lookup(filePath) || 'application/octet-stream';
      res.setHeader('Content-Type', type);

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        console.error('image stream error:', err?.message);
        res.sendStatus(404);
      });
      return stream.pipe(res);
    }

    // Case 2: No local file but we have a public URL -> redirect (or you can proxy)
    if (public_url && /^https?:\/\//i.test(public_url)) {
      return res.redirect(302, public_url);
    }

    // Case 3: Last resort — try the raw DB path as-is
    const rawPath = row.image_path;
    if (rawPath && fs.existsSync(rawPath)) {
      const type = mime.lookup(rawPath) || 'application/octet-stream';
      res.setHeader('Content-Type', type);
      return fs.createReadStream(rawPath).pipe(res);
    }

    return res.sendStatus(404);
  } catch (e) {
    console.error('image route error:', e);
    res.sendStatus(500);
  }
});


router.get('/mailinbox/statuses', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT mail_status_id AS id, mail_status_cd AS code, mail_status_desc AS desc
      FROM evomail.mail_status
      ORDER BY LOWER(mail_status_cd)
    `);
    res.json({ statuses: rows });
  } catch (e) {
    console.error('statuses error', e);
    res.status(500).json({ error: 'Failed to load statuses' });
  }
});


router.get('/mailinbox/mail/:mailId/events', async (req, res) => {
  const mailId = Number(req.params.mailId);
  if (!Number.isFinite(mailId)) return res.sendStatus(400);
  try {
    const { rows } = await pool.query(`
      SELECT e.id,
             e.create_ts,
             e.create_user_id,
             e.comment,
             ms.mail_status_cd AS status_cd
      FROM evomail.mail_life_events e
      JOIN evomail.mail_status ms ON ms.mail_status_id = e.fk_mail_status_id
      WHERE e.fk_mail_id = $1
      ORDER BY e.create_ts ASC
    `, [mailId]);
    res.json({ events: rows });
  } catch (e) {
    console.error('events error', e);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

router.post('/mailinbox/mail/:mailId/action', async (req, res) => {
  const mailId = Number(req.params.mailId);
  if (!Number.isFinite(mailId)) return res.status(400).json({ error: 'Bad mail id' });

  const rawCode = String(req.body?.status_cd || '').trim();
  const comment = (req.body?.comment ?? '').toString();
  if (!rawCode) return res.status(400).json({ error: 'status_cd required' });

  //Get session cookie and extract display name
  const { display_name, email, user_id } = req.user;  // set by middleware now
  const actingUser = display_name || email || 'web';
  //console.log("Session user name = " + actingUser);


  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // resolve status id (case-insensitive)
    const { rows: srows } = await client.query(
      `SELECT mail_status_id AS id, mail_status_cd AS code
       FROM evomail.mail_status
       WHERE LOWER(mail_status_cd) = LOWER($1)`,
      [rawCode]
    );
    const status = srows[0];
    if (!status) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Unknown status code' });
    }

    // update current status on the mail item
    const { rows: urows } = await client.query(`
      UPDATE evomail.subscriber_mail
      SET fk_mail_status_id = $2,
          last_mod_user_id  = $3,
          last_status_ts    = now()
      WHERE mail_id = $1
      RETURNING mail_id, fk_mail_status_id, last_mod_user_id, last_status_ts
    `, [mailId, status.id, actingUser]);

    if (!urows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Mail not found' });
    }

    // log event
    await client.query(`
      INSERT INTO evomail.mail_life_events
        (fk_mail_id, fk_mail_status_id, create_user_id, comment)
      VALUES ($1, $2, $3, NULLIF($4,''))
    `, [mailId, status.id, actingUser, comment]);

    await client.query('COMMIT');

    // respond with updated snapshot (include status code)
    res.json({
      ok: true,
      mail_id: mailId,
      last_status_cd: status.code,
      last_status_ts: urows[0].last_status_ts,
      last_mod_user_id: urows[0].last_mod_user_id
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('apply status error', e);
    res.status(500).json({ error: 'Failed to update status' });
  } finally {
    client.release();
  }
});



//////////////////////////
/////// Compliance ///////
//////////////////////////

// --- Compliance search: list subscribers with filters -----------------------
// GET /evotechmail/api/compliance/subscribers
// GET /evotechmail/api/compliance/subscribers
router.get('/compliance/subscribers', async (req, res) => {
  try {
    const qRaw       = (req.query.q || '').toString().trim();
    const statusRaw  = (req.query.status || '').toString().trim();
    const compliant  = (req.query.compliant || 'all').toString().trim().toLowerCase();
    const limitRaw   = Number(req.query.limit);
    const offsetRaw  = Number(req.query.offset);

    const limit  = Number.isFinite(limitRaw)  ? Math.min(Math.max(limitRaw, 1), 500) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const params = [];
    const where  = [];

    // PMB exact match ONLY
    const pmb = Number.parseInt(qRaw, 10);
    if (Number.isFinite(pmb)) {
      params.push(pmb);
      where.push(`s.pmb = $${params.length}`);
    }

    // status filter (code)
    if (statusRaw) {
      params.push(statusRaw.toLowerCase());
      where.push(`LOWER(st.status_cd) = $${params.length}`);
    }

    // compliant filter
    if (compliant === 'true' || compliant === 'false') {
      params.push(compliant === 'true');
      where.push(`s.usps_compliant = $${params.length}`);
    }

    // paging params
    params.push(limit);
    const limIdx = params.length;
    params.push(offset);
    const offIdx = params.length;

    const sql = `
      SELECT
        s.subscriber_id,
        s.pmb,
        s.first_name,
        s.last_name,
        s.company,
        COALESCE(st.status_cd, 'unknown')   AS status,
        COALESCE(bcg.bcg_status_cd, 'unknown') AS bcg_status,
        s.usps_compliant,
        s.last_status_ts
      FROM evomail.subscriber s
      LEFT JOIN evomail.status      st  ON st.status_id       = s.fk_status_id
      LEFT JOIN evomail.bcg_status  bcg ON bcg.bcg_status_id  = s.fk_bcg_status_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY s.pmb ASC
      LIMIT $${limIdx} OFFSET $${offIdx}
    `;

    const { rows } = await pool.query(sql, params);
    res.json({ items: rows });
  } catch (e) {
    console.error('GET /compliance/subscribers failed:', e);
    res.status(500).json({ error: 'Failed to load subscribers' });
  }
});



// --- List compliance notes for a subscriber ---------------------------------
router.get('/compliance/subscribers/:id/notes', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  try {
    const { rows } = await pool.query(`
      SELECT note_id, note_text, note_user_id, note_ts, note_type_cd
      FROM evomail.subscriber_note
      WHERE fk_subscriber_id = $1
        AND lower(note_type_cd) IN ('compliance') 
      ORDER BY note_ts DESC
      LIMIT 500
    `, [id]);
    res.json({ notes: rows });
  } catch (e) {
    console.error('GET compliance notes error:', e);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

// --- Toggle compliance + (optional) log note (transactional) ----------------
router.post('/subscribers/:id/compliance', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });

  const compliant = req.body?.compliant;
  const hasBool   = (typeof compliant === 'boolean');     // allow "note-only"
  const noteText  = String(req.body?.note || '').trim();

  //Get session cookie and extract display name
  const { display_name, email, user_id } = req.user;  // set by middleware now
  const user = display_name || email || 'web';
  //console.log("Session user name = " + user);

  const actor = user;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query('SELECT usps_compliant FROM evomail.subscriber WHERE subscriber_id=$1 FOR UPDATE', [id]);
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Subscriber not found' }); }

    const was = cur.rows[0].usps_compliant;

    // change flag if provided and different
    if (hasBool && was !== compliant) {
      await client.query(
        `UPDATE evomail.subscriber
           SET usps_compliant=$2, last_mod_user_id=$3, last_mod_ts=now()
         WHERE subscriber_id=$1`,
        [id, compliant, actor]
      );
    }

    // add note if provided (or auto-line when flag changed without note)
    if (noteText || (hasBool && was !== compliant)) {
      const auto = hasBool && was !== compliant
        ? (compliant ? 'Marked USPS compliant' : 'Marked NOT compliant')
        : '';
      await client.query(
        `INSERT INTO evomail.subscriber_note
           (fk_subscriber_id, note_text, note_user_id, note_type_cd, create_user_id, last_mod_user_id)
         VALUES ($1, $2, $3, 'compliance', $3, $3)`,
        [id, noteText || auto, actor]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, usps_compliant: hasBool ? compliant : was });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST compliance error:', e);
    res.status(500).json({ error: 'Failed to update compliance' });
  } finally {
    client.release();
  }
});


export default router;
