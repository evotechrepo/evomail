// server/src/services/drive.js
import path from 'path';
import fs from 'fs';
import express from 'express';
import multer from 'multer';
import { GoogleDriveOAuth } from './google-drive-oauth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import mime from 'mime-types';
import crypto from 'crypto';
import { Readable } from 'stream'; 
import { loadGlobalTokens, saveGlobalTokens } from './token-store-db.js';


const router = express.Router();

// configure OAuth helper from env
const gdrive = new GoogleDriveOAuth({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI, // e.g. http://localhost:3000/oauth2callback
  scope: process.env.GOOGLE_DRIVE_SCOPE || 'https://www.googleapis.com/auth/drive',
});

async function ensureGlobalSessionTokens(req){
  if (!req.session?.googleTokens) {
    const t = await loadGlobalTokens();
    if (t) req.session.googleTokens = t;
  }
}



// --- Auth handshake (per-user) ---
router.get('/auth', requireAuth, (req, res) => {
  if (req.session.connectedOnce) return res.redirect('/evotechmail/api/drive/finish');
  const state = crypto.randomUUID();
  req.session.oauthState = state;
  res.redirect(gdrive.getAuthUrl(true, state));
});


router.get('/oauth2callback', async (req, res) => {
  try {
    if (!req.session || req.query.state !== req.session.oauthState) {
      return res.status(400).send('Invalid state');
    }
    req.session.oauthState = null;           // one-time use
    const { code } = req.query;
    const tokens = await gdrive.exchangeCodeForTokens(code);
    await saveGlobalTokens(tokens);
    req.session.googleTokens = tokens;
    req.session.connectedOnce = true;        // mark connected to avoid re-consent
    res.redirect('/evotechmail/api/drive/finish');
  } catch (e) {
    console.error('OAuth callback error:', e);
    return res.status(500).send('Google OAuth failed.');
  }
});



router.get('/finish', (_req, res) => {
  res.type('html').send(`<!doctype html>
<meta charset="utf-8"><title>Connected</title>
<script>
  try { window.opener && window.opener.postMessage({ type:'gdrive-connected' }, '*'); } catch(e){}
  window.close();
</script>
<body style="font-family:system-ui;padding:20px">
  <p>Google Drive connected. You can close this window.</p>
</body>`);
});



// --- Optional simple HTML form (for quick testing) ---
// services/drive.js
router.get('/uploader', requireAuth, (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Content-Disposition', 'inline'); // prevent download prompt
  res.send(`
    <html><body style="font-family:system-ui;margin:24px">
      <h3>Upload to Drive</h3>
      <form id="uform" action="/evotechmail/api/drive/upload" method="post" enctype="multipart/form-data">
        <label>Folder name <input name="folder_name" required /></label><br/>
        <small>Optional parent folder ID: </small><input name="parent_id" style="width:380px" /><br/><br/>
        <input type="file" name="files" multiple required />
        <button type="submit">Upload</button>
      </form>
      <pre id="out"></pre>
      <script>
      (async function(){
        // ensure session cookie rides along
        const rs = await fetch('/evotechmail/api/drive/status', { credentials:'include' });
        try {
          const sj = await rs.json();
          if (!sj.connected) location.href = '/evotechmail/api/drive/auth';
        } catch(_) {}

        const form = document.getElementById('uform'), out = document.getElementById('out');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          out.textContent = 'Uploading...';
          const fd = new FormData(form);
          const r = await fetch('/evotechmail/api/drive/upload', { method:'POST', body: fd, credentials:'include' });
          const ct = r.headers.get('content-type') || '';
          const data = ct.includes('application/json') ? await r.json() : { error: 'HTTP '+r.status, detail: (await r.text()).slice(0,200) };
          out.textContent = JSON.stringify(data, null, 2);
        });
      })();
      </script>
    </body></html>
  `);
});


