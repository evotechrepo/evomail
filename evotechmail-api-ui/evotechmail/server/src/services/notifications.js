// services/notifications.js
import pkg from 'pg';
const { Pool } = pkg;
import { pool } from './db.js';

// reuse your existing helpers/constants:
const LOGO_CID = 'evo-logo';

// Change this if your table is elsewhere
const TABLE = process.env.NOTIF_TABLE || 'evomail.notification';

export async function logEmailAttempt({
  batchId, attemptNo = 1, from, subject,
  toList = [], ccList = [], bccBatch = [],
  body = '', attachmentsCount = 0,
  provider = 'gmail', host = null, port = null, authUser = null,
  messageId = null, durationMs = null,
  smtpAccepted = [], smtpRejected = [], smtpResponse = null,
  imapInfo = null, status = 'SUCCESS',
  context = null, createUser = 'web'
}) {
  const deliveryMeta = {
    to_count: toList.length,
    cc_count: ccList.length,
    bcc_count: bccBatch.length,
    rcpt_total: toList.length + ccList.length + bccBatch.length,
    attachments_count: attachmentsCount,
    provider, smtp_host: host, smtp_port: port, auth_user: authUser
  };

  const resultDetails = {
    message_id: messageId,
    duration_ms: durationMs,
    smtp: { accepted: smtpAccepted, rejected: smtpRejected, response: smtpResponse },
    imap: imapInfo
  };

  const sql = `
    INSERT INTO ${TABLE}
      (batch_id, attempt_no, from_addr, subject,
       to_addrs, cc_addrs, bcc_addrs,
       body, delivery_meta, result_details,
       status, context, create_user_id)
    VALUES
      ($1,$2,$3,$4,
       $5::text[],$6::text[],$7::text[],
       $8,$9::jsonb,$10::jsonb,
       $11,$12,$13)
    RETURNING notification_id
  `;
  const params = [
    batchId, attemptNo, from, subject,
    toList, ccList, bccBatch,
    body, JSON.stringify(deliveryMeta), JSON.stringify(resultDetails),
    status, context, createUser
  ];

  const { rows } = await pool.query(sql, params);
  return rows[0]?.notification_id;
}

export async function listNotifications({
  limit = 50, offset = 0,
  status, context, batchId, email, q, since, until
} = {}) {
  const where = [];
  const params = [];
  const idx = () => params.length + 1;

  if (status)  { where.push(`status = $${idx()}`);        params.push(status); }
  if (context) { where.push(`context ILIKE $${idx()}`);   params.push(`%${context}%`); }
  if (batchId) { where.push(`batch_id = $${idx()}`);      params.push(batchId); }
  if (since)   { where.push(`create_ts >= $${idx()}`);    params.push(new Date(since)); }
  if (until)   { where.push(`create_ts <= $${idx()}`);    params.push(new Date(until)); }
  // q: split on commas/space; search subject/body + recipients (to/cc/bcc)
  if (q) {
    const tokens = String(q).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (tokens.length) {
      const ors = [];
      for (const tok of tokens) {
        ors.push(`subject ILIKE $${idx()}`);         params.push(`%${tok}%`);
        ors.push(`body    ILIKE $${idx()}`);         params.push(`%${tok}%`);
        ors.push(`EXISTS (SELECT 1 FROM unnest(to_addrs)  t WHERE t ILIKE $${idx()})`);  params.push(`%${tok}%`);
        ors.push(`EXISTS (SELECT 1 FROM unnest(cc_addrs)  c WHERE c ILIKE $${idx()})`);  params.push(`%${tok}%`);
        ors.push(`EXISTS (SELECT 1 FROM unnest(bcc_addrs) b WHERE b ILIKE $${idx()})`);  params.push(`%${tok}%`);
      }
      where.push(`(${ors.join(' OR ')})`);
    }
  }   
  if (email) {
    where.push(`(
      EXISTS (SELECT 1 FROM unnest(to_addrs)  t WHERE lower(t) = lower($${idx()})) OR
      EXISTS (SELECT 1 FROM unnest(cc_addrs)  c WHERE lower(c) = lower($${idx()+1})) OR
      EXISTS (SELECT 1 FROM unnest(bcc_addrs) b WHERE lower(b) = lower($${idx()+2}))
    )`);
    params.push(email, email, email);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT
      notification_id, batch_id, attempt_no, last_attempt_ts,
      from_addr, subject, to_addrs, cc_addrs, bcc_addrs,
      body, delivery_meta, result_details, status, context,
      create_ts, create_user_id
    FROM ${TABLE}
    ${whereSql}
    ORDER BY create_ts DESC
    LIMIT $${idx()} OFFSET $${idx()+1}
  `;
  params.push(Number(limit), Number(offset));

  const countSql = `SELECT COUNT(*)::int AS total FROM ${TABLE} ${whereSql}`;
  const [{ rows: items }, { rows: [c] }] = await Promise.all([
    pool.query(sql, params),
    pool.query(countSql, params.slice(0, params.length - 2))
  ]);

  return { items, total: c?.total ?? 0, limit: Number(limit), offset: Number(offset) };
}

export async function getNotification(notificationId) {
  const { rows } = await pool.query(
    `SELECT * FROM ${TABLE} WHERE notification_id = $1`,
    [notificationId]
  );
  return rows[0] || null;
}

export async function getBatch(batchId) {
  const { rows } = await pool.query(
    `SELECT * FROM ${TABLE} WHERE batch_id = $1 ORDER BY create_ts ASC`,
    [batchId]
  );
  return rows;
}



// services/notifications.js
export async function updateNotificationAttempt({
  notificationId,
  attemptNo,
  overallStatus,        // 'SUCCESS' | 'FAILED'
  resultDetails,        // JSON: include outcomes
  createUser,           // who triggered resend
  deliveryMetaPatch     // optional JSON merge (eg. provider/host/port)
}){
  const sql = `
    UPDATE notification
    SET attempt_no      = $2,
        last_attempt_ts = now(),
        result_details  = COALESCE($3::jsonb, '{}'::jsonb),
        status          = $4,
        create_user_id  = COALESCE($5, create_user_id),
        delivery_meta   = CASE
                            WHEN $6::jsonb IS NULL THEN delivery_meta
                            ELSE COALESCE(delivery_meta, '{}'::jsonb) || ($6::jsonb)
                          END
    WHERE notification_id = $1
    RETURNING notification_id
  `;
  const params = [
    notificationId,
    attemptNo,
    JSON.stringify(resultDetails || {}),
    overallStatus,
    createUser || null,
    deliveryMetaPatch ? JSON.stringify(deliveryMetaPatch) : null
  ];
  const { rows } = await pool.query(sql, params);
  return rows[0]?.notification_id || null;
}
