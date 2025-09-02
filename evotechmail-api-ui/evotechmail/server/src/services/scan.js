// server/src/services/scan.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from './db.js';
import { randomUUID } from 'crypto';
import { sendSystemMail } from './mailer-utils.js';
import { requireAuth } from '../middleware/requireAuth.js';
import sharp from 'sharp';
import mime from 'mime-types';
import { normalize_image_attachment } from './mail_path.js'; 

const router = express.Router();
const fsp = fs.promises;

// --- simple in-proc cache for the portalless subs (5 min)
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;
//const CACHE_MS = 0;

function cacheSet(key, val){ cache.set(key, {val, exp: Date.now()+CACHE_MS}); }
function cacheGet(key){
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) { cache.delete(key); return null; }
  return hit.val;
}

// --- storage for images (adjust to your env)
const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _f, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  }
});
const upload = multer({ storage });

// 1) GET subscribers (portalless) — cached
router.get('/subscribers', async (req, res) => {
  try {
    const key = 'portalless';
    const cached = cacheGet(key);
    if (cached) return res.json({ ok:true, items: cached });

    const { rows } = await pool.query(`
      SELECT s.subscriber_id, s.pmb, s.first_name, s.last_name, s.company
      FROM evomail.subscriber s
      JOIN mail_partner p ON p.mail_partner_id = s.fk_mail_partner_id
      WHERE p.has_portal_yn = 'N'
    `);

    cacheSet(key, rows);
    return res.json({ ok:true, items: rows });
  } catch (e) {
    console.error('scan/subscribers', e);
    return res.status(500).json({ ok:false, error:'Failed to fetch subscribers' });
  }
});

// 1) GET ALL subscribers (portalless) — cached
router.get('/allsubscribers', async (req, res) => {
  try {
    const key = 'portalless2';
    const cached = cacheGet(key);
    if (cached) return res.json({ ok:true, items: cached });

    const { rows } = await pool.query(`
      SELECT s.subscriber_id, s.pmb, s.first_name, s.last_name, s.company
      FROM evomail.subscriber s
      JOIN mail_partner p ON p.mail_partner_id = s.fk_mail_partner_id
    `);

    cacheSet(key, rows);
    return res.json({ ok:true, items: rows });
  } catch (e) {
    console.error('scan/allsubscribers', e);
    return res.status(500).json({ ok:false, error:'Failed to fetch subscribers' });
  }
});

// 2) POST image upload (multipart/form-data)
router.post('/OLDupload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'No file uploaded' });
    // Return a path we can store in DB and later serve statically
    const rel = `/uploads/${path.basename(req.file.path)}`;

    //resize Uploaded image:
    await sharp(req.file.path)
    .rotate()
    .resize({ width:1600, height:1600, fit:'inside', withoutEnlargement:true })
    .jpeg({ quality:82, mozjpeg:true })
    .toFile(req.file.path + '.tmp');

    await fs.promises.rename(req.file.path + '.tmp', req.file.path);

    return res.json({ ok:true, imagePath: rel });

  } catch (e) {
    console.error('scan/upload', e);
    return res.status(500).json({ ok:false, error:'Upload failed' });
  }
});


// 2) POST image upload (multipart/form-data) // resize Images
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'No file uploaded' });

    const originalPath = req.file.path; // e.g. .../uploads/12345-orig.jpg
    // Always pick a fresh name to avoid "same file for input/output"
    const outName = `${Date.now()}-${randomUUID()}.jpg`;
    const outPath = path.join(uploadDir, outName);

    await sharp(originalPath)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({
        quality: 72,
        mozjpeg: true,
        chromaSubsampling: '4:2:0',
        progressive: true,
      })
      .toFile(outPath);

    // remove the original upload
    await fsp.unlink(originalPath).catch(() => { /* ignore */ });

    // (optional) size check
    const { size } = await fsp.stat(outPath);
    console.log('optimized bytes:', size);

    return res.json({
      ok: true,
      imagePath: `/uploads/${outName}`,
      bytes: size,
      contentType: 'image/jpeg',
    });
  } catch (e) {
    console.error('scan/upload', e);
    return res.status(500).json({ ok:false, error:'Upload failed' });
  }
});