// --- Upload endpoint ---
const tmpDir = path.resolve(process.cwd(), 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({ dest: tmpDir });


function extractDriveId(str='') {
  // supports full URLs or raw IDs
  const m = String(str).match(/[-_a-zA-Z0-9]{25,}/);
  return m ? m[0] : '';
}

/**
 * POST /upload
 * body: folder_name (required), parent_id (optional), files (multipart)
 */
router.post('/upload', requireAuth, requireGoogleConnected, upload.array('files', 20), async (req, res) => {
  
  ensureGlobalSessionTokens(req);
  if (!req.session.googleTokens) {
  return res.status(428).json({ error: 'Not connected to Google', authUrl: gdrive.getAuthUrl(true) });
  }

  const folderField = String(req.body.folder_name || '').trim();
  const parentField = String(req.body.parent_id || '').trim();

  let parentId;
  const folderId = extractDriveId(parentField);
  if (folderId) {
  const verified = await gdrive.verifyFolderById(req, folderId); // throws if not accessible
  parentId = verified.id;
  }
  const folderIdFromUrl = extractDriveId(folderField);

  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

  try {
    // If folder_name looks like an ID/URL, upload directly into that folder.
    // Otherwise, treat as a NAME and ensure/create it under parentId (or root).
    let targetFolder;
    if (folderIdFromUrl) {
      targetFolder = { id: folderIdFromUrl, name: '(by-id)' };
    } else {
      if (!folderField) return res.status(400).json({ error: 'folder_name is required (name or folder URL/ID)' });
      targetFolder = await gdrive.ensureFolder(req, folderField, parentId);
    }

    const uploaded = [];
    for (const f of req.files) {
      const meta = await gdrive.uploadStream(req, f.path, f.originalname, targetFolder.id);
      uploaded.push({
        id: meta.id,
        name: meta.name,
        webViewLink: meta.webViewLink,
        webContentLink: meta.webContentLink,
      });
      fs.unlink(f.path, () => {});
    }

    res.json({ folder: { id: targetFolder.id, name: targetFolder.name }, uploaded });
  } catch (err) {
    console.error('Drive upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: String(err?.message || err) });
  }
});


// replace your status route with one that also returns the auth URL
router.get('/status', async (req, res) => {
  await ensureGlobalSessionTokens(req);
  const connected = !!req.session?.googleTokens;
  res.json({ connected, authUrl: gdrive.getAuthUrl(!connected) });
});



function requireGoogleConnected(req, res, next){
  if (req.session?.googleTokens) return next();
  // 428: client can recover by visiting the provided authUrl
  return res.status(428).json({ error: 'Not connected to Google', authUrl: gdrive.getAuthUrl() });
}


// --- Partner MailBoxes base folders (IDs extracted from your provided URLs)
const PARTNER_BASES = {
  PSM:     extractDriveId(process.env.PSM_MAILBOXES_URL || ''),
  ATM:     extractDriveId(process.env.ATM_MAILBOXES_URL || ''),
  IPOSTAL: extractDriveId(process.env.IPOSTAL_MAILBOXES_URL || ''),
  DAVINCI: extractDriveId(process.env.DAVINCI_MAILBOXES_URL || ''), // optional
  OWNER:   extractDriveId(process.env.OWNER_MAILBOXES_URL   || ''), // optional
};

// --- 10MB total cap; memory only (no tmp files)
const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { files: 3, fileSize: 10 * 1024 * 1024 }, // per-file hard cap (belt)
});

// Small util to sum buffer sizes and enforce TOTAL <= 10MB
function totalSizeOk(files){
  const total = (files||[]).reduce((n,f)=> n + (f?.buffer?.length||0), 0);
  return total <= (10 * 1024 * 1024);
}

// Normalise and build the subscriber folder name server-side (in case client deviates)
function makeSubscriberFolderName(firstLastCompany){
  // You said you'll send already concatenated; we just trim/clean
  return String(firstLastCompany || '').replace(/\s+/g,' ').trim();
}

