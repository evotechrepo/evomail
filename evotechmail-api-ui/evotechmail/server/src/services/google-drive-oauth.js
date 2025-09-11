// server/src/services/google-drive-oauth.js
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import mime from 'mime-types';
// +++ add near the top
import { Readable } from 'stream';



const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class GoogleDriveOAuth {
  constructor({ clientId, clientSecret, redirectUri, scope }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scope = scope || 'https://www.googleapis.com/auth/drive.file';
  }

  makeOAuthClient() {
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }

    getAuthUrl(forceConsent = false, state = '') {
    const o = this.makeOAuthClient();
    return o.generateAuthUrl({
        access_type: 'offline',
        prompt: forceConsent ? 'consent' : undefined,
        scope: [this.scope],
        state, // << add
    });
    }


  async exchangeCodeForTokens(code) {
    const o = this.makeOAuthClient();
    const { tokens } = await o.getToken(code);
    return tokens; // { access_token, refresh_token, ... }
  }

  clientFromTokens(tokens) {
    const o = this.makeOAuthClient();
    o.setCredentials(tokens);
    return o;
  }

  driveFromReq(req) {
    const auth = this.clientFromTokens(req.session?.googleTokens);
    return google.drive({ version: 'v3', auth });
  }

    async findFileInParentByName(req, name, parentId){
    const d = this.driveFromReq(req);
    const q = [
        `'${parentId}' in parents`,
        `name = '${String(name).replace(/'/g, "\\'")}'`,
        'trashed = false',
    ].join(' and ');
    const { data } = await d.files.list({
        q,
        fields: 'files(id, name)',
        pageSize: 1,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    });
    return data.files?.[0] || null;
    }


  async findFolder(req, name, parentId) {
    const d = this.driveFromReq(req);
    const q = [
      `mimeType='${FOLDER_MIME}'`,
      'trashed=false',
      `name='${String(name).replace(/'/g, "\\'")}'`,
      parentId ? `'${parentId}' in parents` : "'root' in parents",
    ].join(' and ');

    const { data } = await d.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    });
    return data.files?.[0] || null;
  }

  async createFolder(req, name, parentId) {
    const d = this.driveFromReq(req);
    const { data } = await d.files.create({
      supportsAllDrives: true,  //shared drives
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id,name',
    });
    return data;
  }

    async verifyFolderById(req, folderId){
      const d = this.driveFromReq(req);
      const { data } = await d.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType, shortcutDetails',
        supportsAllDrives: true,
      });
      if (data.mimeType === 'application/vnd.google-apps.shortcut') {
        return await this.verifyFolderById(req, data.shortcutDetails?.targetId);
      }
      if (data.mimeType !== 'application/vnd.google-apps.folder') {
        throw new Error('Target is not a folder');
      }
      return data; // {id, name}
    }

  async ensureFolder(req, name, parentId) {
    return (await this.findFolder(req, name, parentId)) || this.createFolder(req, name, parentId);
  }



    async ensureChildFolderByName(req, childName, parentId){
    const existing = await this.findFolder(req, childName, parentId);
    if (existing) return existing;
    return await this.createFolder(req, childName, parentId);
    }

    async uploadBuffer(req, buffer, fileName, mimeType, folderId){
    const d = this.driveFromReq(req);
    const body = Readable.from(buffer);
    const mt = mimeType || 'application/octet-stream';

    // look for an existing file with same name in the target folder
    const existing = await this.findFileInParentByName(req, fileName, folderId);

    if (existing) {
        // overwrite contents
        const { data } = await d.files.update({
        fileId: existing.id,
        media: { mimeType: mt, body },
        fields: 'id,name,parents,webViewLink,webContentLink,modifiedTime',
        supportsAllDrives: true,
        });
        return data;
    } else {
        // create new
        const { data } = await d.files.create({
        supportsAllDrives: true,
        requestBody: { name: fileName, parents: [folderId] },
        media: { mimeType: mt, body },
        fields: 'id,name,parents,webViewLink,webContentLink,createdTime',
        });
        return data;
    }
    }



async uploadStream(req, filePath, fileName, folderId){
  const d = this.driveFromReq(req);
  const mt = mime.lookup(fileName) || 'application/octet-stream';
  const body = fs.createReadStream(filePath);

  const existing = await this.findFileInParentByName(req, fileName, folderId);

  if (existing) {
    const { data } = await d.files.update({
      fileId: existing.id,
      media: { mimeType: mt, body },
      fields: 'id,name,parents,webViewLink,webContentLink,modifiedTime',
      supportsAllDrives: true,
    });
    return data;
  } else {
    const { data } = await d.files.create({
      supportsAllDrives: true,
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: mt, body },
      fields: 'id,name,parents,webViewLink,webContentLink,createdTime',
    });
    return data;
  }
}


