// routes/reports.js
import express from 'express';
import { pool } from './db.js'; // your pg Pool
import { requireAuth } from '../middleware/requireAuth.js';
const router = express.Router();

const MAX_ROWS_PER_SECTION = 2000;
const STMT_TIMEOUT_MS = 8000;

// Robust parser for "#TITLE# <label>" sections
export function parseReportSql(text = '') {
    const out = [];
    let cur = null;
  
    // Normalize newlines and iterate line-by-line
    const lines = String(text).split(/\r?\n/);
  
    for (const raw of lines) {
      const line = raw.trim();
  
      // New section starts
      const m = line.match(/^#TITLE#\s*(.+)$/i);
      if (m) {
        // flush previous
        if (cur && cur.sql.trim()) {
          out.push({
            title: cur.title,
            sql: cur.sql.trim().replace(/;+\s*$/,'')   // drop trailing semicolons
          });
        }
        cur = { title: m[1].trim(), sql: '' };
        continue;
      }
  
      // accumulate into current section (ignore text before first title)
      if (cur) cur.sql += raw + '\n';
    }
  
    // flush last
    if (cur && cur.sql.trim()) {
      out.push({
        title: cur.title,
        sql: cur.sql.trim().replace(/;+\s*$/,'')
      });
    }
  
    return out; // [{title, sql}, ...]
  }

// Verify: run each section with limit & timeout, return row counts
router.post('/verify', async (req, res) => {
    try {
      const { report_name = '', report_sql = '' } = req.body || {};
      const sections = parseReportSql(report_sql);
      if (!sections.length) {
        return res.status(400).json({ ok:false, error:'No #TITLE# sections found' });
      }
  
      const results = [];
      for (const sec of sections) {
        const t0 = Date.now();
  
        // Count rows safely
        const { rows: cntRows } = await pool.query(
          `WITH _q AS (${sec.sql}) SELECT COUNT(*)::int AS c FROM _q;`
        );
        const row_count = cntRows?.[0]?.c ?? 0;
  
        // Peek columns (only if rows > 0)
        let columns = [];
        if (row_count > 0) {
          const r1 = await pool.query(`SELECT * FROM (${sec.sql}) AS t LIMIT 1;`);
          columns = (r1.fields || []).map(f => f.name);
        }
  
        results.push({ title: sec.title, row_count, columns, ms: Date.now() - t0 });
      }
  
      res.json({ ok:true, report_name, sections: results });
    } catch (e) {
      console.error('verify failed', e);
      res.status(500).json({ ok:false, error:'Verify failed' });
    }
  });

// Create a report (no upsert-by-name)
router.post('/', async (req, res) => {
    const { report_name, report_sql } = req.body || {};

    //Get session cookie and extract display name
    const { display_name, email, user_id } = req.user;  // set by middleware now
    const user = display_name || email || 'web';
    //console.log("Session user name = " + user);

    if (!report_name || !report_sql) return res.status(400).json({ ok:false, error:'Missing name/sql' });
    try {
      parseReportSql(report_sql); // ✅ correct function name
      const q = `
        INSERT INTO evomail.reports (report_name, report_sql, create_user_id, last_mod_user_id)
        VALUES ($1,$2,$3,$3)
        RETURNING report_id, report_name, create_ts, last_mod_ts;
      `;
      const { rows } = await pool.query(q, [report_name, report_sql, user]);
      res.json({ ok:true, report: rows[0] });
    } catch (e) {
      // unique violation etc.
      if (e?.code === '23505') return res.status(409).json({ ok:false, error:'Report name already exists' });
      res.status(400).json({ ok:false, error: e.message });
    }
  });
  

// Update a report by ID (rename and/or SQL)
router.put('/:id', async (req, res) => {
    const id = Number(req.params.id);
    let  { report_name, report_sql } = req.body || {};
  
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok:false, error: 'Bad id' });
    }

    //Get session cookie and extract display name
    const { display_name, email, user_id } = req.user;  // set by middleware now
    const user = display_name || email || 'web';
    //console.log("Session user name = " + user);
  
    try {
      // Load current to allow partial updates
      const cur = await pool.query(
        'SELECT report_name, report_sql FROM evomail.reports WHERE report_id = $1',
        [id]
      );
      if (!cur.rowCount) return res.status(404).json({ ok:false, error:'Not found' });
  
      const prev = cur.rows[0];
  
      // Use provided values or fall back to existing
      report_name = (report_name ?? prev.report_name)?.trim();
      report_sql  = (report_sql  ?? prev.report_sql);
  
      if (!report_name) return res.status(400).json({ ok:false, error:'Missing report_name' });
  
      // Only validate SQL when it actually changed
      if (report_sql !== prev.report_sql) {
        parseReportSql(report_sql); // throws on bad SQL sections
      }
  
      const q = `
        UPDATE evomail.reports
           SET report_name      = $2,
               report_sql       = $3,
               last_mod_user_id = $4,
               last_mod_ts      = now()
         WHERE report_id = $1
         RETURNING report_id, report_name, last_mod_ts
      `;
      const { rows } = await pool.query(q, [id, report_name, report_sql, user]);
      return res.json({ ok:true, report: rows[0] });
  
    } catch (e) {
      if (e?.code === '23505') { // unique_violation on report_name
        return res.status(409).json({ ok:false, error:'Report name already exists' });
      }
      console.error('PUT /reports/:id failed:', e);
      return res.status(400).json({ ok:false, error: e.message || 'Update failed' });
    }
  });
  
  

