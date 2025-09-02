// services/mail-inbox.js
import pkg from 'pg';
const { Pool } = pkg;
import { pool } from './db.js';

// reuse your existing helpers/constants:
const LOGO_CID = 'evo-logo';

// Change this if your table is elsewhere
const TABLE = process.env.NOTIF_TABLE || 'evomail.notification';

// List inbox items for a subscriber (default Inserted/Scanned; can be overridden)
export async function listSubscriberInbox({
    subscriberId,
    limit = 150,
    offset = 0,
    statusCds = ['inserted','scanned']   // default inbox view
  } = {}) {
    const normStatuses =
      Array.isArray(statusCds) && statusCds.length
        ? statusCds.map(s => String(s).toLowerCase())
        : null; // null means "no status filter" = all statuses
  
    const sql = `
      SELECT
        sm.mail_id,
        sm.fk_subscriber_id       AS subscriber_id,
        mt.mail_type_cd           AS type,
        sm.width_in, sm.length_in, sm.height_in,
        sm.weight_oz,
        sm.image_path,
        ms.mail_status_cd         AS last_status,
        sm.insertion_time,
        sm.last_status_ts,
        sm.create_user_id
      FROM evomail.subscriber_mail sm
      JOIN evomail.mail_type   mt ON mt.mail_type_id   = sm.fk_mail_type_id
      JOIN evomail.mail_status ms ON ms.mail_status_id = sm.fk_mail_status_id
      WHERE sm.fk_subscriber_id = $1
        AND ( $2::text[] IS NULL OR LOWER(ms.mail_status_cd) = ANY($2::text[]) )
      ORDER BY COALESCE(sm.last_status_ts, sm.insertion_time) DESC
      LIMIT $3 OFFSET $4
    `;
    const params = [Number(subscriberId), normStatuses, Number(limit), Number(offset)];
    const { rows } = await pool.query(sql, params);
    return rows;
  }
  
  
  // Single mail item (for serving file or details)
  export async function getMailItem(mailId) {
    const { rows } = await pool.query(`
      SELECT sm.*, mt.mail_type_cd AS type, ms.mail_status_cd AS last_status
      FROM evomail.subscriber_mail sm
      JOIN evomail.mail_type   mt ON mt.mail_type_id   = sm.fk_mail_type_id
      JOIN evomail.mail_status ms ON ms.mail_status_id = sm.fk_mail_status_id
      WHERE sm.mail_id = $1
    `, [mailId]);
    return rows[0] || null;
  }
  

  