// helper to map mail_type_cd -> id
async function getMailTypeId(mailTypeCd){
  if (!mailTypeCd) return null;
  const { rows } = await pool.query(
    `SELECT mail_type_id FROM evomail.mail_type WHERE upper(mail_type_cd) = upper($1) LIMIT 1`,
    [mailTypeCd]
  );
  return rows[0]?.mail_type_id || null;
}
// helper: resolve status 'INSERTED' etc.
async function getMailStatusId(statusCd){
  const { rows } = await pool.query(
    `SELECT mail_status_id FROM evomail.mail_status WHERE upper(mail_status_cd) = upper($1) LIMIT 1`,
    [statusCd]
  );
  return rows[0]?.mail_status_id || null;
}


/////////////////////////////////////////////////


// 1) Raw HTML template you provided (kept verbatim)
const MAIL_TEMPLATE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>New Mail Received</title>
    <meta name="x-apple-disable-message-reformatting">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin:0; padding:0; background:#f4f6f8;">
    <div style="display:none; font-size:1px; color:#f4f6f8; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      New mail has arrived at your virtual mailing address.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; background:#ffffff; border-radius:10px; overflow:hidden;">
            <tr>
              <td style="padding:18px 24px; background:#0ea5a4; color:#ffffff; font-family:Arial, Helvetica, sans-serif;">
                <h1 style="margin:0; font-size:20px; font-weight:700;">New Mail Received</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:24px; font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:15px; line-height:1.6;">
                <p style="margin:0 0 14px;">Dear {{recipient_name}},</p>

                <p style="margin:0 0 14px;">
                  We hope you're doing well. We have received a new mail item for you at your virtual mailing address with us.
                </p>

                <!-- {{mail_details_block}} -->

                <p style="margin:0 0 14px;">Please let us know how you would like to proceed. You can choose one of the following options:</p>

                <ol style="margin:0 0 16px 20px; padding:0;">
                  <li style="margin:0 0 10px;">
                    <strong>Open and Scan</strong>: We can open and scan the contents and email them to you.
                  </li>
                  <li style="margin:0 0 10px;">
                    <strong>Forward</strong>: We can forward the mail to an address you specify. (Additional postage charges may apply.)
                  </li>
                  <li style="margin:0 0 10px;">
                    <strong>Pick Up</strong>: You may pick up your mail in person during our business hours.
                  </li>
                </ol>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:18px 0; border:1px solid #e5e7eb; border-radius:8px;">
                  <tr>
                    <td style="padding:12px 16px; background:#f9fafb; font-weight:700; font-family:Arial, Helvetica, sans-serif;">
                      Business Hours
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px; font-family:Arial, Helvetica, sans-serif; color:#111827;">
                      <div>Monday – Friday: 9:00 AM – 5:00 PM</div>
                      <div>Saturday: 10:00 AM – 2:00 PM</div>
                      <div>Sunday: Closed</div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 18px;">
                  Please reply to this email with your preferred option, or feel free to contact us if you have any questions.
                </p>

                <p style="margin:8px 0 0;">Thank you for choosing our virtual mailing services!</p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px; background:#f9fafb; font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px;">
                <div>Evotech US L.L.C</div>
                <div>585 Grove St #145, Herndon VA 20170</div>
                <div><a href="mailto:office_manager@evotechservice.com" style="color:#6b7280; text-decoration:none;">office_manager@evotechservice.com</a></div>
                <div>+1 (571) 352-7339</div>
              </td>
            </tr>
          </table>

          <div style="height:24px; line-height:24px;">&nbsp;</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

// 2) helpers
function html_escape(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'", '&#39;');
}