// Resolve/ensure path: <PartnerBase>/PMB/<Subscriber>
async function ensurePartnerMailboxPath(req, partner, pmb, subscriberName){
  const baseId = PARTNER_BASES[partner?.toUpperCase()];
  if (!baseId) throw new Error(`Unknown or unconfigured partner: ${partner}`);

  // PMB folder (e.g., "136")
  const pmbFolder = await gdrive.ensureChildFolderByName(req, String(pmb), baseId);

  // Subscriber folder: "First Last (Company)" (company part optional)
  const subFolder = await gdrive.ensureChildFolderByName(req, subscriberName, pmbFolder.id);

  return { baseId, pmbFolderId: pmbFolder.id, subscriberFolderId: subFolder.id };
}

/*
// Map uploaded fields → target filename
function plannedName(kind, pmb){
  switch (kind) {
    case 'form_1583': return `1583_PMB_${pmb}`;
    case 'photo_id':  return `PHOTO_ID_PMB_${pmb}`;
    case 'address_id':return `ADDRESS_ID_PMB_${pmb}`;
    default:          return null;
  }
}
*/

  // Map uploaded fields → target filename (now supports prefix)
  function plannedName(kind, pmb, prefix = '') {
    const pre = (String(prefix || '').trim());
    const pf  = pre ? pre + '_' : '';
    switch (kind) {
      case 'form_1583':  return `${pf}1583_PMB_${pmb}`;
      case 'photo_id':   return `${pf}PHOTO_ID_PMB_${pmb}`;
      case 'address_id': return `${pf}ADDRESS_ID_PMB_${pmb}`;
      default:           return null;
    }
  }


// --- NEW smart endpoint ---
// multipart keys: form_1583, photo_id, address_id (any subset; up to 3)
router.post('/smart-upload',
  requireAuth,
  uploadMem.fields([{ name:'form_1583', maxCount:1 }, { name:'photo_id', maxCount:1 }, { name:'address_id', maxCount:1 }]),
  async (req, res) => {
    try {

      ensureGlobalSessionTokens(req);
      if (!req.session.googleTokens) {
       return res.status(428).json({ error: 'Not connected to Google', authUrl: gdrive.getAuthUrl(true) });
      }

      const { partner, pmb, subscriber_name } = req.body;
      if (!partner || !pmb || !subscriber_name) {
        return res.status(400).json({ error: 'partner, pmb, and subscriber_name are required' });
      }
      const filesArr = ['form_1583','photo_id','address_id']
        .map(k => (req.files?.[k]?.[0] || null))
        .filter(Boolean);

      if (!filesArr.length) return res.status(400).json({ error: 'No files provided' });
      if (!totalSizeOk(filesArr)) return res.status(413).json({ error: 'Total upload size exceeds 10MB' });

      // ensure path on Drive
      const subName = makeSubscriberFolderName(subscriber_name);
      const { subscriberFolderId } = await ensurePartnerMailboxPath(req, partner, pmb, subName);

      // upload each present file with the required name + original extension
      const uploaded = [];
      for (const f of filesArr) {
        const field = f.fieldname;                        // form_1583 | photo_id | address_id
        //const base  = plannedName(field, pmb);
        const base  = plannedName(field, pmb, (req.body.prefix||'').trim());
        if (!base) continue;

        const ext = mime.extension(f.mimetype || '') || '';  // keep extension if known
        const finalName = ext ? `${base}.${ext}` : base;

        const meta = await gdrive.uploadBuffer(req, f.buffer, finalName, f.mimetype, subscriberFolderId);
        uploaded.push({ kind: field, id: meta.id, name: meta.name, webViewLink: meta.webViewLink });
      }

      return res.json({
        ok: true,
        partner: partner.toUpperCase(),
        pmb: String(pmb),
        subscriber: subName,
        folderId: subscriberFolderId,
        uploaded
      });
    } catch (err) {
      console.error('smart-upload error:', err);
      return res.status(500).json({ error: 'Upload failed', detail: String(err?.message || err) });
    }
  }
);