// normalize comparable strings (case/space/punct insensitive)
static _canon(s){
  return (s||'')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')        // drop anything in parentheses
    .replace(/[^a-z0-9]+/g, '')     // keep letters+digits
    .trim();
}

// list immediate child folders under a parent
async listChildFolders(req, parentId){
  const d = this.driveFromReq(req);
  const { data } = await d.files.list({
    q: [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `'${parentId}' in parents`
    ].join(' and '),
    fields: 'files(id,name,webViewLink)',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return data.files || [];
}

// list files in a folder
async listFilesInFolder(req, folderId){
  const d = this.driveFromReq(req);
  const { data } = await d.files.list({
    q: [`'${folderId}' in parents`, "trashed = false"].join(' and '),
    fields: 'files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,createdTime,size)',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return data.files || [];
}

// find mailbox folder (by exact PMB name) under the *MailBoxes* folder (env points to it)
async findMailboxFolder(req, partner, pmb){
  const mailboxesId = this.baseFolderIdForPartner(partner);
  if (!mailboxesId) throw new Error(`Unknown partner ${partner}`);

  // verify the MailBoxes folder exists and is visible; DO NOT create
  await this.verifyFolderById(req, mailboxesId);

  // find direct child named exactly the PMB
  const d = this.driveFromReq(req);
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${String(pmb).replace(/'/g,"\\'")}'`,
    `'${mailboxesId}' in parents`
  ].join(' and ');

  const { data } = await d.files.list({
    q,
    fields: 'files(id,name,webViewLink)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (data.files && data.files[0]) || null;
}

// Helpers to split & normalize multi-person names
// ----- helpers for multi-person + middle-names -----
static _splitPeople(s){
  // split on: "/", "&", ",", ";", or the word "and"
  return String(s||'')
    .split(/(?:\/|&|,|;|\band\b)/i)
    .map(x => x.trim())
    .filter(Boolean);
}

static _canon(s){
  return (s||'')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')     // drop anything in parentheses
    .replace(/[^a-z0-9]+/g, '')  // keep letters+digits
    .trim();
}

// First-name variants: full token, first word (drop middles), and initial
static _firstVariants(firstRaw){
  const tokens = GoogleDriveOAuth._splitPeople(firstRaw);
  const out = new Set();
  for (const t of tokens){
    const norm = t.replace(/\s+/g,' ').trim();
    if (!norm) continue;
    out.add(norm);                                     // "Erica Jazmin"
    const parts = norm.split(' ');
    if (parts.length > 1) out.add(parts[0]);           // "Erica"
    if (parts[0]) out.add(parts[0][0]);                // "E" (initial)
  }
  return Array.from(out);
}

// Last-name variants: keep full tokens (allow spaces/hyphens)
static _lastVariants(lastRaw){
  return GoogleDriveOAuth._splitPeople(lastRaw).map(t =>
    t.replace(/\s+/g,' ').trim()
  ).filter(Boolean);
}

// Build all "First Last" combos from variants (deduped)
static _nameCombosExpanded(firstRaw, lastRaw){
  const fvars = GoogleDriveOAuth._firstVariants(firstRaw);
  const lvars = GoogleDriveOAuth._lastVariants(lastRaw);
  const combos = new Set();
  if (!fvars.length && !lvars.length) return [];
  if (!fvars.length) fvars.push(''); // edge: last-only
  if (!lvars.length) lvars.push(''); // edge: first-only
  for (const f of fvars){
    for (const l of lvars){
      const fl = `${f} ${l}`.trim().replace(/\s+/g,' ');
      if (fl) combos.add(fl);
    }
  }
  return Array.from(combos);
}
// ----------------------------------------------------

// READ-ONLY relaxed subscriber-folder finder under a PMB folder
// You may pass optional first/last (as sent in your payload). If omitted,
// the code derives them from subscriberName (best-effort).
async findSubscriberFolderRelaxed(req, partner, pmb, subscriberName, firstNameOpt, lastNameOpt){
  const pmbFolder = await this.findMailboxFolder(req, partner, pmb);
  if (!pmbFolder) return null;

  const candidates = await this.listChildFolders(req, pmbFolder.id);
  if (!candidates.length) return null;

  // Inputs
  const origFull   = (subscriberName || '').trim();           // e.g., "Erica Jazmin Carter (Polar Tech)"
  const firstLast  = origFull.replace(/\(.*?\)\s*$/, '').trim();
  const wantFull   = GoogleDriveOAuth._canon(origFull);

  // If caller gave explicit first/last, use them; else derive naive split from firstLast
  let firstBase = (firstNameOpt || '').trim();
  let lastBase  = (lastNameOpt  || '').trim();
  if (!firstBase || !lastBase){
    const parts = firstLast.split(/\s+/);
    if (!firstBase) firstBase = parts[0] || '';
    if (!lastBase)  lastBase  = parts.slice(1).join(' ');
  }

  // All combos including middle-name trimmed + initials (e.g., "Erica Carter", "E Carter")
  const combos = GoogleDriveOAuth._nameCombosExpanded(firstBase, lastBase);

  // Prebuild canonical combos
  const canonCombos = combos.map(n => ({ raw:n, canon:GoogleDriveOAuth._canon(n) }));

  // legacy regex makers for any given "First Last" raw combo
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const legacyRegexes = (rawFl) => ({
    anyParen:  new RegExp('^' + esc(rawFl) + '\\s*\\(.*\\)\\s*$', 'i'),
    companies: new RegExp('^' + esc(rawFl) + '\\s*\\(\\s*\\d+\\s+companies\\s*\\)\\s*$', 'i'),
  });

  let best = null, bestScore = -1, bestCreated = '';

    for (const c of candidates) {
    const cn = (c.name || '').trim();

    // normalize variants of the candidate name (no HTML or Drive calls here)
    const cnNorm       = cn.replace(/\s+/g, ' ').trim();          // collapse spaces
    const cnLower      = cnNorm.toLowerCase();
    const cnNoParen    = cnNorm.replace(/\(.*?\)\s*$/, '').trim(); // drop "(...)"
    const cnNoParenLo  = cnNoParen.toLowerCase();
    const cnParts      = cnNoParen.split(/\s+/).filter(Boolean);
    const cnReducedFL  = cnParts.length >= 2
        ? `${cnParts[0]} ${cnParts[cnParts.length - 1]}`            // "Erica Carter" from "Erica Jazmin Carter"
        : cnNoParen;
    const cnReducedLo  = cnReducedFL.toLowerCase();

    const cc = GoogleDriveOAuth._canon(cn); // your canonical (letters+digits only)

    let score = -1;

    // --- 1) Strict exact "First Last (Company)" (case/space-insensitive) ---
    if (combos.some(n => cnLower === n.toLowerCase())) {
        score = 120;
    }
    // --- 2) Strict exact on "First Last" (reduced) against any combo (case-insensitive) ---
    else if (combos.some(n => {
        const nFL = n.replace(/\(.*?\)\s*$/, '').replace(/\s+/g,' ').trim(); // drop (...) if any
        const nFLReduced = (() => {
        const p = nFL.split(/\s+/).filter(Boolean);
        return p.length >= 2 ? `${p[0]} ${p[p.length - 1]}` : nFL;
        })();
        return cnReducedLo === nFLReduced.toLowerCase();
    })) {
        score = 114;
    }
    // --- 3) Legacy shapes for any combo: "First Last (anything)" or "(8 companies)" ---
    else if (combos.some(n => legacyRegexes(n).anyParen.test(cn))) {
        score = 108;
    }
    else if (combos.some(n => legacyRegexes(n).companies.test(cn))) {
        score = 106;
    }
    // --- 4) Canonical equivalence (full then combos) ---
    else if (cc === wantFull) {
        score = 95;
    }
    else if (canonCombos.some(o => cc === o.canon)) {
        score = 92;
    }
    // --- 5) StartsWith / Includes on canonical combos (forgiving) ---
    else if (canonCombos.some(o => cc.startsWith(o.canon))) {
        score = 76;
    }
    else if (canonCombos.some(o => cc.includes(o.canon))) {
        score = 68;
    }
    // --- 6) Last-chance: includes canonical full ---
    else if (cc.includes(wantFull)) {
        score = 60;
    }

    // tie-breaker by createdTime (newer wins)
    const created = c.createdTime || '';
    const better = (score > bestScore) || (score === bestScore && created > bestCreated);
    if (better) { best = c; bestScore = score; bestCreated = created; }
    }

    // ----- Final fallback: pick folder with most shared words (if nothing good found) -----
    if (!best || bestScore < 60) {
    // Use the subscriber's visible name (no company) as the word source
    const nameWords = new Set(
        firstLast
        .toLowerCase()
        .replace(/[()]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );

    let fbBest = null, fbScore = 0, fbCreated = '';

    for (const c of candidates) {
        const cnNoParen = String(c.name || '')
        .toLowerCase()
        .replace(/[()]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();

        const cWords = new Set(cnNoParen.split(/\s+/).filter(Boolean));
        // count intersections (any shared word)
        let overlap = 0;
        for (const w of cWords) if (nameWords.has(w)) overlap++;

        // keep the one with the most overlaps; break ties by createdTime (newer wins)
        const created = c.createdTime || '';
        const better = (overlap > fbScore) || (overlap === fbScore && created > fbCreated);
        if (better) { fbBest = c; fbScore = overlap; fbCreated = created; }
    }

    if (fbBest && fbScore > 0) {
        best = fbBest;
        bestScore = 40; // annotate that we used fallback (optional)
    }
    }
    // ----- end fallback -----


  return best;
}




normalizePartner(code) {
  const s = (code || '').toString().trim().toUpperCase();
  if (['PSM', 'POSTSCAN', 'POSTSCANMAIL', 'POST SCAN'].includes(s)) return 'PSM';
  if (['ATM', 'ANYTIME', 'ANYTIME MAILBOX', 'ANYTIMEMAILBOX'].includes(s)) return 'ATM';
  if (['IPOSTAL', 'I POSTAL', 'I-POSTAL'].includes(s)) return 'IPOSTAL';
  if (['DAVINCI', 'DA VINCI'].includes(s)) return 'DAVINCI';
  if (['OWNER'].includes(s)) return 'OWNER';
  return 'OWNER';
}

baseFolderIdForPartner(code) {
  const k = this.normalizePartner(code);
  const map = {
    PSM:     process.env.PSM_MAILBOXES_URL,
    ATM:     process.env.ATM_MAILBOXES_URL,
    IPOSTAL: process.env.IPOSTAL_MAILBOXES_URL,
    DAVINCI: process.env.DAVINCI_MAILBOXES_URL,
    OWNER:   process.env.OWNER_MAILBOXES_URL
  };
  return map[k];
}


// Extracts a Drive file/folder ID from either a raw ID or any "folders/<id>" URL.
extractDriveId(str){
  const s = (str || '').toString().trim();
  if (!s) return '';
  // if it already looks like an id (no slashes, ~25-60 chars), return as-is
  if (!s.includes('/')) return s;
  const m = s.match(/\/folders\/([A-Za-z0-9_\-]+)/) || s.match(/\/d\/([A-Za-z0-9_\-]+)/);
  return m ? m[1] : s;
}



// ===== helper methods used by tier endpoints =====
async listFiles(req, folderId){
  const d = this.driveFromReq(req);
  const q = `'${folderId}' in parents and trashed = false`;
  const { data } = await d.files.list({
    q, fields: 'files(id,name,iconLink,webViewLink,createdTime,modifiedTime)'
  });
  return data.files || [];
}

async deleteFile(req, fileId){
  const d = this.driveFromReq(req);
  await d.files.delete({ fileId });
}

async uploadBuffer(req, buffer, fileName, mimeType, folderId){
  const d = this.driveFromReq(req);
  const body = Readable.from(buffer);
  const { data } = await d.files.create({
    requestBody: { name: fileName, parents: folderId ? [folderId] : undefined },
    media: { mimeType: mimeType || 'application/octet-stream', body },
    fields: 'id,name,parents,webViewLink,webContentLink'
  });
  return data;
}

async uploadBufferUnique(req, buffer, fileName, mimeType, folderId){
  const d = this.driveFromReq(req);
  const body = Readable.from(buffer);
  const mt = mimeType || 'application/octet-stream';
  // ensure unique name: "name", "name (2)", "name (3)", ...
  const parts = fileName.split('.');
  const ext = (parts.length > 1) ? '.' + parts.pop() : '';
  const base = parts.join('.');
  let name = fileName, i = 2;
  while (await this.findFileInParentByName(req, name, folderId)) {
    name = `${base} (${i++})${ext}`;
  }
  const { data } = await d.files.create({
    supportsAllDrives: true,
    requestBody: { name, parents: [folderId] },
    media: { mimeType: mt, body },
    fields: 'id,name,parents,webViewLink,webContentLink,createdTime'
  });
  return data;
}

}