// List reports (active only by default)
router.get('/', async (req, res) => {
    const { all = 'false' } = req.query;
    const sql = `
      SELECT r.report_id, r.report_name, r.active
      FROM evomail.reports r
      ${all === 'true' ? '' : 'WHERE r.active = TRUE'}
      ORDER BY lower(r.report_name)
    `;
    const { rows } = await pool.query(sql);
    res.json({ items: rows });
  });
  

// Execute a report by id (JSON), optional TSV per section
// Execute a report by id (JSON) + write to evomail.reports_execution_log
router.post('/:id/execute', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'Bad id' });
  
  
    // load report
    let rpt;
    try {
      const r = await pool.query(
        `SELECT report_id, report_name, report_sql FROM evomail.reports WHERE report_id=$1`,
        [id]
      );
      rpt = r.rows[0];
      if (!rpt) return res.status(404).json({ ok:false, error:'Not found' });
    } catch (e) {
      return res.status(500).json({ ok:false, error:'Load failed' });
    }
  
    // parse sections
    let sections;
    try {
      sections = parseReportSql(rpt.report_sql);
      if (!sections.length) {
        return res.status(400).json({ ok:false, error:'No #TITLE# sections found' });
      }
    } catch (e) {
      return res.status(400).json({ ok:false, error:'Invalid report SQL' });
    }
  
    // create a log row in FAIL state (so constraint passes even if we crash)
    let logId = null;
    try {
      const { display_name, email, user_id } = req.user;  // set by middleware now
      const executedBy = display_name || email || 'web';
      //console.log("Session user name = " + executedBy);

      const ins = await pool.query(
        `INSERT INTO evomail.reports_execution_log
           (fk_report_id, started_ts, status_cd, rowsets, rows_total, message, executed_by)
         VALUES ($1, now(), 'FAIL', 0, 0, 'started', $2)
         RETURNING id`,
        [rpt.report_id, executedBy]
      );
      logId = ins.rows[0]?.id ?? null;
    } catch (e) {
      // don’t block execution if logging insert fails
      console.error('log insert failed:', e?.message);
    }
  
    const payload = [];
    let rowsTotal = 0;
  
    try {
      // run each section
      for (const sec of sections) {
        const t0 = Date.now();
        const result = await pool.query(sec.sql); // you can SET LOCAL statement_timeout in a TX if desired
        const cols   = (result.fields || []).map(f => f.name);
        const rows   = result.rows || [];
        rowsTotal += rows.length;
  
        payload.push({
          title: sec.title,
          rows,
          columns: cols,
          ms: Date.now() - t0
        });
      }
  
      // success update
      if (logId) {
        await pool.query(
          `UPDATE evomail.reports_execution_log
              SET ended_ts = now(),
                  status_cd = 'SUCCESS',
                  rowsets   = $1,
                  rows_total= $2,
                  message   = NULL
            WHERE id = $3`,
          [sections.length, rowsTotal, logId]
        );
      }
  
      return res.json({
        ok: true,
        report_id: rpt.report_id,
        report_name: rpt.report_name,
        sections: payload
      });
  
    } catch (e) {
      console.error('execute failed', e);
      // fail update
      if (logId) {
        const msg = (e?.message || 'Execution failed').slice(0, 2000);
        try {
          await pool.query(
            `UPDATE evomail.reports_execution_log
                SET ended_ts = now(),
                    status_cd = 'FAIL',
                    message   = $1
              WHERE id = $2`,
            [msg, logId]
          );
        } catch (e2) {
          console.error('log update failed:', e2?.message);
        }
      }
      return res.status(500).json({ ok:false, error:'Execution failed' });
    }
  });
  