// --- smart endpoint ---
// multipart keys: form_1583, photo_id, address_id (any subset; up to 3)
router.post('/direct-upload',
  requireAuth,
  uploadMem.fields([{ name:'form_1583', maxCount:1 }, { name:'photo_id', maxCount:1 }, { name:'address_id', maxCount:1 }]),
  async (req, res) => {
    try {

      ensureGlobalSessionTokens(req);
      if (!req.session.googleTokens) {
       return res.status(428).json({ error: 'Not connected to Google', authUrl: gdrive.getAuthUrl(true) });
      }

      const { partner, pmb, subscriber_name, prefix, folderId } = req.body || {};
      if (!partner || !pmb || !subscriber_name) {
        return res.status(400).json({ error: 'partner, pmb, and subscriber_name are required' });
      }
      const filesArr = ['form_1583','photo_id','address_id']
        .map(k => (req.files?.[k]?.[0] || null))
        .filter(Boolean);

      if (!filesArr.length) return res.status(400).json({ error: 'No files provided' });
      if (!totalSizeOk(filesArr)) return res.status(413).json({ error: 'Total upload size exceeds 10MB' });

      //check if folder already exists
      let targetFolderId = null;
      if (folderId) {
        try {
          const ok = await gdrive.verifyFolderById(req, folderId);
          if (ok?.id) targetFolderId = ok.id;
        } catch(_) { /* ignore; will fall back */ }
      }
      if (!targetFolderId) {
        const subName = makeSubscriberFolderName(subscriber_name);
        const { subscriberFolderId } = await ensurePartnerMailboxPath(req, partner, pmb, subName);
        targetFolderId = subscriberFolderId;
      }

      // unique name helper to avoid overwrites
      async function uniqueName(base, ext) {
        let name = ext ? `${base}.${ext}` : base;
        let i = 2;
        while (await gdrive.findFileInParentByName(req, name, targetFolderId)) {
          name = ext ? `${base} (${i}).${ext}` : `${base} (${i})`;
          i++;
          if (i > 99) throw new Error('Too many existing duplicates for ' + base);
        }
        return name;
      }

      // upload each present file with the required name + original extension
      const uploaded = [];
      for (const f of filesArr) {
        const field = f.fieldname;                        // form_1583 | photo_id | address_id
        //const base  = plannedName(field, pmb);
        const base  = plannedName(field, pmb, (req.body.prefix||'').trim());
        if (!base) continue;

        const ext  = (mime.extension(f.mimetype || '') || '').toLowerCase();
        const finalName = await uniqueName(base, ext);

        const meta = await gdrive.uploadBuffer(req, f.buffer, finalName, f.mimetype, targetFolderId);
        uploaded.push({ kind: field, id: meta.id, name: meta.name, webViewLink: meta.webViewLink });
      }

      return res.json({
              ok: true,
              partner: partner.toUpperCase(),
              pmb: String(pmb),
              subscriber: makeSubscriberFolderName(subscriber_name),
              folderId: targetFolderId,
              uploaded
            });
    } catch (err) {
      console.error('direct-upload error:', err);
      return res.status(500).json({ error: 'Upload failed', detail: String(err?.message || err) });
    }
  }
);

// GET /evotechmail/api/drive/smart-list?partner=PSM&pmb=136&subscriber_name=First%20Last%20(Company)
router.get('/smart-list', async (req, res) => {
  try {
    const { partner, pmb, subscriber_name } = req.query;
    if (!partner || !pmb) return res.status(400).json({ error: 'partner and pmb are required' });

    // normalize long labels like POSTSCANMAIL → PSM inside the Drive service
    const normPartner = gdrive.normalizePartner(partner);
//console.log(normPartner);
//console.log(String(pmb));
//console.log(subscriber_name || '');
    const folder = await gdrive.findSubscriberFolderRelaxed(req, normPartner, String(pmb), (subscriber_name || '').trim());
    if (!folder) return res.json({ folder: null, files: [] });

    const files = await gdrive.listFilesInFolder(req, folder.id);
    res.json({ folder, files });
  } catch (e) {
    console.error('smart-list error:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});


////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////

export default router;