function build_mail_details_block({ mail_id, pmb, mail_type, weight_oz, dims_arr, timestamp_str, public_image_url }) {
  const w = weight_oz ? `${weight_oz} oz` : 'n/a';
  const dims = (dims_arr?.filter(Boolean).length === 3)
    ? `${dims_arr[0]} x ${dims_arr[1]} x ${dims_arr[2]} in` : 'n/a';
  const ts = timestamp_str || new Date().toLocaleString();

  const img_line = public_image_url
    ? `<p style="margin:0 0 12px">Preview image: <a href="${html_escape(public_image_url)}" target="_blank" rel="noopener">View</a></p>`
    : '';

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:14px 0 18px; border:1px solid #e5e7eb; border-radius:8px;">
      <tr><td style="padding:12px 16px; background:#f9fafb; font-weight:700; font-family:Arial, Helvetica, sans-serif;">Mail Details</td></tr>
      <tr><td style="padding:12px 16px; font-family:Arial, Helvetica, sans-serif; color:#111827;">
        <div><strong>Mail ID:</strong> #${html_escape(mail_id)}</div>
        <div><strong>PMB:</strong> ${html_escape(pmb ?? '')}</div>
        <div><strong>Type:</strong> ${html_escape(mail_type || 'Mail')}</div>
        <div><strong>Weight:</strong> ${html_escape(w)}</div>
        <div><strong>Dimensions:</strong> ${html_escape(dims)}</div>
        <div><strong>Received:</strong> ${html_escape(ts)}</div>
        ${img_line}
      </td></tr>
    </table>`;
}

function render_mail_html({ recipient_name, details_block_html }) {
  return MAIL_TEMPLATE_HTML
    .replaceAll('{{recipient_name}}', html_escape(recipient_name || 'Subscriber'))
    .replace('<!-- {{mail_details_block}} -->', details_block_html || '');
}



router.post('/insert', async (req, res) => {
  const client = await pool.connect();
  try {
       const { display_name, email, user_id } = req.user;  // set by middleware now
       const user_name = display_name || email || 'web';
       //console.log("Scan user name = " + user_name);
    const {
      fk_subscriber_id,
      image_path,
      weight_oz, width_in, length_in, height_in,
      mail_type_cd,
      notify = true
    } = req.body || {};
    if (!fk_subscriber_id) { client.release(); return res.status(400).json({ ok:false, error:'fk_subscriber_id required' }); }

    await client.query('BEGIN');

    const mail_type_id = await getMailTypeId(mail_type_cd);
    const status_id   = await getMailStatusId('INSERTED');

    const ins = await client.query(`
      INSERT INTO evomail.subscriber_mail
        (fk_subscriber_id, image_path, weight_oz, width_in, length_in, height_in,
         fk_mail_type_id, fk_mail_status_id, create_user_id, last_mod_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9,'web'), COALESCE($9,'web'))
      RETURNING mail_id
    `, [
      fk_subscriber_id,
      image_path || null,
      weight_oz || null, width_in || null, length_in || null, height_in || null,
      mail_type_id, status_id,
      user_name || 'web'
    ]);
    //console.log(user_name);
    const mail_id = ins.rows[0]?.mail_id;

    if (mail_id) {
      const status_comment = "Mail Received"; // or pull from req.body?.comment if you have one
      await client.query(`
        INSERT INTO evomail.mail_life_events
          (fk_mail_id, fk_mail_status_id, create_user_id, comment)
        VALUES ($1, $2, COALESCE($3,'web'), $4)
      `, [
        mail_id,
        status_id,            // same status you used in subscriber_mail (INSERTED)
        user_name || 'web',   // who created it
        status_comment        // optional note
      ]);
    }

    if (notify) {
      const q = await client.query(`
        SELECT s.pmb, s.first_name, s.last_name, s.company, s.email
        FROM evomail.subscriber s
        WHERE s.subscriber_id = $1
        LIMIT 1
      `, [fk_subscriber_id]);
      const sub = q.rows[0] || null;

      if (sub?.email) {
        const full_name = [sub.first_name, sub.last_name].filter(Boolean).join(' ') || sub.company || 'Subscriber';
        const safe_type = (mail_type_cd || '').replace('_',' ');

        // Build attachment + public URL
        const { attachment /*, public_url*/ } = normalize_image_attachment(image_path);

        // Build HTML from your template
        const details_block_html = build_mail_details_block({
          mail_id,
          pmb: sub.pmb,
          mail_type: safe_type || 'Mail',
          weight_oz,
          dims_arr: [length_in, width_in, height_in],
          timestamp_str: new Date().toLocaleString(),
          public_image_url: '' //public_url
        });
        const html = render_mail_html({
          recipient_name: full_name,
          details_block_html
        });

        const subject = `New Mail ID#${mail_id} Received For PMB#${sub.pmb}`;

        // IMPORTANT: if this throws, we'll catch below and ROLLBACK.
        await sendSystemMail({
          to: sub.email,
          subject,
          html,
          context: `MAIL_INSERT:${mail_id}`,
          createUser: user_name || 'web',
          attachments: attachment ? [attachment] : []
        });
      }
    }

    await client.query('COMMIT');
    client.release();
    return res.json({ ok:true, mailId: mail_id });

  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('/insert', e);
    return res.status(500).json({ ok:false, error:'Insert failed (email not sent)' });
  }
});




export default router;