// TSV download for a single section index (0-based)
router.get('/:id/execute/tsv', async (req, res) => {
  const id = Number(req.params.id);
  const sectionIndex = Number(req.query.section ?? -1);
  if (!Number.isFinite(id) || sectionIndex < 0) return res.status(400).end();

  const r1 = await pool.query(`SELECT report_name, report_sql FROM evomail.reports WHERE report_id=$1 AND active=TRUE`, [id]);
  const rpt = r1.rows[0];
  if (!rpt) return res.sendStatus(404);

  let sections;
  try { sections = parseReportSql(rpt.report_sql); }
  catch { return res.status(400).end(); }

  const sect = sections[sectionIndex];
  if (!sect) return res.status(404).end();

  const sql = `SELECT * FROM (${sect.sql}) t LIMIT ${MAX_ROWS_PER_SECTION}`;
  const { rows, fields } = await pool.query(sql);

  res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${rpt.report_name.replace(/\W+/g,'_')}_sec${sectionIndex+1}.tsv"`);

  // header
  const cols = fields.map(f=>f.name);
  res.write(cols.join('\t') + '\n');
  // rows
  for (const r of rows) {
    const line = cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.replace(/\t/g,' ').replace(/\r?\n/g,' ');
    }).join('\t');
    res.write(line + '\n');
  }
  res.end();
});

// GET /evotechmail/api/reports/:id  -> load one report with SQL for editing
router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
    const r = await pool.query(
      `SELECT report_id, report_name, report_sql, active, create_ts, last_mod_ts
         FROM evomail.reports WHERE report_id=$1`,
      [id]
    );
    const row = r.rows[0];
    if (!row) return res.sendStatus(404);
    res.json(row);
  });

// DELETE a report (soft by default; hard when ?hard=true)
router.delete('/:id', async (req, res) => {
    const id   = Number(req.params.id);
    const hard = String(req.query.hard || 'false').toLowerCase() === 'true';
    const user = req.get('X-User') || 'web';
    if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:'Bad id' });
  
    try {
      if (hard) {
        await pool.query('DELETE FROM evomail.reports WHERE report_id = $1', [id]);
        return res.json({ ok:true, hard:true });
      } else {
        const q = `
          UPDATE evomail.reports
          SET active = FALSE,
              last_mod_user_id = $2,
              last_mod_ts = now(),
              report_name = report_name || '--deleted'
          WHERE report_id = $1
        `;
        const r = await pool.query(q, [id, user]);
        return res.json({ ok:true, hard:false, changed:r.rowCount });
      }
    } catch (e) {
      console.error('DELETE /reports/:id failed:', e);
      res.status(500).json({ ok:false, error:'Failed to delete report' });
    }
  });
  
  

export default router;
