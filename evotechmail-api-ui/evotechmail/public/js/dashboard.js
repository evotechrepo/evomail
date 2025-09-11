// Partners Cards/links
(() => {
  // elements (curtain version)
  const handle   = document.getElementById('quickLinksHandle');
  const curtain  = document.getElementById('quickLinksCurtain');
  const backdrop = document.querySelector('.ql-backdrop');
  if (!handle || !curtain) return; // safe exit if markup not present

  // prevent double init
  if (handle.dataset.wired === '1') return;

  const grid   = curtain.querySelector('.ql-grid');
  const closeBtn = curtain.querySelector('.ql-close');

  // partner data
  const PARTNERS = [
    { name:'USPS Gateway',     url:'https://gateway.usps.com/eAdmin/view/signin',       logo:'/evotechmail/assets/partners/usps.png' },
    { name:'PostScanMail',     url:'https://operator.postscanmail.com/',                logo:'/evotechmail/assets/partners/psm.jpg' },
    { name:'iPostal1',         url:'https://ipostal1.com/CP/login.php',                 logo:'/evotechmail/assets/partners/ip.jpg' },
    { name:'Anytime Mailbox',  url:'https://signup.anytimemailbox.com/login',           logo:'/evotechmail/assets/partners/atm.jpg' },
  ];

  function initials(name){
    return (name||'').split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,3).join('').toUpperCase();
  }

  function renderLinks(){
    if (!grid) return;
    grid.innerHTML = PARTNERS.map(p => `
      <a class="ql-item" role="listitem" href="${p.url}" target="_blank" rel="noopener" aria-label="${p.name}">
        <img src="${p.logo}" alt="${p.name}" loading="lazy">
        <span class="label">${p.name}</span>
      </a>`).join('');

    grid.querySelectorAll('img').forEach(img=>{
      img.addEventListener('error', () => {
        const a  = img.closest('a');
        const fb = document.createElement('div');
        fb.className = 'logo-fallback';
        fb.textContent = initials(a?.getAttribute('aria-label') || '');
        img.replaceWith(fb);
      }, { once:true });
    });
  }

  function openCurtain(){
    handle.setAttribute('aria-expanded','true');
    curtain.setAttribute('aria-hidden','false');
  }
  function closeCurtain(){
    handle.setAttribute('aria-expanded','false');
    curtain.setAttribute('aria-hidden','true');
  }

  // wire
  handle.addEventListener('click', () => {
    (handle.getAttribute('aria-expanded') === 'true') ? closeCurtain() : openCurtain();
  });
  closeBtn?.addEventListener('click', closeCurtain);
  backdrop?.addEventListener('click', closeCurtain);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCurtain(); });

  renderLinks();
  handle.dataset.wired = '1';
})();




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Google Drive Upload
//(function(){
// Google Drive Upload
const out   = document.getElementById('driveOut');
const btn   = document.getElementById('btnUploadDocs');      // legacy button (may not exist)
const f1583 = document.getElementById('f_1583');
const fpid  = document.getElementById('f_photo_id');
const faddr = document.getElementById('f_addr_id');

// Only wire the legacy button if it exists; DO NOT return early so helpers below are defined.
if (btn && btn.dataset.wired !== '1') {
  btn.dataset.wired = '1';
  btn.addEventListener('click', async () => {
    if (!(await ensureGoogleConnectedWithPopup())) return;
    await smartUpload();
  });
}

// If you already have global $/val helpers elsewhere, delete the two lines below to avoid duplicates.
const el  = id => document.getElementById(id);
const val = id => (el(id)?.value ?? '').trim();

// Map Source -> partner code
function mapPartnerFromSource() {
  const srcSel = el('add_source');
  const raw = (srcSel?.value || srcSel?.selectedOptions?.[0]?.textContent || '').toLowerCase();
  if (raw.includes('post scan') || raw.includes('postscan')) return 'PSM';
  if (raw.includes('anytime')) return 'ATM';
  if (raw.includes('ipostal')) return 'IPOSTAL';
  if (raw.includes('davinci')) return 'DAVINCI';
  if (raw.includes('owner')) return 'OWNER';
  return 'OWNER';
}

function buildSubscriberName(first, last, company) {
  const base = `${(first || '').trim()} ${(last || '').trim()}`.trim();
  const co = (company || '').trim();
  return (!co || co.toLowerCase() === 'individual') ? base : `${base} (${co})`;
}

function getCtx(){
  const partner = mapPartnerFromSource();
  const pmb     = val('add_pmb');
  const first   = val('add_firstName');
  const last    = val('add_lastName');
  const company = val('add_company') || 'Individual';
  const subscriber_name = buildSubscriberName(first, last, company).replace(/\s+/g,' ');
  return { partner, pmb, subscriber_name };
}

// Popup OAuth (first-time only)
async function ensureGoogleConnectedWithPopup(){
  const st = await fetch('/evotechmail/api/drive/status', { credentials:'include' }).then(r=>r.json());
  if (st.connected) return true;

  const w = window.open(st.authUrl, 'gdrive_auth',
    'height=700,width=600,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes');
  if (!w) { alert('Please allow popups for this site to connect Google Drive.'); return false; }

  return new Promise(resolve => {
    const onMsg = (ev) => {
      if (ev?.data?.type === 'gdrive-connected') {
        window.removeEventListener('message', onMsg);
        try { w.close(); } catch {}
        resolve(true);
      }
    };
    window.addEventListener('message', onMsg);

    // Fallback poll
    const t = setInterval(async () => {
      try {
        const s = await fetch('/evotechmail/api/drive/status',{credentials:'include'}).then(r=>r.json());
        if (s.connected){ clearInterval(t); window.removeEventListener('message', onMsg); try{w.close();}catch{} resolve(true); }
      } catch {}
    }, 1000);
  });
}

async function smartUpload(){
  try{
    const { partner, pmb, subscriber_name } = getCtx();
    if (!partner || !pmb || !subscriber_name){
      if (out) out.textContent = JSON.stringify({ error: 'partner, pmb, subscriber_name are required' }, null, 2);
      return;
    }

    const files = [
      { field:'form_1583',  f: f1583?.files?.[0] },
      { field:'photo_id',   f: fpid?.files?.[0]  },
      { field:'address_id', f: faddr?.files?.[0] }
    ].filter(x => !!x.f);

    const total = files.reduce((n,x)=> n + (x.f.size||0), 0);
    if (total > 10 * 1024 * 1024) {
      if (out) out.textContent = JSON.stringify({ error:'Total upload size exceeds 10MB' }, null, 2);
      return;
    }

    const fd = new FormData();
    fd.append('partner', partner);
    fd.append('pmb', pmb);
    fd.append('subscriber_name', subscriber_name);
    for (const x of files) fd.append(x.field, x.f);

    if (out) out.textContent = 'Uploading to Drive…';

    // First-time OAuth popup if needed
    if (!(await ensureGoogleConnectedWithPopup())) return;

    const r = await fetch('/evotechmail/api/drive/smart-upload', {
      method: 'POST',
      body: fd,
      credentials: 'include'
    });

    if (r.status === 428) { // server says: not connected; provides authUrl
      const j = await r.json();
      location.href = j.authUrl;
      return;
    }

    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json()
             : { error: 'HTTP '+r.status, detail: (await r.text()).slice(0,200) };
    if (out) out.textContent = JSON.stringify(data, null, 2);
    return data;
  } catch(err){
    if (out) out.textContent = JSON.stringify({ error: String(err) }, null, 2);
  }
}


function getDriveCtx(){ return getCtx(); }


//// VIEW DRIVE DOCUMENTS:

function buildSubscriberName(first, last, company) {
  const base = `${(first||'').trim()} ${(last||'').trim()}`.trim();
  const co = (company||'').trim();
  if (!co || co.toLowerCase() === 'individual') return base;
  return `${base} (${co})`;
}

// replace existing getPartnerFromPayload in dashboard.js
function getPartnerFromPayload(source){
  const s = String(source || '').trim().toLowerCase();
  // accept already-normalized short codes
  if (['psm','atm','ipostal','davinci','owner'].includes(s)) return s.toUpperCase();
  // map common labels
  if (s.includes('post'))    return 'PSM';
  if (s.includes('anytime')) return 'ATM';
  if (s.includes('ipostal')) return 'IPOSTAL';
  if (s.includes('davinci')) return 'DAVINCI';
  if (s.includes('owner'))   return 'OWNER';
  return 'OWNER';
}

async function loadDriveDocsForPayload(p){
  const box   = document.getElementById('view_driveDocs');
  const openBtn = document.getElementById('openDriveFolderBtn');
  if (box) box.textContent = 'Checking Drive…';
  if (openBtn) openBtn.hidden = true;

  try {

       const row = Array.isArray(p?.row) ? p.row : [];
       const [pmb, first, last, company, phone, email, primaryAddr, status, source, bcg] = row;
       // build context
       const partner = getPartnerFromPayload(source);
       const name = buildSubscriberName(first , last , company || '');

      if (!partner || !pmb) {
        if (box) box.textContent = 'No partner/PMB.';
        return;
      }

      // ensure connected (optional: if you want silent status only, skip popup here)
      const st = await fetch('/evotechmail/api/drive/status', { credentials:'include' }).then(r=>r.json());
      if (!st.connected) {
        if (box) box.innerHTML = `Not connected to Drive. <button class="btn btn--small" id="connectDriveNow">Connect</button>`;
        document.getElementById('connectDriveNow')?.addEventListener('click', async () => {
          if (await ensureGoogleConnectedWithPopup()) loadDriveDocsForPayload(p);
        });
        return;
      }

    // query server
    //const qs = new URLSearchParams({ partner, pmb, subscriber_name: name });
      const qs = new URLSearchParams({
        partner,
        pmb,
        subscriber_name: name,
        first: first || '',
        last: last || ''
      });

    const resp = await fetch(`/evotechmail/api/drive/smart-list?${qs}`, { credentials:'include' });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`smart-list ${resp.status}: ${text.slice(0,200)}`);
    }
    const data = await resp.json();


    if (!data?.folder) {
      if (box) box.textContent = 'No folder found for this subscriber.';
      return;
    }

    // render
    const files = Array.isArray(data.files) ? data.files : [];
    if (openBtn) {
      openBtn.hidden = false;
      openBtn.onclick = () => window.open(data.folder.webViewLink || `https://drive.google.com/drive/folders/${data.folder.id}`, '_blank');
    }

    if (!files.length) {
      if (box) box.textContent = 'Folder found but empty.';
      return;
    }

    // simple list (name → opens in Drive)
    if (box) {
      box.innerHTML = files.map(f => {
        const icon = f.iconLink ? `<img src="${f.iconLink}" alt="" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;">` : '';
        const href = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
        return `<div class="one-line" style="margin:4px 0">
                  ${icon}<a href="${href}" target="_blank" rel="noopener">${escapeHTML(f.name)}</a>
                </div>`;
      }).join('');
    }
  } catch (e) {
    console.error('loadDriveDocsForPayload error', e);
    if (box) box.textContent = 'Error reading Drive.';
  }
}

// NOTE: Do NOT add another unguarded `btn.addEventListener(...)` below.
// The guarded wiring above is enough and avoids `btn` null errors.

//})();
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Toggle ID-docs block
(() => {
  const chk = document.getElementById('add_attachDocs');
  const blk = document.getElementById('add_docsBlock');
  if (!chk || !blk) return;
  chk.addEventListener('change', () => {
    if (chk.checked) { blk.removeAttribute('hidden'); }
    else { blk.setAttribute('hidden',''); blk.querySelectorAll('input[type="file"]').forEach(i=> i.value=''); }
  });
})();



// Back to page top arrow
(() => {
  const handle = document.getElementById('backTopHandle');
  if (!handle || handle.dataset.wired === '1') return;

  const THRESHOLD = 320; // px scrolled before showing the tab

  function onScroll(){
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y > THRESHOLD) handle.classList.add('is-show');
    else handle.classList.remove('is-show');
  }

  handle.addEventListener('click', (e) => {
    e.preventDefault();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll(); // initial

  handle.dataset.wired = '1';
})();


    
    // Sheets Helpers - Start   
    /* ---------- Unified sheet utilities ---------- */
    (function(){
        const byId = (id)=>document.getElementById(id);
      
        function openSheet({ title, bodyHTML, footerHTML, onOpen, onClose }){
          const sheet   = byId('sheet');
          const inner   = sheet?.querySelector('.sheet__inner');
          const headEl  = byId('sheetTitle');
          const bodyEl  = byId('sheetBody');
          const footEl  = byId('sheetFooter');
          const backBtn = byId('sheetBackBtn');
      
          if (!sheet || !inner || !headEl || !bodyEl || !footEl) return;
      
          headEl.textContent = title || '';
          bodyEl.innerHTML   = bodyHTML || '';
          footEl.innerHTML   = footerHTML || '';
      
          sheet.hidden = false;
          document.body.style.overflow = 'hidden';
      
          // Close only when the real backdrop (the sheet itself) is clicked
          const onBackdrop = (e) => {
            if (e.target === sheet) closeSheet();
          };
          // Keep the listener active (no {once:true})
          sheet.addEventListener('click', onBackdrop);
      
          const onEsc = (e) => { if (e.key === 'Escape') closeSheet(); };
          document.addEventListener('keydown', onEsc);
      
          if (backBtn){
            backBtn.hidden = false;
            backBtn.onclick = () => closeSheet();
          }
      
          sheet._onClose = () => {
            sheet.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onEsc);
            if (backBtn){ backBtn.hidden = true; backBtn.onclick = null; }
            if (typeof onClose === 'function') onClose();
          };
      
          if (typeof onOpen === 'function') onOpen();
        }
      
        function closeSheet(){
          const sheet = document.getElementById('sheet');
          const bodyEl = document.getElementById('sheetBody');
          const footEl = document.getElementById('sheetFooter');
          if (!sheet) return;
          sheet.hidden = true;
          document.body.style.overflow = '';
          if (typeof sheet._onClose === 'function') sheet._onClose();
          sheet._onClose = null;
          if (bodyEl) bodyEl.innerHTML = '';
          if (footEl) footEl.innerHTML = '';
        }
      
        window.openSheet = openSheet;
        window.closeSheet = closeSheet;
      })();
    // Sheets Helpwers - End

      document.addEventListener('DOMContentLoaded', () => {
        const wrap  = document.querySelector('.wrap');
        const hdr   = wrap?.querySelector('header');
        const tiles = document.getElementById('dashboardTiles');
        if (wrap && hdr && tiles && hdr.nextElementSibling !== tiles) {
          wrap.insertBefore(hdr, wrap.firstChild);
          wrap.insertBefore(tiles, hdr.nextSibling);
        }
      });

  // Format date as "YYYY-MM-DD HH:mm"
  function fmtTs(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

    function hideEl(el){ if(!el) return; el.setAttribute('hidden',''); el.style.display = 'none'; }
    function showEl(el){ if(!el) return; el.removeAttribute('hidden'); el.style.removeProperty('display'); }
  
    
    /* tiny DOM helper */
    let correctSource = '';
    const $ = (id) => document.getElementById(id);
    
    const listEl  = $('list');
    const countEl = $('loadedCount');
    const qEl     = $('q');
    
    let all = [];       // normalized records
    let fetched = false;
    
    /* Fetch and normalize from /fetch-all */
    async function loadFetchAll(){
      const r = await fetch('/evotechmail/api/fetch-all?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
    
      // Expect: { headers: [...], results: [{ id, row:[...], ... }, ...] }
      const headers = Array.isArray(payload?.headers) ? payload.headers : [];
      const results = Array.isArray(payload?.results) ? payload.results : [];
    
      // Build a header index (case-insensitive)
      const Hmap = Object.fromEntries(
        headers.map((h, i) => [String(h).trim().toLowerCase(), i])
      );
      const H = (key) => Hmap[String(key).toLowerCase()];  // helper
    
      // Normalize to { pmb, first_name, last_name, company }
      /*
      all = results.map(item => {
        const row = item?.row || [];
        return {
          pmb: row[H['PMB']],
          first_name: row[H['First Name']],
          last_name: row[H['Last Name']],
          company: row[H['Company']]
        };
      });
      */
      // all fields
      // Map all fields (robust to header casing)
      all = results.map(item => {
        const row = Array.isArray(item?.row) ? item.row : [];
        return {
          pmb:              row[H('PMB')],
          first_name:       row[H('First Name')],
          last_name:        row[H('Last Name')],
          company:          row[H('Company')],
          phone:            row[H('Phone')],
          email:            row[H('Email')],
          primary_address:  row[H('Primary Address')],
          status:           row[H('Status')],
          source:           row[H('Source')],
          bcg:              row[H('BCG')],
          // NEW: pass-through + parse if string
          notesJson:        parseJSONish(item?.notesJson),
          addressesJson:    parseJSONish(item?.addressesJson),
          // keep id if you use it later
          subscriber_id:    item?.id ?? null
        };
      });
    
      fetched = true;
      countEl.textContent = `${all.length} subscribers loaded`;

      // Re-run current search to render results (works for both initial load and refresh)
      qEl?.dispatchEvent(new Event('input'));
    }
    
///////////////////////////////////////////////////////
///////////////////////////////////////////////////////

  // Scoped drive list loader (copy of loadDriveDocsForPayload but scoped to a root)
    async function loadDriveDocsForPayloadScoped(p, root){
    const box     = root.querySelector('#upload_driveDocs');
    const openBtn = root.querySelector('#openDriveFolderBtn_upl');
    if (box) box.textContent = 'Checking Drive…';
    if (openBtn) openBtn.hidden = true;

    try {
      const row = Array.isArray(p?.row) ? p.row : [];
      const [pmb, first, last, company, _phone, _email, _addr, _status, source] = row;
      const partner = getPartnerFromPayload(source);
      const name = buildSubscriberName(first, last, company || '');
      if (!partner || !pmb){ if (box) box.textContent = 'No partner/PMB.'; return; }

      const st = await fetch('/evotechmail/api/drive/status', { credentials:'include' }).then(r=>r.json());
      if (!st.connected){
        if (box) box.innerHTML = `Not connected to Drive. <button class="btn btn--small" id="connectDriveNow_upl">Connect</button>`;
        root.querySelector('#connectDriveNow_upl')?.addEventListener('click', async () => {
          if (await ensureGoogleConnectedWithPopup()) loadDriveDocsForPayloadScoped(p, root);
        });
        return;
      }

      const qs = new URLSearchParams({ partner, pmb, subscriber_name: name, first: first||'', last: last||'' });
      const resp = await fetch(`/evotechmail/api/drive/smart-list?${qs}`, { credentials:'include' });
      if (!resp.ok) throw new Error((await resp.text()).slice(0,200));
      const data = await resp.json();

      // store folderId (if any) for the upload call
      root.dataset.folderId = data?.folder?.id || '';

      if (!data?.folder){ if (box) box.textContent = 'No folder found for this subscriber.'; return; }

      if (openBtn){
        openBtn.hidden = false;
        openBtn.onclick = () => window.open(data.folder.webViewLink || `https://drive.google.com/drive/folders/${data.folder.id}`, '_blank');
      }

      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length){ if (box) box.textContent = 'Folder found but empty.'; return; }

      if (box){
        box.innerHTML = files.map(f => {
          const icon = f.iconLink ? `<img src="${f.iconLink}" alt="" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;">` : '';
          const href = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
          return `<div class="one-line" style="margin:4px 0">${icon}<a href="${href}" target="_blank" rel="noopener">${escapeHTML(f.name)}</a></div>`;
        }).join('');
      }
    } catch(e){
      if (box) box.textContent = 'Error reading Drive.';
      console.error('loadDriveDocsForPayloadScoped error', e);
    }
  }


  // Add this helper near openUploadDrawerFromBtn (top-level)
function resetUploadPane(pane){
  if (!pane) return;
  // Clear text inputs
  const prefixEl = pane.querySelector('#upload_prefix');
  if (prefixEl) prefixEl.value = '';

  // Clear file inputs
  ['#u_f_1583','#u_f_addr','#u_f_pid'].forEach(sel => {
    const el = pane.querySelector(sel);
    if (el) el.value = '';
  });

  // Clear outputs / messages
  const mini = pane.querySelector('#upload_mini');
  const out  = pane.querySelector('#upload_out');
  const docs = pane.querySelector('#upload_driveDocs');
  if (mini) mini.textContent = '';
  if (out)  out.textContent  = '';
  if (docs) docs.textContent = 'Checking Drive…';

  // Hide “Open in Drive” until we re-load
  const openBtn = pane.querySelector('#openDriveFolderBtn_upl');
  if (openBtn) openBtn.hidden = true;

  // Clear any folderId we cached
  pane.dataset.folderId = '';
}

// Put this near your other helpers (top-level)
window.closeUpload = function(){
  const pane   = document.getElementById('uploadPane');
  const details= document.getElementById('detailsPane');
  const list   = document.getElementById('list');
  const tiles  = document.querySelector('.tiles-grid');
  const search = document.querySelector('.search');

  if (pane){
    pane.hidden = true;
    pane.style.display = 'none';
  }
  if (details){ details.hidden = true; details.style.display = 'none'; }

  // Restore tiles/search/list
  const show = el => {
    if (!el) return;
    if (typeof showEl === 'function') return showEl(el);
    el.hidden = false; el.style.removeProperty('display');
  };
  show(tiles);
  show(search);
  if (list) list.hidden = false;

  // Unhide all pills in list
  if (list) Array.from(list.children).forEach(el => el.classList.remove('is-hidden'));
  document.getElementById("dashback").style.display = "block";
}

// Replace your existing openUploadDrawerFromBtn with this version
window.openUploadDrawerFromBtn = async function(btnEl){
  const details = document.getElementById('detailsPane');
  const list    = document.getElementById('list');
  const tiles   = document.querySelector('.tiles-grid');
  const search  = document.querySelector('.search');
  const addPane = document.getElementById('addPane');

  // hide surfaces (same as Inbox)
  if (addPane) addPane.hidden = true;
  if (details){ details.hidden = true; details.style.display = 'none'; }
  if (tiles)   tiles.hidden   = true;
  if (search)  search.hidden  = true;
  if (list)    list.hidden    = true;

  // anchor
  const anchor = document.querySelector('.tiles-grid')
              || document.getElementById('list')
              || document.querySelector('.search')
              || document.body;

  let pane = document.getElementById('uploadPane');
  if (!pane){
    pane = document.createElement('section');
    pane.id = 'uploadPane';
    pane.className = 'card inline-details';
    pane.innerHTML = `
      <div class="view-header">
        <button class="btn" id="uploadBackBtn">← Back</button>
        <h2 class="view-title">Upload Documents</h2>
      </div>

      <div class="add-grid">
        <div><label>PMB</label><div data-pmb></div></div>
        <div><label>Name</label><div data-name></div></div>
        <div><label>Company</label><div data-company></div></div>
        <div><label>Source</label><div data-source></div></div>

        <div style="grid-column:1 / -1">
          <label for="upload_prefix">Prefix (required; e.g., primary, secondary)</label>
          <input type="text" id="upload_prefix" placeholder="e.g., primary" required>
        </div>

        <div><label>Form 1583</label><input type="file" id="u_f_1583" accept=".pdf,image/*"></div>
        <div><label>Address ID</label><input type="file" id="u_f_addr" accept=".pdf,image/*"></div>
        <div><label>Photo ID</label><input type="file" id="u_f_pid"  accept=".pdf,image/*"></div>
        <div style="grid-column:1 / -1" class="muted" id="upload_mini"></div>

        <div style="grid-column:1 / -1;margin-top:8px">
          <button class="btn btn--primary" id="uploadDoBtn" style="width:100%">Upload</button>
          <button class="btn" id="uploadCancelBtn" style="width:100%;margin-top:5px">Cancel</button>
        </div>

        <div class="inline-head" style="grid-column:1 / -1;margin-top:12px">
          <button id="openDriveFolderBtn_upl" class="btn btn--drive" hidden>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.3 78.5" width="16" height="16" class="drive-icon">
              <path fill="#4285f4" d="M44.1,0l43.2,75H56.1L12.9,0H44.1z"/>
              <path fill="#34a853" d="M0,75h56.1L43.2,52H0V75z"/>
              <path fill="#fbbc05" d="M44.1,0H12.9l43.2,75h31.2L44.1,0z"/>
              <path fill="#ea4335" d="M0,52h43.2l12.9,23H0V52z"/>
            </svg>
            <span>Open in Drive</span>
          </button>
        </div>
        <div id="upload_driveDocs" class="muted">Checking Drive…</div>

        <pre id="upload_out" class="muted" style="white-space:pre-wrap"></pre>
      </div>
    `;
    anchor.before(pane);

  // Replace your old Back-button wiring with this (wire once, after pane.innerHTML):
  pane.querySelector('#uploadBackBtn')?.addEventListener('click', e => { e.preventDefault(); closeUpload(); });
  pane.querySelector('#uploadCancelBtn')?.addEventListener('click', e => { e.preventDefault(); closeUpload(); });
  }
  

  pane.hidden = false;
  pane.style.display = '';

  // derive payload for this open
  const encoded = btnEl?.dataset?.encoded || btnEl?.closest('.pill')?.dataset?.encoded || '';
  const p = encoded ? JSON.parse(atob(encoded)) : (window.lastPayload || {});
  const row = Array.isArray(p?.row) ? p.row : [];
  const [pmb, first, last, company, _phone, _email, _addr, _status, source] = row;

  // Reset form each time the drawer opens (prevents stale values/files)
  resetUploadPane(pane);

  // Fill summary fields
  pane.querySelector('[data-pmb]')?.replaceChildren(document.createTextNode(pmb || ''));
  pane.querySelector('[data-company]')?.replaceChildren(document.createTextNode(company || ''));
  pane.querySelector('[data-name]')?.replaceChildren(document.createTextNode(`${(first||'').trim()} ${(last||'').trim()}`.trim()));
  pane.querySelector('[data-source]')?.replaceChildren(document.createTextNode(source || ''));

  // (Re)bind Upload button safely (remove old handler if any)
  const uploadBtnEl = pane.querySelector('#uploadDoBtn');
  if (uploadBtnEl && uploadBtnEl._handler){
    uploadBtnEl.removeEventListener('click', uploadBtnEl._handler);
  }
  if (uploadBtnEl){
    uploadBtnEl._handler = async () => {
      const f1583    = pane.querySelector('#u_f_1583')?.files?.[0] || null;
      const faddr    = pane.querySelector('#u_f_addr')?.files?.[0] || null;
      const fpid     = pane.querySelector('#u_f_pid') ?.files?.[0] || null;
      const prefixEl = pane.querySelector('#upload_prefix');
      const prefix   = (prefixEl?.value || '').trim();

      if (!prefix){
        prefixEl?.focus();
        await alertModal('Prefix is required (e.g., primary, secondary).', { title: 'Missing Prefix' });
        return;
      }

      const files = [{field:'form_1583',f:f1583},{field:'address_id',f:faddr},{field:'photo_id',f:fpid}].filter(x=>!!x.f);
      if (!files.length){
        await alertModal('Pick at least one file to upload.', { title: 'No Files' });
        return;
      }
      const total = files.reduce((n,x)=> n + (x.f?.size||0), 0);
      if (total > 10*1024*1024){
        await alertModal('Total upload size exceeds 10 MB.', { title: 'Too Large' });
        return;
      }

      if (!(await ensureGoogleConnectedWithPopup())) return;

      const row = Array.isArray(p?.row) ? p.row : [];
      const [pmb, first, last, company, _ph, _em, _ad, _st, source] = row;
      const fd = new FormData();
      fd.append('partner', getPartnerFromPayload(source));
      fd.append('pmb', String(pmb));
      fd.append('subscriber_name', buildSubscriberName(first, last, company || ''));
      fd.append('prefix', prefix);
      const folderId = pane.dataset.folderId || '';
      if (folderId) fd.append('folderId', folderId);
      for (const x of files) fd.append(x.field, x.f);

      try {
        toggleLoading(true, { title: 'Drive Upload', text: 'Uploading Documents' });

        const r = await fetch('/evotechmail/api/drive/direct-upload', { method:'POST', body: fd, credentials:'include' });
        const isJSON = (r.headers.get('content-type')||'').includes('application/json');
        const data = isJSON ? await r.json() : { error:`HTTP ${r.status}`, detail:(await r.text()).slice(0,200) };

        if (!r.ok || data?.error){
          toggleLoading(false);
          await alertModal('Error uploading documents: ' + (data?.error || `HTTP ${r.status}`), { title: 'Upload Failed' });
          return;
        }

        const names = (data.uploaded || []).map(u => u.name).join(', ');
        toggleLoading(false);
        await alertModal(names ? `Uploaded: ${names}` : 'Documents uploaded successfully.\n', { title: 'Saved' });

        // Reset the pane after a successful upload
        resetUploadPane(pane);

        // Refresh Drive list for this subscriber
        await loadDriveDocsForPayloadScoped(p, pane);
      } catch(e){
        console.error('prefixed upload error', e);
        toggleLoading(false);
        await alertModal('Error uploading documents: ' + (e?.message || String(e)), { title: 'Upload Failed' });
      } finally {
        toggleLoading(false);
      }
    };
    uploadBtnEl.addEventListener('click', uploadBtnEl._handler);
  }

  // Initial Drive list (also sets/hides the Open in Drive button)
  await loadDriveDocsForPayloadScoped(p, pane);
};


///////////////////////////////////////////////////////
///////////////////////////////////////////////////////


/* Render (PMB + name + company) + actions (View, Edit, Inactivate, Restore) */
function render(items = []) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<div class="muted">No records found</div>';
    return;
  }

  for (const s of items) {
    const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
    const co   = s.company ? `<span class="co">${s.company}</span>` : '';

    const statusVal    = norm(s.status);
    const bcgVal       = norm(s.bcg);
    const isClosedBoth = (statusVal === 'closed' && bcgVal === 'closed');  // highlight when fully closed
    const canClose     = (statusVal === 'closed' && bcgVal !== 'closed');  // allow inactivate

    const encoded = encodeBase64({
      id: s.subscriber_id ?? null,
      row: [
        s.pmb, s.first_name, s.last_name, s.company,
        s.phone, s.email, s.primary_address, s.status, s.source, s.bcg
      ],
      notesJson:     parseJSONish(s.notesJson),
      addressesJson: parseJSONish(s.addressesJson)
    });

    const el = document.createElement('div');
    el.className = 'pill' + (isClosedBoth ? ' pill-inactive' : '');
    el.innerHTML = `
      <div class="left">
        <span class="pmb">PMB ${s.pmb ?? ''}</span>
        <span class="name">${name || '(no name)'}</span>
        ${co}
      </div>
      <div class="right-actions">
        <!-- Inbox -->
        <button class="icon-btn inbox-btn" title="Inbox" data-encoded="${encoded}">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#0b7285"
            d="M19 3H5c-1.1 0-2 .9-2 
            2v14c0 1.1.9 2 2 2h14c1.1 
            0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 
            14h-4c0 1.66-1.34 3-3 
            3s-3-1.34-3-3H5V5h14v12z"/></svg>
        </button>

        <!-- View (eye) -->
        <button class="icon-btn view-btn" title="View" aria-label="View" data-encoded="${encoded}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#0b7285" d="M12 5C6.48 5 2.05 8.22.5 12c1.55 3.78 5.98 7 11.5 7s9.95-3.22 11.5-7C21.95 8.22 17.52 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>
          </svg>
        </button>

        <!-- Edit (disabled when fully closed) -->
        <button class="icon-btn edit-btn${isClosedBoth ? ' disabled' : ''}" title="Edit" aria-label="Edit"
          data-encoded="${encoded}" ${isClosedBoth ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#0b7285" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-11.5a1.5 1.5 0 0 0 0-2.12l-1.63-1.63a1.5 1.5 0 0 0-2.12 0l-1.59 1.59 3.75 3.75 1.59-1.59z"/>
          </svg>
        </button>

        <!-- Drive Upload -->
        <button class="icon-btn upload-btn" title="Upload to Drive" aria-label="Upload to Drive" data-encoded="${encoded}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#0b7285" d="M5 20h14a1 1 0 0 0 1-1v-6h-2v5H6v-5H4v6a1 1 0 0 0 1 1zm6-14.59V16a1 1 0 1 0 2 0V5.41l2.3 2.3a1 1 0 0 0 1.4-1.42l-4-4a1 1 0 0 0-1.4 0l-4 4A1 1 0 1 0 8.7 7.7L11 5.41z"/>
          </svg>
        </button>

        <!-- Inactivate (Close): active only when status=closed && bcg!=closed -->
        <button class="icon-btn inact-btn${canClose ? '' : ' disabled'}" title="Inactivate" aria-label="Inactivate" onclick="inactivateSubscriber(${s.subscriber_id})"
          data-id="${s.subscriber_id ?? ''}" ${canClose ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#0b7285" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11H7a1 1 0 1 1 0-2h10a1 1 0 1 1 0 2z"/>
          </svg>
        </button>

        <!-- Restore: active only when fully closed -->
        <button class="icon-btn restore-btn${isClosedBoth ? '' : ' disabled'}" title="Restore" aria-label="Restore" onclick="reActivateSubscriber(${s.subscriber_id})"
          data-id="${s.subscriber_id ?? ''}" ${isClosedBoth ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#0b7285" d="M12 5a7 7 0 1 1-6.93 8.06 1 1 0 1 1 1.98-.32A5 5 0 1 0 12 7a1 1 0 1 1 0-2zM5 7V3a1 1 0 0 1 2 0v1.59L9.3 2.3a1 1 0 1 1 1.4 1.42L7.4 7H5z"/>
          </svg>
        </button>
      </div>
    `;

    // Wire actions (no double-binding)
    const viewBtn    = el.querySelector('.view-btn');
    const editBtn    = el.querySelector('.edit-btn');
    const inactBtn   = el.querySelector('.inact-btn');
    const restoreBtn = el.querySelector('.restore-btn');
    const inboxBtn   = el.querySelector('.inbox-btn');
    const uploadBtn  = el.querySelector('.upload-btn');


    viewBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openViewFromBtn(ev.currentTarget);  // ✅ always the real button in the DOM
    });

    editBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (editBtn.disabled) return;
        const b64 = editBtn.dataset.encoded;
        openEditInlineFromBtn(editBtn, b64);
      });

    uploadBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openUploadDrawerFromBtn(uploadBtn);
    });
      

    inactBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (inactBtn.disabled) return;
      const id = inactBtn.dataset.id;
      if (typeof inactivateSubscriber === 'function') inactivateSubscriber(id);
    });

    restoreBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (restoreBtn.disabled) return;
      const id = restoreBtn.dataset.id;
      if (typeof reActivateSubscriber === 'function') reActivateSubscriber(id);
    });

    if (inboxBtn) {
    inboxBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openInboxFromBtn(ev.currentTarget);
    });}


    // Make the whole pill open "View" (except when clicking the right action buttons)
    el.dataset.encoded = encoded;                 // optional: keep for future
    el.setAttribute('tabindex', '0');             // keyboard access

    const triggerOpenView = () => {
    if (typeof openViewFromBtn === 'function' && viewBtn) {
        openViewFromBtn(viewBtn);                 // forward to the existing View button
    }
    };

    // mouse/touch click on pill body
    el.addEventListener('click', (ev) => {
    if (ev.target.closest('.right-actions')) return;   // ignore clicks on action buttons
    triggerOpenView();
    });

    // keyboard: Enter/Space opens view
    el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
        if (!ev.target.closest('.right-actions')) {
        ev.preventDefault();
        triggerOpenView();
        }
    }
    });



    listEl.appendChild(el);
  }
}




//////////////////////////////////////


// SVG icon helper
function svg(pathD){ 
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox','0 0 24 24'); el.setAttribute('width','16'); el.setAttribute('height','16'); el.setAttribute('aria-hidden','true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill','currentColor'); p.setAttribute('d', pathD); el.appendChild(p);
    return el;
  }
  const ICONS = {
    plus:  'M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z',
    save:  'M17 3H7a2 2 0 0 0-2 2v14l7-3 7 3V5a2 2 0 0 0-2-2zm-2 6H9a1 1 0 1 1 0-2h6a1 1 0 1 1 0 2z',
    cancel:'M6.4 5l12.6 12.6-1.4 1.4L5 6.4 6.4 5zm12.6 1.4L6.4 19.4 5 18l12.6-12.6 1.4 1.4z',
    trash: 'M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-3h6l1 2H8l1-2z'
  };
  
    ////////////////////////////////////////////////////
    ////////////////////////////////////////////////////
    /* Search-as-you-type (empty query => empty list) */
    ////////////////////////////////////////////////////
    ////////////////////////////////////////////////////

    function autoPopulateFilterSource(){
      const pmb = parseInt(document.getElementById('f_pmb')?.value || '', 10);
      const sourceField = document.getElementById('f_source');
      if (!sourceField || isNaN(pmb)) return;

      let correctSource = 'Owner';
      if (pmb >= 100 && pmb <= 499) {
        correctSource = 'PostScanMail';
      } else if (pmb >= 500 && pmb <= 899) {
        correctSource = 'AnyTimeMailBox';
      } else if (pmb >= 900 && pmb <= 1299) {
        correctSource = 'iPostal';
      } else if (pmb >= 1300) {
        correctSource = 'Davinci';
      }
      sourceField.value = correctSource;
    }



    const qInput = document.getElementById('q');
    const qClear = document.getElementById('qClear');
    const helpBtn = document.getElementById('searchHelpBtn');
    const helpPop = document.getElementById('searchHelpPopover');

    function updateClearVisibility(){
      if (!qClear) return;
      const hasText = (qInput?.value || '').length > 0;
      qClear.hidden = !hasText;
     // update counts
    const countEl = document.getElementById('searchCounts');
    if (countEl) {
      countEl.textContent = '';
    }
    }

    // toggle on input
    qInput?.addEventListener('input', updateClearVisibility);
    // initial state (in case of prefilled query)
    updateClearVisibility();

    // clear click
    qClear?.addEventListener('click', () => {
      if (!qInput) return;
      qInput.value = '';
      qInput.dispatchEvent(new Event('input')); // triggers your search to clear results
      qInput.focus();
    });

    // help popover (unchanged)
    helpBtn?.addEventListener('click', () => {
      helpPop.hidden = !helpPop.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!helpBtn.contains(e.target) && !helpPop.contains(e.target)) helpPop.hidden = true;
    });


    // --- Filter Drawer (inputs only; blank fields auto-add -flags) ---
    (() => {
    const $  = (id)=>document.getElementById(id);
    const qEl = $('q');

    // tiny cache so we only fetch lookups once
    let LOOKUPS = null;

    async function getLookups(){
      if (LOOKUPS) return LOOKUPS;
      const r = await fetch('/evotechmail/api/lookups');
      if (!r.ok) throw new Error('lookups HTTP '+r.status);
      LOOKUPS = await r.json();
      return LOOKUPS;
    }

    function fillSelect(sel, items, placeholder){
      if (!sel) return;
      const cur = sel.getAttribute('data-current') || '';
      sel.innerHTML = `<option value="">${placeholder}</option>` +
        (items||[]).map(o => {
          const v = o.code ?? o.label ?? '';
          const t = o.label ?? o.code ?? '';
          const selAttr = (String(v) === String(cur)) ? ' selected' : '';
          return `<option value="${escapeHtml(v)}"${selAttr}>${escapeHtml(t)}</option>`;
        }).join('');
    }

    // very small helper you already have variants of
    function escapeHtml(s=''){ return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

    $('filterBtn')?.addEventListener('click', async () => {
      openSheet({
        title: 'Filter Subscribers',
        bodyHTML: `
          <form id="filterForm" class="grid" style="grid-template-columns:1fr 1fr; gap:10px;">
            <div><label>PMB</label><input type="text" id="f_pmb"></div>

            <div>
              <label>Status</label>
              <select id="f_status" data-current=""></select>
            </div>

            <div><label>First Name</label><input type="text" id="f_first"></div>
            <div><label>Last Name</label><input type="text" id="f_last"></div>

            <div><label>Company</label><input type="text" id="f_company"></div>
            <div><label>Phone</label><input type="text" id="f_phone"></div>
            <div><label>Email</label><input type="text" id="f_email"></div>

            <div>
              <label>Source</label>
              <select id="f_source" data-current=""></select>
            </div>

            <div>
              <label>BCG</label>
              <select id="f_bcg" data-current=""></select>
            </div>

            <div class="full"><label>Address contains</label><input type="text" id="f_address"></div>
            <div class="full"><label>Notes contain</label><input type="text" id="f_notes"></div>
          </form>
        `,
        footerHTML: `
          <button id="filterApplyBtn" class="btn btn--primary">Apply Filter</button>
          <button id="filterClearBtn" class="btn">Clear</button>
        `,
        async onOpen(){
        // 1) Load lookups and populate selects
        try {
          const lk = await getLookups();
          fillSelect(document.getElementById('f_status'), lk.statuses, 'Any status');
          fillSelect(document.getElementById('f_source'), lk.sources,  'Any source');
          fillSelect(document.getElementById('f_bcg'),    lk.bcg,      'Any BCG');
        } catch(e){
          console.error('lookups failed:', e);
        }

        // 2) Prefill from current #q (do NOT reset form)
        const qNow = (document.getElementById('q')?.value || '').trim();

        // Helper: loose tokenization
        const rawTokens = qNow.toLowerCase().split(/\s+/).filter(Boolean);

        // Separate flags (start with '-') from normal terms
        const terms = [];
        const flags = new Set();
        for (const t of rawTokens){
          if (t.startsWith('-')) flags.add(t);
          else terms.push(t);
        }

        // Detect obvious structured values from terms
        const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
        const isPhone = s => /^(?:\+?\d[\d\s\-().]{6,}\d)$/.test(s);   // simple loose
        const isNum   = s => /^\d+$/.test(s);

        // Try to match lookup-coded terms into selects (by code OR label)
        const pickFromLookup = (list, term) => {
          const t = term.toLowerCase();
          return list.find(o =>
            String(o.code ?? '').toLowerCase() === t ||
            String(o.label ?? '').toLowerCase() === t
          ) || null;
        };

        const F = id => document.getElementById(id);
        const setIfBlank = (id, v) => {
          const el = F(id);
          if (!el) return;
          if (!(el.value || '').trim() && v) el.value = v;
        };
        const setSelectIfBlank = (id, codeValue) => {
          const el = F(id);
          if (!el) return;
          if (!(el.value || '').trim() && codeValue) {
            el.value = codeValue;
            el.setAttribute('data-current', codeValue); // persist across re-opens
          }
        };

        // Pull lookups once for matching
        let lk = LOOKUPS;
        try { lk = lk || await getLookups(); } catch {}

        for (const t of terms) {
          if (isEmail(t)) { setIfBlank('f_email', t); continue; }
          if (isPhone(t)) { setIfBlank('f_phone', t); continue; }
          if (isNum(t))   { setIfBlank('f_pmb',   t); continue; }

          if (lk) {
            const s1 = pickFromLookup(lk.statuses || [], t);
            if (s1) { setSelectIfBlank('f_status', s1.code ?? s1.label); continue; }

            const s2 = pickFromLookup(lk.sources || [], t);
            if (s2) { setSelectIfBlank('f_source', s2.code ?? s2.label); continue; }

            const s3 = pickFromLookup(lk.bcg || [], t);
            if (s3) { setSelectIfBlank('f_bcg',    s3.code ?? s3.label); continue; }
          }

          // Heuristics for common source words (if lookups didn’t catch them)
          if (['owner','postscan','post scan','anytime','anytime mailbox','ipostal','davinci']
              .includes(t.replace(/\s+/g,' '))) {
            setSelectIfBlank('f_source', t);
            continue;
          }
        }

        // Flags are informational for search; we do not auto-fill inputs from them.
        // (e.g. -fname / -lname keep excluding in the parser, but First/Last inputs remain blank)

        // 3) Wire footer buttons
        document.getElementById('filterClearBtn')?.addEventListener('click', () => {
          document.getElementById('filterForm')?.reset();
          ['f_status','f_source','f_bcg'].forEach(id=>{
            const el = document.getElementById(id);
            if (el) el.setAttribute('data-current','');
          });
        });

        const pmbEl = document.getElementById('f_pmb');
        pmbEl?.addEventListener('input', autoPopulateFilterSource);

        document.getElementById('filterApplyBtn')?.addEventListener('click', () => {
          const v = id => (document.getElementById(id)?.value || '').trim();
          autoPopulateFilterSource();

          const vals = {
            pmb:     v('f_pmb'),
            status:  v('f_status'),
            first:   v('f_first'),
            last:    v('f_last'),
            company: v('f_company'),
            phone:   v('f_phone'),
            email:   v('f_email'),
            source:  v('f_source'),
            bcg:     v('f_bcg'),
            address: v('f_address'),
            notes:   v('f_notes'),
          };

          const termsOut = Object.values(vals).filter(Boolean);

          const autoFlags = [];
          if (!vals.first)   autoFlags.push('-fname');
          if (!vals.last)    autoFlags.push('-lname');
          if (!vals.company) autoFlags.push('-company');
          if (!vals.email)   autoFlags.push('-email');
          if (!vals.phone)   autoFlags.push('-phone');
          if (!vals.address) autoFlags.push('-address');
          if (!vals.notes)   autoFlags.push('-notes');

          const query = [...termsOut, ...autoFlags].join(' ').trim();
          if (qEl){
            qEl.value = query;
            qEl.dispatchEvent(new Event('input'));
          }

          // persist current select choice across drawer re-opens in-session
          ['f_status','f_source','f_bcg'].forEach(id=>{
            const el = document.getElementById(id);
            if (el) el.setAttribute('data-current', el.value || '');
          });

          // Do NOT clear the form (per your requirement)
          closeSheet();
        });
      }

      });
    });
  })();



    // Groups to exclude when flags are present
    const SEARCH_FIELD_GROUPS = {
      address: ['primary_address', 'addressesJson'],
      name:    ['first_name', 'last_name'],  // -name excludes both (legacy)
      fname:   ['first_name'],               // -fname excludes first_name only
      lname:   ['last_name'],                // -lname excludes last_name only
      email:   ['email'],
      phone:   ['phone'],
      company: ['company'],
      notes:   ['notesJson'],
    };

    // All keys that can appear in the searchable haystack
    const SEARCHABLE_KEYS = new Set([
      'pmb','first_name','last_name','company','phone','email',
      'primary_address','status','source','bcg','notesJson','addressesJson'
    ]);

    function valueToText(v){
      if (v == null) return '';
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    }

    // Build a single string to search from a record 's' honoring exclusions
    function buildHaystack(s, excludedGroups){
      const excludeKeys = new Set(
        Array.from(excludedGroups).flatMap(g => SEARCH_FIELD_GROUPS[g] || [])
      );
      const parts = [];
      for (const [k, v] of Object.entries(s)) {
        if (!SEARCHABLE_KEYS.has(k)) continue;
        if (excludeKeys.has(k)) continue;
        parts.push(valueToText(v));
      }
      return parts.join(' ').toLowerCase();
    }


    let t = null;
    qEl.addEventListener('input', async (e) => {
      clearTimeout(t);
      const raw = e.target.value || '';
      t = setTimeout(async () => {
        const q = raw.trim();
        if (!q){ listEl.innerHTML = ''; return; }

        if (!fetched){
          try { await loadFetchAll(); }
          catch(err){
            console.error('fetch-all failed:', err);
            listEl.innerHTML = '<div class="muted">Error loading records</div>';
            return;
          }
        }

        // Parse tokens: collect exclude flags and positive terms
        // ... inside your existing qEl.addEventListener('input', ...) handler:
        const tokens   = q.toLowerCase().split(/\s+/).filter(Boolean);
        const excluded = new Set();
        const terms    = [];

        // NEW: a single source of truth for all exclude groups
        const ALL_GROUPS = ['address','name','fname','lname','company','notes','email','phone'];

        for (const tok of tokens) {
          if (tok === '-all') {
            // NEW: exclude all groups in one shot
            ALL_GROUPS.forEach(g => excluded.add(g));
          } else if (tok === '-address' || tok === '-addresses') excluded.add('address');
          else if (tok === '-name')                               excluded.add('name');
          else if (tok === '-fname')                              excluded.add('fname');
          else if (tok === '-lname')                              excluded.add('lname');
          else if (tok === '-company')                            excluded.add('company');
          else if (tok === '-notes' || tok === '-note')           excluded.add('notes');
          else if (tok === '-email' || tok === '-emails')         excluded.add('email');
          else if (tok === '-phone')                              excluded.add('phone');
          else terms.push(tok);
        }


        const out = all.filter(s => {
          const hay = buildHaystack(s, excluded);
          // AND across all positive terms
          return terms.every(t => hay.includes(t));
        });

        // update counts
        const countEl = document.getElementById('searchCounts');
        if (countEl) {
          countEl.textContent = `${out.length} out of ${all.length} Subscribers`;
        }

        render(out);

      }, 140);
    });

    /* OLD SEARCH
    let t = null;
    qEl.addEventListener('input', async (e) => {
      clearTimeout(t);
      const q = e.target.value.trim().toLowerCase();
      t = setTimeout(async () => {
        if (!q){ listEl.innerHTML = ''; return; }
        if (!fetched){
          try { await loadFetchAll(); }
          catch(err){
            console.error('fetch-all failed:', err);
            listEl.innerHTML = '<div class="muted">Error loading records</div>';
            return;
          }
        }

        const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);

        const out = all.filter(s => {
          const hay = Object.values(s).map(v => String(v || '').toLowerCase()).join(' ');
          return terms.every(t => hay.includes(t));
        });


        render(out);
      }, 140);
    });
    */
    
    /* Manual refresh: refetch and reapply current query */
    $('refreshBtn')?.addEventListener('click', async () => {
      hideDetailsPaneRestoreList(); // Incase refresh is clicked while detail is rendered;
      listEl.innerHTML = '<div class="muted">Loading…</div>';
      fetched = false; all = []; countEl.textContent = '';
      try { await loadFetchAll(); } catch(e){ console.error(e); listEl.innerHTML = '<div class="muted">Error loading</div>'; return; }
      // re-run search with current input
      qEl.dispatchEvent(new Event('input'));
    });
    
    // (Optional) initial empty render
    listEl.innerHTML = '';

    document.getElementById('backToMain')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/evotechmail/';
    });


    /** Format helper: pull a number out of mixed strings (e.g., "Active: 123") */
    const toDisplay = v => {
      if (v == null) return '—';
      const str = String(v).trim();
      const m = str.match(/[\d,]+(?:\.\d+)?/);
      return m ? m[0] : str || '—';
    };


    // constants
    //const TILE_EXCLUDE_FLAGS = '-fname -lname -company -email -phone -address -notes';
    const TILE_EXCLUDE_FLAGS = '-all';

    // render "A = N" lines as link-like buttons that set #q
    function renderTileLines(el, text, extrasTerms = []) {
      if (!el) return;
      const lines = String(text || '').split(/\r?\n/);
      el.innerHTML = ''; // replace existing content

      for (const raw of lines) {
        const m = /^\s*(.*?)\s*=\s*(\d+)\s*$/.exec(raw) || [];
        const label = (m[1] || raw).trim();       // words before '=' (or the full line)
        const count = m[2] || '';                 // number after '=' if present
        if (!label) continue;

        // Build the query: label + any extra terms + the exclude flags
        const base = [label, ...extrasTerms].filter(Boolean).join(' ').trim();
        const query = [base, TILE_EXCLUDE_FLAGS].filter(Boolean).join(' ').trim();

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile-line-link';
        btn.dataset.q = query;
        btn.textContent = count ? `${label} = ${count}` : label;

        el.appendChild(btn);
      }
    }

    // one-time delegation for all tiles
    (function wireTileClicks(){
      const tilesRoot = document.getElementById('dashboardTiles');
      if (!tilesRoot) return;
      tilesRoot.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.tile-line-link');
        if (!btn) return;
        const qEl = document.getElementById('q');
        if (!qEl) return;
        qEl.value = btn.dataset.q || '';
        qEl.dispatchEvent(new Event('input'));
      });
    })();


    async function loadHeaderValues() {
      try {
        const r = await fetch('/evotechmail/api/header-values');
        if (!r.ok) {
          console.error('header-values HTTP', r.status, await r.text().catch(()=>''));
          return;
        }
        const values = await r.json();

        if (typeof window.displaySheetValues === 'function') {
          await window.displaySheetValues(values);
        }

        // Which key goes to which tile, and any extra terms to add
        const map = [
          { key: 'Active Subscribers', id: 'activeSubscribersValue', extras: ['Active'] },
          { key: 'All Subscribers',    id: 'allSubscribersValue',    extras: [] },
          { key: 'USPS BCG Actions',   id: 'uspsBcgActionsValue',    extras: [] },
        ];

        for (const { key, id, extras } of map) {
          const el = document.getElementById(id);
          if (!el || !values[key]) continue;
          renderTileLines(el, values[key], extras);
        }

      } catch (e) {
        console.error('loadHeaderValues error:', e);
      }
    }



    // parses arrays that might arrive as real arrays OR JSON strings; otherwise null
    function parseJSONish(v){
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try { const x = JSON.parse(v); return Array.isArray(x) ? x : (x ?? null); }
        catch { return null; }
      }
      return (v && typeof v === 'object') ? v : null;
    }


    /* --- helpers View Subscriber--- */
    //const escapeHTML = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));

    function normalize_unicode_mojibake(s){
        if (!s) return s;
        return s
          // Common UTF-8→Latin-1 garbles:
          .replace(/â†’/g, '→')  // right arrow
          .replace(/â€”/g, '—')  // em dash
          .replace(/â€“/g, '–')  // en dash
          .replace(/â€˜/g, '‘')  // left single quote
          .replace(/â€™/g, '’')  // right single quote
          .replace(/â€œ/g, '“')  // left double quote
          .replace(/â€\x9D/g, '”') // right double quote (some fonts show as â€�)
          .replace(/â€¢/g, '•'); // bullet
      }
      
    function escapeHTML(str){
        return str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

    /* Read-only renderers (simplified from your legacy ones) */
    function roRenderAddresses(list = []) {
      if (!Array.isArray(list) || !list.length) return '<div class="meta">No addresses.</div>';
      const sorted = list.slice().sort((a,b)=>{
        if (!!b.is_primary !== !!a.is_primary) return (b.is_primary?1:0)-(a.is_primary?1:0);
        const at=a.last_mod_ts||a.create_ts, bt=b.last_mod_ts||b.create_ts;
        return (bt?+new Date(bt):0) - (at?+new Date(at):0);
      });
      return sorted.filter(a => !a.deleted).map(a=>{
        const line = [
          a.address_line_1, a.address_line_2,
          [a.city, a.state_province].filter(Boolean).join(', '),
          a.postal_code, a.country
        ].filter(Boolean).join(', ').replace(/\s+/g,' ').trim();
        const metaPieces = [];
        if (a.last_mod_user_id || a.create_user_id) metaPieces.push(a.last_mod_user_id || a.create_user_id);
        const ts = a.last_mod_ts || a.create_ts;
        if (ts) metaPieces.push(new Date(ts).toLocaleString());
        const meta = metaPieces.join(' @ ');
        return `
          <div class="addr-card" style="border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff;margin-bottom:10px;">
            <div class="addr-top" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div class="addr-meta meta">${escapeHTML(meta)}</div>
              ${a.is_primary ? `<span class="badge">Primary</span>` : ''}
            </div>
            <div class="addr-line ro-value">${escapeHTML(line)}</div>
          </div>`;
      }).join('');
    }
    function roRenderNotes(list = [], maxVisible = 100) {
      if (!Array.isArray(list) || !list.length) return '<div class="meta">No notes.</div>';
      return list.slice(0, maxVisible).map(n=>{
        const who  = n.note_user_id || n.create_user_id || '';
        const when = n.note_ts ? new Date(n.note_ts).toLocaleString() : '';
        const meta = [who, when].filter(Boolean).join(' @ ');
        const text = escapeHTML(n.note_text || '');
        return `
          <div class="note-card" style="border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff;margin-bottom:10px;">
            <div class="note-meta meta" style="margin-bottom:6px;">${escapeHTML(meta)}</div>
            <div class="note-text ro-value">${text}</div>
          </div>`;
      }).join('');
    }

    /* Toggle: show details, hide tiles/search/list */
    function showDetailsPane() {
      document.getElementById('detailsPane')?.removeAttribute('hidden');
      document.querySelector('.tiles-grid')?.setAttribute('hidden','');
      document.querySelector('.search')?.setAttribute('hidden','');
      document.getElementById('list')?.setAttribute('hidden','');
    }
    function hideDetailsPane() {
      document.getElementById('detailsPane')?.setAttribute('hidden','');
      document.querySelector('.tiles-grid')?.removeAttribute('hidden');
      document.querySelector('.search')?.removeAttribute('hidden');
      document.getElementById('list')?.removeAttribute('hidden');
    }

    /* Main renderer for the details */
    function openViewPanel(b64){
      let payload;
      try { payload = decodeBase64(b64); }
      catch(e){ console.error('Failed to decode payload', e); return; }

      const row = payload.row || [];
      const [pmb, first, last, company, phone, email, primaryAddr, status, source, bcg] = row;

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
      set('view_pmb', pmb ?? '');
      set('view_name', [first, last].filter(Boolean).join(' ') || 'Individual');
      set('view_company', company || 'Individual');
      set('view_phone', phone || '');
      set('view_email', email || '');
      set('view_status', status || '');
      set('view_source', source || '');
      set('view_bcg', bcg || '');
      const titleEl = document.getElementById('view_title');
      if (titleEl) titleEl.textContent = `Subscriber • PMB ${pmb ?? ''}`;

      // Addresses + Notes
      const addrs = (Array.isArray(payload.addressesJson) && payload.addressesJson.length)
        ? payload.addressesJson
        : (primaryAddr ? [{ address_line_1: String(primaryAddr), is_primary: true }] : []);
      const notes  = Array.isArray(payload.notesJson) ? payload.notesJson : [];

      const addrEl  = document.getElementById('view_addressesInline');
      const notesEl = document.getElementById('view_notesInline');
      if (addrEl)  addrEl.innerHTML  = roRenderAddresses(addrs);
      if (notesEl) notesEl.innerHTML = roRenderNotes(notes, 100);

      showDetailsPane();
    }

    document.getElementById('backToResultsBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      hideDetailsPaneRestoreList();
      document.getElementById("dashback").style.display = "block";
    });


    qEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') hideDetailsPane();
    });

    document.addEventListener('DOMContentLoaded', () => {
      loadHeaderValues();
      loadFetchAll().then(() => {
        // prefill search box with "active" and trigger search
        if (qEl) {
          qEl.value = 'active';
          qEl.dispatchEvent(new Event('input'));
          requestAnimationFrame(() => qEl.blur());
        }
      });
    });




    //const listEl = document.getElementById('list');    // ===== Inline details under a pill =====

//const listEl = document.getElementById('list');
let openInlineEl = null;     // currently-open details element
let openHostPill = null;     // pill that owns it

const esc = (s='') => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));

// Build details HTML (scoped; no global IDs)
function buildInlineDetails(payload){
  const row = payload.row || [];
  const [pmb, first, last, company, phone, email, primaryAddr, status, source, bcg] = row;

  const addrs = (Array.isArray(payload.addressesJson) && payload.addressesJson.length)
    ? payload.addressesJson
    : (primaryAddr ? [{ address_line_1: String(primaryAddr), is_primary: true }] : []);
  const notes  = Array.isArray(payload.notesJson) ? payload.notesJson : [];

  return `
    <section class="card inline-details">
      <div class="view-header">
        <button class="btn" data-act="back">← Back</button>
        <h2 class="view-title">Subscriber • PMB ${esc(pmb ?? '')}</h2>
      </div>

      <div class="view-grid">
        <div><label>PMB</label><div>${esc(pmb ?? '')}</div></div>
        <div><label>Name</label><div>${esc([first, last].filter(Boolean).join(' ') || 'Individual')}</div></div>
        <div><label>Company</label><div>${esc(company || 'Individual')}</div></div>
        <div><label>Phone</label><div>${esc(phone || '')}</div></div>
        <div><label>Email</label><div class="one-line">${esc(email || '')}</div></div>
        <div><label>Status</label><div>${esc(status || '')}</div></div>
        <div><label>Source</label><div>${esc(source || '')}</div></div>
        <div><label>BCG</label><div>${esc(bcg || '')}</div></div>
      </div>

      <div class="inline-section">
        <div class="inline-head"><span>Addresses</span></div>
        <div class="addresses">${roRenderAddresses(addrs)}</div>
      </div>

      <div class="inline-section">
        <div class="inline-head"><span>Notes</span></div>
        <div class="notes">${roRenderNotes(notes, 100)}</div>
      </div>
    </section>
  `;
}

// Hide all pills except the host
function hideOtherPills(host){
  [...listEl.children].forEach(el => {
    if (el !== host) el.classList.add('is-hidden');
  });
}
function showAllPills(){
  [...listEl.children].forEach(el => el.classList.remove('is-hidden'));
}

// Utility
// keep these at module scope
// let openInlineEl = null;
const isElement = (x) => x && typeof x === 'object' && x.nodeType === 1;


// --- safe decode helper (handles both raw and URI-encoded base64) ---

const norm = s => String(s ?? '').trim().toLowerCase();

function encodeBase64(obj){
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  }

function decodeBase64(b64){
    try {
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
      console.error('decodeBase64 failed:', e);
      return null;
    }
  }

  // Robust b64 decode (same style used in view)
  function decodeB64Safe(b64){
    try {
        return JSON.parse(decodeURIComponent(escape(atob(b64))));
      } catch (e) {
        console.error('decodeBase64 failed:', e);
        return null;
      }
  }
  

// keep this at top-level (not inside another function)
let lastViewPayload = null;

window.openViewFromBtn = function (btnEl) {
  try {
    if (!btnEl || !btnEl.dataset) {
      console.warn('openViewFromBtn: invalid element');
      return;
    }

    const b64 = btnEl.dataset.encoded;
    if (!b64) {
      console.warn('openViewFromBtn: missing data-encoded');
      return;
    }

    const decoded = decodeBase64(b64);
    if (!decoded) {
      console.warn('openViewFromBtn: could not decode payload');
      return;
    }

    lastViewPayload = decoded; // <-- only set after successful decode

    const pill = btnEl.closest('.pill');
    if (!pill) {
      console.warn('openViewFromBtn: host .pill not found');
      return;
    }

    // If you want to debug, use "decoded" here (NOT "payload")
    // alert(JSON.stringify(decoded, null, 2));

    // Inline attach right under the clicked pill + hide others
    showDetailsPaneWithPayloadInline(decoded, pill);
    document.getElementById("dashback").style.display = 'none';
  } catch (err) {
    console.error('openViewFromBtn error:', err);
  }
};




// Ensure we have this CSS somewhere:
// .is-hidden{ display:none !important; }

function populateDetailsPane(payload) {
  const row = Array.isArray(payload?.row) ? payload.row : [];
  const [pmb, first, last, company, phone, email, primaryAddr, status, source, bcg] = row;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('view_pmb', pmb ?? '');
  set('view_name', [first, last].filter(Boolean).join(' ') || 'Individual');
  set('view_company', company || 'Individual');
  set('view_phone', phone || '');
  set('view_email', email || '');
  set('view_status', status || '');
  set('view_source', source || '');
  set('view_bcg', bcg || '');

  const addrs = (Array.isArray(payload.addressesJson) && payload.addressesJson.length)
    ? payload.addressesJson
    : (primaryAddr ? [{ address_line_1: String(primaryAddr), is_primary: true }] : []);
  const notes  = Array.isArray(payload.notesJson) ? payload.notesJson : [];

  const addrEl  = document.getElementById('view_addressesInline');
  const notesEl = document.getElementById('view_notesInline');
  if (addrEl)  addrEl.innerHTML  = roRenderAddresses(addrs);
  if (notesEl) notesEl.innerHTML = roRenderNotes(notes, 100);

  const titleEl = document.getElementById('view_title');
  if (titleEl) titleEl.textContent = `Subscriber • PMB ${pmb ?? ''}`;

  //Load Drive documents
  loadDriveDocsForPayload(payload).catch(console.error);

}

function showDetailsPaneWithPayloadInline(payload, hostPill){
  const details = document.getElementById('detailsPane');
  const list    = document.getElementById('list');
  const tiles   = document.querySelector('.tiles-grid');
  const search  = document.querySelector('.search');
  const inbox   = document.querySelector('.inboxPane');

  if (!details || !list || !hostPill) {
    console.error('inline view: missing required elements', { details: !!details, list: !!list, hostPill: !!hostPill });
    return;
  }

  // 1) Populate details
  populateDetailsPane(payload);

  // 2) Ensure all pills are direct children we can hide
  const pills = Array.from(list.children).filter(n => n.classList && n.classList.contains('pill'));

  // 3) Move detailsPane directly after the clicked pill (into the #list grid)
  //    (If it previously lived elsewhere, move it here; DOM will adopt it.)
  hostPill.after(details);

  // 4) Hide all other pills (keep host visible)
  pills.forEach(p => p === hostPill ? p.classList.remove('is-hidden') : p.classList.add('is-hidden'));

  // 5) Hide tiles + search, keep #list visible (so host pill + details remain on screen)
  hideEl(tiles);
  hideEl(search);
  hideEl(inbox);
  showEl(list);

  // 6) Unhide details
  showEl(details);

  // 7) Scroll to the host pill (so the details appear "right under" visibly)
  hostPill.scrollIntoView({ behavior:'smooth', block:'start' });
}


function hideDetailsPaneRestoreList(){
  const details = document.getElementById('detailsPane');
  const list    = document.getElementById('list');
  const tiles   = document.querySelector('.tiles-grid');
  const search  = document.querySelector('.search');

  if (!details || !list) return;

  // Hide details
  hideEl(details);

  // Restore tiles/search
  showEl(tiles);
  showEl(search);

  // Unhide all pills
  [...list.children].forEach(el => el.classList.remove('is-hidden'));

  // Optionally move details back to the end (so it doesn't sit inside the list)
  list.after(details);
}


// Add Subscribers:

  function toOneLineAddress(s=''){ return String(s).replace(/\s+/g,' ').trim(); }
  function validateEmail(e=''){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim()); }

  // Locate a host pill for inline insertion. If none, create a placeholder.
  function getAddHostPill(){
    const list = document.getElementById('list');
    if (!list) return null;
    const firstPill = list.querySelector('.pill:not(.is-hidden)');
    if (firstPill) return firstPill;
    // create a placeholder pill so we can insert under it
    const ph = document.createElement('div');
    ph.className = 'pill';
    ph.id = 'addHostPill';
    ph.innerHTML = `<div class="left"><span class="pmb">PMB —</span><span class="name">New subscriber</span></div>`;
    list.prepend(ph);
    return ph;
  }

  function populate_select(selector, items, placeholder) {
    const el = document.querySelector(selector);
    if (!el) return;

    const prevValue = el.value;
    el.innerHTML = '';

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder || 'Select';
    el.appendChild(opt0);

    (items || []).forEach(({ code, label }) => {
      const opt = document.createElement('option');
      opt.value = label;               // keep existing behavior (filters/search expect label text)
      opt.dataset.code = code;         // store canonical code for later
      opt.textContent = label;
      el.appendChild(opt);
    });

    // Try to restore previous selection
    if (prevValue) {
      const found = Array.from(el.options).some(o =>
        o.value.toLowerCase().trim() === prevValue.toLowerCase().trim()
        || (o.dataset.code || '').toLowerCase().trim() === prevValue.toLowerCase().trim()
      );
      el.value = found ? prevValue : '';
    } else {
      el.value = '';
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Populate selects from lookups; default Status=Active, BCG=New
  async function ensureLookupsAndPopulateAdd(){
    if (typeof load_lookups_and_populate === 'function') {
      await load_lookups_and_populate(); // populates #add_source/#add_status if implemented as you shared
    } else {
      // Minimal inline fallback if that function isn't on this page
      try {
        const r = await fetch('/evotechmail/api/lookups', { cache: 'no-store' });
        const data = await r.json();
        window._lookups = {
          sources:  Array.isArray(data.sources)  ? data.sources  : [],
          statuses: Array.isArray(data.statuses) ? data.statuses : [],
          bcg:      Array.isArray(data.bcg)      ? data.bcg      : [],
        };
        populate_select('#add_source',  window._lookups.sources,  'Select Source');
        populate_select('#add_status',  window._lookups.statuses, 'Select Status');
      } catch(e){ console.warn('lookups fallback failed', e); }
    }

    // Defaults: Status -> active ; BCG -> New (input already set to New)
    const st = document.getElementById('add_status');
    if (st) {
      const options = Array.from(st.options);
      const match = options.find(o => (o.dataset.code || '').toLowerCase() === 'active'
        || o.value.toLowerCase() === 'active');
      st.value = match ? match.value : '';
      st.dispatchEvent(new Event('change'));
    }
  }

  function openAddInline(){
    document.getElementById("dashback").style.display = "none";
    clearAddForm();
    const addPane = document.getElementById('addPane');
    const list    = document.getElementById('list');
    const details = document.getElementById('detailsPane');
    const tiles   = document.querySelector('.tiles-grid');
    const search  = document.querySelector('.search');
    const wrap    = document.querySelector('.wrap');
  
    if (!addPane || !wrap) return;
  
    // Move addPane near the top (right after the header or tiles if present)
    const anchor = tiles || search || list;
    if (anchor && addPane.previousElementSibling !== anchor) {
      anchor.before(addPane);             // put addPane above the main content area
    }
  
    // Hide others
    if (list)    list.hidden    = true;
    if (details) details.hidden = true;   // will now actually hide because of [hidden] CSS
    if (tiles)   tiles.hidden   = true;
    if (search)  search.hidden  = true;
  
    // Show add pane
    addPane.hidden = false;
  
    // Prefill PMB if search contains a number
    const pmbEl = document.getElementById('add_pmb');
    if (pmbEl && window.qEl && /^\d+$/.test(qEl.value.trim())) {
      pmbEl.value = qEl.value.trim();
    }
  
    // Populate selects + defaults
    ensureLookupsAndPopulateAdd();
  
    // Focus first field and scroll into view
    setTimeout(() => {
      pmbEl?.focus({ preventScroll:true });
      addPane.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 0);
  }
  
  

  // Hide Add pane and restore the pill list
  function closeAddInline(){
    const addPane = document.getElementById('addPane');
    const list    = document.getElementById('list');
    const details = document.getElementById('detailsPane');
    const tiles   = document.querySelector('.tiles-grid');
    const search  = document.querySelector('.search');
  
    if (!addPane) return;
  
    addPane.hidden = true;
    showEl(tiles);
    showEl(search);
    showEl(list);
    hideEl(details);

    document.getElementById("dashback").style.display = "block";
  }
  
  

  // Wire add pane buttons

  document.getElementById('addBackBtn')?.addEventListener('click', e => {
    e.preventDefault(); closeAddInline();
  });
  document.getElementById('addCancelBtn')?.addEventListener('click', e => {
    e.preventDefault(); closeAddInline();
  });


  // Clear form
  function clearAddForm(){
    ['add_pmb','add_firstName','add_lastName','add_company','add_phone','add_email','add_primaryAddress','add_notes']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const st = document.getElementById('add_status');
    if (st) st.value = '';
    const src = document.getElementById('add_source');
    if (src) src.value = '';
    const bcg = document.getElementById('add_bcg');
    if (bcg) bcg.value = 'New';
  }

  function resetDocsUI() {
    const ids = ['f_1583','f_photo_id','f_addr_id'];
    ids.forEach(id => {
      const inp = document.getElementById(id);
      const nameEl = document.getElementById(id + '_name');
      if (inp) inp.value = '';
      if (nameEl) nameEl.textContent = '';
    });
    const mini = document.getElementById('uploadMiniStatus');
    if (mini) mini.textContent = '';
  }


async function submitAddSubscriber(){
  const get = (id) => document.getElementById(id);

// ==== your original validation ====
  const pmb   = (get('add_pmb')?.value || '').trim();
  if (!/^\d+$/.test(pmb)) return alertModal('Please enter a valid numeric PMB.');

  const email = (get('add_email')?.value || '').trim();
  if (email && !validateEmail(email)) return alertModal('Please enter a valid email address.');

  const srcEl = get('add_source');
  const stEl  = get('add_status');

  const source = srcEl?.selectedOptions?.[0]?.dataset?.code || (srcEl?.value || '').trim();
  const status = stEl?.selectedOptions?.[0]?.dataset?.code || (stEl?.value  || '').trim();

  if (!status) return alertModal('Please select a Status.');
  if (!source) return alertModal('Please select a Source.');

  const firstName = (get('add_firstName')?.value || '').trim();
  const lastName  = (get('add_lastName')?.value  || '').trim();
  const phone     = (get('add_phone')?.value     || '').trim();

  if (!firstName) return alertModal('Please enter a First Name.');
  if (!lastName)  return alertModal('Please enter a Last Name.');
  if (!phone)     return alertModal('Please enter a Phone number.');

  const addrEl = get('add_primaryAddress');
  const primaryAddressOneLine = toOneLineAddress(addrEl?.value || '');
  if (!primaryAddressOneLine){
    alertModal('Primary Address is required.');
    addrEl?.focus({ preventScroll:true });
    addrEl?.scrollIntoView({ block:'center' });
    return;
  }

  // payload for your DB
  const payload = {
    pmb,
    firstName,
    lastName,
    company:        (get('add_company')?.value || '').trim(),
    phone,
    email,
    status,
    source,
    primaryAddress: primaryAddressOneLine,
    notes:          (get('add_notes')?.value || '').trim()
  };

  // UI bits
  const saveBtn = $('addSaveBtn');
  const oldLabel = saveBtn?.textContent;
  const mini = $('uploadMiniStatus');     // small area under file inputs
  const attachDocs = $('add_attachDocs')?.checked;

  if (saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  if (mini) mini.textContent = '';

  try {
    toggleLoading(true, { title: 'Add', text: 'Add Subscriber & Upload Documents' });
    // 1) Create in DB (unchanged)
    const r = await fetch('/evotechmail/api/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error(body?.error || (typeof body === 'string' ? body : 'Add failed'));


  // 2) If user checked "Attach ID documents", push to Drive now
  let uploadSummaryLines = [];          // <-- move this to the top of submitAddSubscriber if you prefer
  let uploadHadError = false;           // track if any file failed

  if (attachDocs) {
    // don't throw on Drive issues — we want to show them in the success modal
    const f1583 = $('f_1583')?.files?.[0] || null;
    const fpid  = $('f_photo_id')?.files?.[0] || null;
    const faddr = $('f_addr_id')?.files?.[0] || null;

    const files = [
      { label:'1583',      type:'1583',   field:'form_1583',  file: f1583 },
      { label:'Photo ID',  type:'PHOTO',  field:'photo_id',   file: fpid  },
      { label:'Address ID',type:'ADDRESS',field:'address_id', file: faddr }
    ].filter(x => !!x.file);

    // If nothing selected, just leave uploadSummaryLines empty
    if (files.length) {
      // size guard (<=10MB total)
      const total = files.reduce((n,x)=> n + (x.file.size||0), 0);
      if (total > 10 * 1024 * 1024) {
        uploadHadError = true;
        uploadSummaryLines = files.map(x => `❌ ${x.label}${x.file?.name ? ` — ${x.file.name}` : ''} (total > 10MB)`);
      } else {
        // Try popup connection; if not connected, mark all as failed but continue
        let connected = false;
        try {
          connected = await ensureGoogleConnectedWithPopup();
        } catch { connected = false; }
        if (!connected) {
          uploadHadError = true;
          uploadSummaryLines = files.map(x => `❌ ${x.label}${x.file?.name ? ` — ${x.file.name}` : ''} (Drive not connected)`);
        } else {
          // Build and send upload
          const { partner, pmb, subscriber_name } = getDriveCtx();
          const fd = new FormData();
          fd.append('partner', partner);
          fd.append('pmb', pmb);
          fd.append('subscriber_name', subscriber_name);
          for (const x of files) fd.append(x.field, x.file);

          try {
            const upRes = await fetch('/evotechmail/api/drive/smart-upload', {
              method: 'POST',
              body: fd,
              credentials: 'include'
            });

            const isJSON = (upRes.headers.get('content-type')||'').includes('application/json');
            const data = isJSON ? await upRes.json() : { error: `HTTP ${upRes.status}` };

            // ---- Robust status parsing (inline) ----
            const normalizeItems = (d) => {
              if (Array.isArray(d?.uploaded)) return d.uploaded;
              if (Array.isArray(d?.results))  return d.results;
              if (Array.isArray(d?.files))    return d.files;
              if (Array.isArray(d))           return d;
              return [];
            };
            const isSuccessItem = (it) => {
              if (!it) return false;
              if (it.error) return false;
              if (it.ok === false) return false;
              if (it.status && String(it.status).toLowerCase().match(/fail|error|denied|not/)) return false;
              if (it.ok === true) return true;
              if (it.id) return true;
              if (it.status && String(it.status).toLowerCase().match(/uploaded|updated|created|ok|success/)) return true;
              return false;
            };
            const matchesType = (it, needle, fileObj) => {
              const n = String(needle).toUpperCase();
              const lt = (it.logicalType || it.type || it.kind || '').toString().toUpperCase();
              if (lt.includes(n)) return true;
              const f = (it.field || it.srcField || it.uploadField || '').toString().toUpperCase();
              if (f.includes(n)) return true;
              const itName = (it.originalName || it.name || '').toString().toUpperCase();
              if (fileObj?.name && itName && itName === fileObj.name.toUpperCase()) return true;
              return false;
            };

            const items = normalizeItems(data);
            const parts = [];
            for (const x of files) {
              const hit = items.find(it => matchesType(it, x.type, x.file));
              const ok  = hit ? isSuccessItem(hit) : (upRes.ok && !data?.error);
              const reason = !ok ? (hit?.error || hit?.detail || hit?.message || data?.error || 'failed') : '';
              parts.push(`${ok ? '✅' : '❌'} ${x.label}${x.file?.name ? ` — ${x.file.name}` : ''}${!ok && reason ? ` (${reason})` : ''}`);
              if (!ok) uploadHadError = true;
            }
            uploadSummaryLines = parts;

            // mini line under inputs (ticks only)
            if (mini) {
              mini.textContent = parts
                .map(p => p.replace('✅','✓').replace('❌','✗').replace(/\s*\(.+?\)$/, ''))
                .join('  ·  ');
            }
            // ---- end robust status parsing ----
          } catch (e) {
            // Network/other fetch error — mark all as failed
            uploadHadError = true;
            const reason = e?.message ? e.message : 'upload failed';
            uploadSummaryLines = files.map(x => `❌ ${x.label}${x.file?.name ? ` — ${x.file.name}` : ''} (${reason})`);
          }
        }
      }
    }
  }

    // Build the final modal message
    const uploadBlock = uploadSummaryLines.length
      ? `\n\nDrive upload:\n${uploadSummaryLines.join('\n')}`
      : (attachDocs ? `\n\nDrive upload:\n(no files selected)` : '');

    const headline = uploadHadError
      ? `Subscriber with PMB ${pmb} (id ${body.subscriber_id}) added — but some documents did not upload.`
      : `Subscriber with PMB ${pmb} (id ${body.subscriber_id}) added successfully.`;

    alertModal(`${headline}${uploadBlock}`);

    // clear & close (unchanged)
    resetDocsUI();
    clearAddForm();
    closeAddInline();
    $('add_attachDocs') && ($('add_attachDocs').checked = false);
    $('add_docsBlock') && $('add_docsBlock').setAttribute('hidden','');

    await loadFetchAll();
    await loadHeaderValues();
    $('q')?.dispatchEvent(new Event('input'));

    toggleLoading(false);
  } catch (e) {
    alertModal('Error adding subscriber: ' + (e?.message || String(e)));
    toggleLoading(false);
  } finally {
    if (saveBtn){ saveBtn.disabled = false; saveBtn.textContent = oldLabel || 'Add Subscriber'; }
    toggleLoading(false);
  }
}



  document.getElementById('addSaveBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    submitAddSubscriber();
  });



  async function forceCorrectSource() {
    const sourceField = document.getElementById('add_source');
    if (sourceField.value !== correctSource) {
      sourceField.value = correctSource;
    }
}


async function autoPopulateAddSource(){
    const pmb = parseInt(document.getElementById('add_pmb').value, 10);
    const sourceField = document.getElementById('add_source');

    if (pmb >= 100 && pmb <= 499) {
      correctSource = 'PostScanMail';
    } else if (pmb >= 500 && pmb <= 899) {
      correctSource = 'AnyTimeMailBox';
    } else if (pmb >= 900 && pmb <= 1299) {
      correctSource = 'iPostal';
    } else if (pmb >= 1300) {
      correctSource = 'Davinci';
    } else {
      correctSource = 'Owner';
    }

    sourceField.value = correctSource;
  }     



  async function inactivateSubscriber(subscriber_id) {
    if (!subscriber_id) {
      alertModal('subscriber_id is required.');
      return;
    }
  
    try {
      const url = `/evotechmail/api/subscribers/${encodeURIComponent(subscriber_id)}/inactivate`;
      const r = await fetch(url, { method: 'POST' });
      const t = await r.text();
      if (!r.ok) throw new Error(t || 'Request failed');
  
      // reflect only BCG in UI (no status change)
      if (typeof set_select_by_code_or_label === 'function') {
        set_select_by_code_or_label('#edit_bcg', 'closed');
      }
  
      await loadFetchAll();
      alertModal(t); //`Subscriber ${subscriber_id} BCG set to 'closed'.`);
    } catch (e) {
      alertModal('Error during inactivation: ' + e.message);
    } finally {
      null;
    }
  }


  async function reActivateSubscriber(subscriber_id) {
    if (!subscriber_id) {
      AlertModal('subscriber_id is required.');
      return;
    }
  
    try {
      const url = `/evotechmail/api/subscribers/${encodeURIComponent(subscriber_id)}/reactivate`;
      const r = await fetch(url, { method: 'POST' });
      const t = await r.text();
      if (!r.ok) throw new Error(t || 'Request failed');
  
      // reflect only BCG in UI (no status change)
      if (typeof set_select_by_code_or_label === 'function') {
        set_select_by_code_or_label('#edit_bcg', 'closed');
      }
  
      alertModal(t); //`Subscriber ${subscriber_id} BCG set to 'complete'.`);
      await loadFetchAll();
    } catch (e) {
        alertModal('Error during reactivation: ' + e.message);
    } finally {
      null;
    }
  }



  ////// EDIT PANE:

  // ==== EDIT PANE ===================================================

// Populate edit selects using your shared lookups loader
async function ensureLookupsAndPopulateEdit(){
    if (typeof load_lookups_and_populate === 'function') {
      await load_lookups_and_populate();
    } else {
      // Fallback (mirrors Add fallback but targets edit_* ids)
      try {
        const r = await fetch('/evotechmail/api/lookups', { cache: 'no-store' });
        const data = await r.json();
        window._lookups = {
          sources:  Array.isArray(data.sources)  ? data.sources  : [],
          statuses: Array.isArray(data.statuses) ? data.statuses : [],
          bcg:      Array.isArray(data.bcg)      ? data.bcg      : [],
        };
        if (typeof populate_select === 'function') {
          populate_select('#edit_source',  window._lookups.sources,  'Select Source');
          populate_select('#edit_status',  window._lookups.statuses, 'Select Status');
          populate_select('#edit_bcg',     window._lookups.bcg,      'Select BCG');
        }
      } catch(e){ console.warn('lookups fallback (edit) failed', e); }
    }
  }
  

  
  // Small helper to set a select by displayed label or value
  function setSelByTextOrValue(id, value){
    if (typeof setSel === 'function') return setSel(id, value); // use your helper if present
    const el = document.getElementById(id);
    if (!el) return;
    const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g,' ').trim();
    const target = norm(value);
    let matched = false;
    for (const opt of Array.from(el.options)) {
      if (norm(opt.value) === target || norm(opt.textContent) === target) {
        el.value = opt.value; matched = true; break;
      }
    }
    if (!matched) el.value = value ?? '';
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  
  // Attach and show the Edit pane (like Add pane UX)
  function openEditInlineFromBtn(btnEl, b64){
    const payload = decodeB64Safe(b64);
    if (!payload) return;
  
    const editPane = document.getElementById('editPane');
    const list     = document.getElementById('list');
    const details  = document.getElementById('detailsPane');
    const tiles    = document.querySelector('.tiles-grid');
    const search   = document.querySelector('.search');
  
    if (!editPane) return;
  
    // Move edit pane near the top (same as Add)
    const anchor = tiles || search || list;
    if (anchor && editPane.previousElementSibling !== anchor) {
      anchor.before(editPane);
    }
  
    // Hide the rest; show edit
    hideEl(list);
    hideEl(details);
    hideEl(tiles);
    hideEl(search);
    showEl(editPane);
  
    // Fill form
    fillEditFormFromPayload(payload);
  
    // Focus + scroll
    setTimeout(() => {
      document.getElementById('edit_firstName')?.focus({ preventScroll:true });
      editPane.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 0);
  }


    // Build textarea text from notes JSON (newest first by ts/id)
    function formatNotesForTextarea(notesArr = []) {
        const safe = Array.isArray(notesArr) ? notesArr.slice() : [];
        safe.sort((a,b) => {
          const at = a.last_mod_ts || a.note_ts;
          const bt = b.last_mod_ts || b.note_ts;
          const aT = at ? new Date(at).getTime() : 0;
          const bT = bt ? new Date(bt).getTime() : 0;
          if (bT !== aT) return bT - aT;
          return (b.note_id ?? 0) - (a.note_id ?? 0);
        });
    
        return safe
        .filter(n => !n.deleted)
        .map(n => {
          const ts   = n.last_mod_ts || n.note_ts;                    // ← use last_mod_ts
          const when = ts ? `[${fmtTs(ts)}]` : '';
          const who  = (n.last_mod_user_id || n.note_user_id) || '';
          return `${when} ${who}: ${n.note_text || ''}`.trim();
        })
        .join('\n');
    
      }
  
  function closeEditInline(){
    const editPane = document.getElementById('editPane');
    const list     = document.getElementById('list');
    const details  = document.getElementById('detailsPane');
    const tiles    = document.querySelector('.tiles-grid');
    const search   = document.querySelector('.search');
  
    if (!editPane) return;
  
    hideEl(editPane);
    showEl(tiles);
    showEl(search);
    if (list)    showEl(list);
    if (details) hideEl(details);
    // Unhide all pills
    [...list.children].forEach(el => el.classList.remove('is-hidden'));
    document.getElementById("dashback").style.display = "block";
  }
  
  // Build the edit form values out of the payload (row + notes/addresses JSON)
  async function fillEditFormFromPayload(payload){
    const row = Array.isArray(payload?.row) ? payload.row : [];
    const [pmb, first, last, company, phone, email, primaryAddr, status, source, bcg] = row;
    const subscriberId = payload?.id || payload?.subscriber_id || null;

    // Basic fields
    document.getElementById('edit_subscriber_id').value = subscriberId || '';
    document.getElementById('edit_pmb').value           = pmb ?? '';
    document.getElementById('edit_firstName').value     = first ?? '';
    document.getElementById('edit_lastName').value      = last ?? '';
    document.getElementById('edit_company').value       = company ?? '';
    document.getElementById('edit_phone').value         = phone ?? '';
    document.getElementById('edit_email').value         = email ?? '';
  
    // Ensure selects are populated, then select values
    await ensureLookupsAndPopulateEdit();
    setSelByTextOrValue('edit_status', status);
    setSelByTextOrValue('edit_source', source);
    setSelByTextOrValue('edit_bcg',    bcg);
/*
    document.getElementById('edit_status').value   = status ?? '';
    document.getElementById('edit_source').value   = source ?? '';
    document.getElementById('edit_bcg').value      = bcg ?? '';
*/

    // Textarea now shows ALL notes (with timestamp) compiled from notesJson
    const notesJson = Array.isArray(payload?.notesJson) ? payload.notesJson : [];
    const notesEl   = document.getElementById('edit_notes');
    const compiled  = formatNotesForTextarea(notesJson);
    notesEl.value = compiled;
    notesEl.dataset.empty = compiled.trim() ? '0' : '1';

    // Reset modal state for this edit session
    window._currentNotesJson = JSON.parse(JSON.stringify(notesJson)); // deep copy
    window._editNotes = null;
    window._editNotesDirty = false;
  
    // ----- Addresses -----
    const addressesJson = Array.isArray(payload?.addressesJson) ? payload.addressesJson : [];
    window._currentAddressesJson = JSON.parse(JSON.stringify(addressesJson)); // deep copy
    window._editAddresses = JSON.parse(JSON.stringify(addressesJson));; //null;
    window._editAddressesDirty = true; //false;

    // build compiled text exactly like notes
    const addrEl = document.getElementById('edit_primaryAddress');
    if (addrEl) {
    const compiledAddr = formatAddressesForTextarea(addressesJson); // primary first, last_mod_ts, who, etc.
    addrEl.value = compiledAddr;
    addrEl.dataset.empty = compiledAddr.trim() ? '0' : '1';
    }

    // Baseline (for diff on save)
    snapshotOriginalEditState();

  }


  function _editFormState(){
    return {
      firstName:      document.getElementById('edit_firstName').value,
      lastName:       document.getElementById('edit_lastName').value,
      company:        document.getElementById('edit_company').value,
      phone:          document.getElementById('edit_phone').value,
      email:          document.getElementById('edit_email').value,
      primaryAddress: document.getElementById('edit_primaryAddress').value,
      status:         document.getElementById('edit_status').value,
      source:         document.getElementById('edit_source').value,
      bcg:            document.getElementById('edit_bcg').value
    };
  }

  function snapshotOriginalEditState(){
    //Deep Copy
    window._editOriginal = _editFormState();
    // deep Copy the addresses snapshot we populate in openEditTab
    window._baselineAddressesJson = JSON.parse(JSON.stringify(window._currentAddressesJson || []));
  }
  
  
  
  // Remove blanks, drop dup new-note texts, and only delete by id
  function sanitizeNotesArray(notes) {
    const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const out = [];
    const seenNew = new Set();

    for (const n of Array.isArray(notes) ? notes : []) {
      const id = n.note_id ?? null;
      const deleted = !!n.deleted;
      const text = String(n.note_text ?? '');
      const tnorm = norm(text);

      if (deleted) {
        if (id !== null) out.push({ note_id: id, deleted: true });
        continue;
      }
      if (!tnorm) continue;

      if (id !== null) {
        out.push({ note_id: id, note_text: text });
      } else {
        if (seenNew.has(tnorm)) continue;
        seenNew.add(tnorm);
        out.push({ note_id: null, note_text: text });
      }
    }
    return out;
  }
  
  // Sanitize for payload: {address_id?, address_line_1, is_primary?, deleted?}
  function sanitizeAddressesArray(addresses) {
    const out = [];
    const norm = s => String(s || '').trim();

    // Keep exactly one primary in the outgoing “after” set (UI guarantees it, but be defensive)
    let sawPrimary = false;

    for (const a of Array.isArray(addresses) ? addresses : []) {
      const id = a.address_id ?? null;
      const del = !!a.deleted;
      const line = norm(a.address_line_1);

      if (del) {
        if (id !== null) out.push({ address_id: id, deleted: true });
        continue;
      }

      if (!line) continue;

      let isPrimary = !!a.is_primary;
      if (isPrimary && sawPrimary) isPrimary = false; // collapse extras
      if (isPrimary) sawPrimary = true;

      if (id !== null) {
        out.push({ address_id: id, address_line_1: line, is_primary: isPrimary });
      } else {
        out.push({ address_id: null, address_line_1: line, is_primary: isPrimary });
      }
    }
    return out;
  }

      function updateAddressesTextareaFromArray(arr = []) {
        const el = document.getElementById('edit_primaryAddress');
        if (!el) return;
        const compiled = formatAddressesForTextarea(Array.isArray(arr) ? arr : []);
        el.value = compiled;
        el.dataset.empty = compiled.trim() ? '0' : '1';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function formatAddressesForTextarea(addressesArr = []) {
        const safe = Array.isArray(addressesArr) ? addressesArr.slice() : [];
    
        // primary first → newest (by last_mod/create ts) → highest id
        safe.sort((a, b) => {
          if (!!b.is_primary !== !!a.is_primary) return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
          const at = a.last_mod_ts || a.create_ts;
          const bt = b.last_mod_ts || b.create_ts;
          const aT = at ? new Date(at).getTime() : 0;
          const bT = bt ? new Date(bt).getTime() : 0;
          if (bT !== aT) return bT - aT;
          return (b.address_id ?? 0) - (a.address_id ?? 0);
        });
    
      return safe
        .filter(a => !a.deleted)
        .map(a => {
          const id  = a.address_id != null ? `#${a.address_id}` : '(new)';
          const who = (a.last_mod_user_id || a.create_user_id) ? ` ${a.last_mod_user_id || a.create_user_id}` : '';
          const ts  = a.last_mod_ts || a.create_ts;
          const when = ts ? `[${fmtTs(ts)}]` : '';
          const star = a.is_primary ? '★' : '';
          const line = a.address_line_1 || '';
          // Match your notes style: [time] by who: text
          return `${when}${who}: ${star}${line}${star}`.trim();
        })
        .join('\n');
    }
  
  
// --- DIFF + AUDIT HELPERS (single source of truth) ---

// Normalize a scalar field for comparison/printing
function _n(v) {
    return String(v ?? '').trim();
  }
  
  
    // Build ONE system audit line for changed fields + addresses
    function buildSystemAuditNote(beforeFields={}, afterFields={}, addrLines=[]) {
        const fieldPieces = diffFields(beforeFields, afterFields);
        const pieces = [...fieldPieces, ...addrLines];
        if (!pieces.length) return '';
        return pieces.join(' | ');
    }
    
  
  // Helper: recognize a system note object
  function isSystemNote(n) {
    const t = String(n?.note_type_cd || '').toLowerCase();
    return t === 'system';
  }
  

// === Change tracking helpers ===
function _norm(s){ return String(s ?? '').replace(/\s+/g,' ').trim(); }

function diffFields(before={}, after={}, opts={}){
    const labels = {
      firstName:'First Name', lastName:'Last Name', company:'Company',
      phone:'Phone', email:'Email', /* primaryAddress intentionally ignored */
      status:'Status', source:'Source', bcg:'BCG'
    };
    const ignore = new Set(['primaryAddress', ...(opts?.ignore||[])]);
    const out = [];
    const norm = s => String(s ?? '').replace(/\s+/g,' ').trim();
  
    for (const k of Object.keys(labels)){
      if (ignore.has(k)) continue;
      const b = norm(before[k]);
      const a = norm(after[k]);
      if (b !== a) {
        const from = b || '∅';
        const to   = a || '∅';
        out.push(`${labels[k]}: "${from}" → "${to}"`);
      }
    }
    return out;
  }
  

function _norm(s){ return String(s ?? '').replace(/\s+/g,' ').trim(); }

function fmtAddrLine(a={}){
  const parts = [
    a.address_line_1, a.address_line_2,
    [a.city, a.state].filter(Boolean).join(', '),
    a.zip
  ].map(_norm).filter(Boolean);
  return parts.join(' | ');
}

function addrKey(a){
  // Prefer stable id; otherwise use a composite fingerprint
  const id = String(a?.address_id ?? '').trim();
  if (id) return `id:${id}`;
  return 'k:' + [a.address_line_1, a.city, a.state, a.zip].map(_norm).join('|').toLowerCase();
}

  function diffAddressesDetailed(beforeArr=[], afterArr=[]){
    const alive = x => x && !x.deleted;
    const B = (beforeArr||[]).filter(alive);
    const A = (afterArr||[]).filter(alive);
  
    const bMap = new Map(B.map(x => [addrKey(x), x]));
    const aMap = new Map(A.map(x => [addrKey(x), x]));
  
    const added=[], removed=[], modified=[];
  
    // Added/modified
    for (const [k, a] of aMap){
      const b = bMap.get(k);
      if (!b) { added.push(a); continue; }
      const changes=[];
      for (const f of ['address_line_1','address_line_2','city','state','zip']){
        if (_norm(b[f]) !== _norm(a[f])) {
          changes.push(`${f.replace(/_/g,' ')}: "${_norm(b[f])||'∅'}" → "${_norm(a[f])||'∅'}"`);
        }
      }
      if (changes.length) modified.push({before:b, after:a, changes});
    }
    // Removed
    for (const [k, b] of bMap){
      if (!aMap.has(k)) removed.push(b);
    }
  
    // Primary change (by flag)
    const pickPrimary = arr => arr.find(z => z.is_primary && !z.deleted) || null;
    const pB = pickPrimary(B);
    const pA = pickPrimary(A);
    const primaryChanged = (_norm(fmtAddrLine(pB||{})) !== _norm(fmtAddrLine(pA||{})));
  
    const lines=[];
    if (primaryChanged){
      lines.push(`Primary address: "${pB ? fmtAddrLine(pB) : '∅'}" → "${pA ? fmtAddrLine(pA) : '∅'}"`);
    }
    if (added.length){
      lines.push(`Added (${added.length}): ${added.slice(0,3).map(fmtAddrLine).join(' ; ')}${added.length>3?' …':''}`);
    }
    if (removed.length){
      lines.push(`Removed (${removed.length}): ${removed.slice(0,3).map(fmtAddrLine).join(' ; ')}${removed.length>3?' …':''}`);
    }
    for (const m of modified.slice(0,3)){
      lines.push(`Edited: ${fmtAddrLine(m.after)} [${m.changes.join(' | ')}]`);
    }
    if (modified.length>3) lines.push(`Edited (+${modified.length-3} more)`);
  
    return lines;
  }
  

  async function submitEditSubscriber(){
    const get = id => document.getElementById(id);
    const email = (get('edit_email')?.value || '').trim();
    if (email && typeof validateEmail === 'function' && !validateEmail(email)) {
      return alertModal('Please enter a valid email address.');
    }
  
    const subscriberId = get('edit_subscriber_id')?.value;
    if (!subscriberId) return alertModal('Missing subscriber_id for update.');

    const modUser =
      (window.currentUser && String(window.currentUser)) ||
      (typeof userEmail !== 'undefined' && String(userEmail)) ||
      'web';
  
    const useJson = Array.isArray(window._editNotes) && window._editNotesDirty;
    // --- Build payload (clean, no dupes) ---
    const payload = {
        firstName:      document.getElementById('edit_firstName').value,
        lastName:       document.getElementById('edit_lastName').value,
        company:        document.getElementById('edit_company').value,
        phone:          document.getElementById('edit_phone').value,
        email,
        primaryAddress: document.getElementById('edit_primaryAddress').value,
        status:         document.getElementById('edit_status').value,
        source:         document.getElementById('edit_source').value,
        bcg:            document.getElementById('edit_bcg').value,
        modUser
    };
    
    if (useJson) payload.notesJson = sanitizeNotesArray(window._editNotes);

    // NEW: send addresses when saved in this session
    const useAddr = Array.isArray(window._editAddresses) && window._editAddressesDirty;
    if (useAddr) {
      payload.addressesJson = sanitizeAddressesArray(window._editAddresses);
      delete payload.primaryAddress; // ← ignore the textarea when map is present
    }
    
    // Note detected changes:
    // --- Merge manual notes (if edited) + add system auto-note ---
    (() => {
        const out = [];
  
        // 1) Manual notes from modal → user
        if (Array.isArray(window._editNotes) && window._editNotesDirty) {
          const manual = sanitizeNotesArray(window._editNotes).map(n => ({
            ...n,
            note_type_cd: (n.note_type_cd && String(n.note_type_cd).toLowerCase() === 'system') ? 'system' : 'user'
          }));
          out.push(...manual);
        }
  
        // 2) Build auto audit (system) if there were changes
        const before = window._editOriginal || {};
        const after  = {
          firstName: payload.firstName,
          lastName:  payload.lastName,
          company:   payload.company,
          phone:     payload.phone,
          email:     payload.email,
          status:    payload.status,
          source:    payload.source,
          bcg:       payload.bcg
        };
  
        const fieldChanges = diffFields(before, after); // your helper
        const addrLines = (Array.isArray(window._baselineAddressesJson) && Array.isArray(window._currentAddressesJson))
          ? diffAddressesDetailed(window._baselineAddressesJson, window._currentAddressesJson)
          : [];
  
        const pieces = [...fieldChanges, ...addrLines];
  
        if (pieces.length) {
          const stamp = new Date().toISOString();
          const who   = (window.currentUser || (typeof userEmail !== 'undefined' && userEmail) || 'web');
          const txt   =  pieces.join(' | ');  // `Changed by ${who} @ ${stamp}\n` + / no need, these are audited on db
          out.push({ note_id: null, note_text: txt, note_type_cd: 'system' });
        }
  
        if (out.length) payload.notesJson = out;
      })();
  

    const btn = document.getElementById('editSaveBtn');
    const oldTxt = btn?.textContent;
    if (btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  
    try {
      const r = await fetch(`/evotechmail/api/subscribers/by-id/${encodeURIComponent(subscriberId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const ct = r.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await r.json() : await r.text();
      if (!r.ok) throw new Error(body?.error || (typeof body==='string' ? body : 'Update failed'));
  
      await alertModal(`Subscriber #${subscriberId} updated successfully.`, { title:'Saved' });
      closeEditInline();
  
      // Refresh fresh data + keep current query
      await loadFetchAll();
      if (window.qEl) qEl.dispatchEvent(new Event('input'));
    } catch (e){
      alertModal('Error updating subscriber: ' + (e?.message || String(e)));
    } finally {
      if (btn){ btn.disabled = false; btn.textContent = oldTxt; }
    }
  }
  
// Wire EDIT clicks:

  // Buttons in the Edit pane
  document.getElementById('editBackBtn')?.addEventListener('click', e => { e.preventDefault(); closeEditInline(); });
  document.getElementById('editCancelBtn')?.addEventListener('click', e => { e.preventDefault(); closeEditInline(); });
  document.getElementById('editSaveBtn')?.addEventListener('click', e => { e.preventDefault(); submitEditSubscriber(); });
  
  // Inline editors (no dialogs) textareas
  document.getElementById('edit_notes')?.addEventListener('click', (e) => {
    e.preventDefault();
    openNotesInline();
  });
  document.getElementById('edit_primaryAddress')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAddressesInline();
  });


// Robust one-liner (tabs/newlines collapse)
function to_one_line(s){
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  
  // Timestamp → short readable label
  function fmtTs(ts){
    try {
      const d = new Date(ts);
      if (!isFinite(d)) return String(ts);
      // e.g., "Aug 29, 2025, 2:41 PM"
      return d.toLocaleString();
    } catch {
      return String(ts);
    }
  }
  
  // Compile notes back into the legacy textarea with "[time] by who: text"
  function updateNotesTextareaFromArray(arr = []){
    const el = document.getElementById('edit_notes');
    if (!el) return;
  
    const compiled = formatNotesForTextarea(Array.isArray(arr) ? arr : []);
    el.value = compiled;
    el.dataset.empty = compiled.trim() ? '0' : '1';
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }
  
  // Format helper: `[time] by who: text` per line, newest first
  function formatNotesForTextarea(notesArr = []){
    const safe = Array.isArray(notesArr) ? notesArr.slice() : [];
  
    // newest: last_mod/create → then id desc
    safe.sort((a, b) => {
      const at = a.last_mod_ts || a.create_ts || a.note_ts;
      const bt = b.last_mod_ts || b.create_ts || b.note_ts;
      const aT = at ? new Date(at).getTime() : 0;
      const bT = bt ? new Date(bt).getTime() : 0;
      if (bT !== aT) return bT - aT;
      return (b.note_id ?? 0) - (a.note_id ?? 0);
    });
  
    return safe
      .filter(n => !n.deleted)
      .map(n => {
        const ts  = n.last_mod_ts || n.create_ts || n.note_ts;
        const who = n.last_mod_user_id || n.create_user_id || n.note_user_id || '';
        const when = ts ? `[${fmtTs(ts)}]` : '';
        const head = `${when}${who ? ` by ${who}:` : ':'}`;
        return `${head} ${n.note_text || ''}`.trim();
      })
      .join('\n');
  }

/* ---------- NOTES: bottom sheet / right drawer ---------- */

function openNotesInline(){
  const legacyEl = document.getElementById('edit_notes');

  const modUser =
    (window.currentUser && String(window.currentUser)) ||
    (typeof userEmail !== 'undefined' && String(userEmail)) ||
    'web';

  // Baseline when opening editor (used to infer deletions)
  const baselineRaw = Array.isArray(window._currentNotesJson)
    ? JSON.parse(JSON.stringify(window._currentNotesJson))
    : (
        legacyEl && legacyEl.value.trim()
          ? legacyEl.value.split(/\r?\n/).filter(Boolean).map(t => ({
              note_id: null,
              note_text: t.trim(),
              note_type_cd: 'user',
              create_user_id: modUser,
              create_ts: new Date().toISOString(),
              last_mod_user_id: modUser,
              last_mod_ts: new Date().toISOString()
            }))
          : []
      );

  // Normalize & keep audit fields so we can render labels
  let list = baselineRaw.map(n => ({
    note_id: n.note_id ?? null,
    note_text: String(n.note_text || '').trim(),
    note_type_cd: (n.note_type_cd || 'user'),
    note_user_id: n.note_user_id || '',               // optional legacy
    note_ts: n.note_ts || null,                       // optional legacy
    create_user_id: n.create_user_id || '',
    create_ts: n.create_ts || null,
    last_mod_user_id: n.last_mod_user_id || '',
    last_mod_ts: n.last_mod_ts || null
  }));

  const isTmp = v => typeof v === 'string' && v.startsWith('tmp_');
  const mkTmp = () => 'tmp_' + Math.random().toString(36).slice(2);

  const rowHTML = (n) => {
    const isSystem = String(n.note_type_cd||'').toLowerCase() === 'system';
    const ts  = n.last_mod_ts || n.create_ts || n.note_ts;
    const who = n.last_mod_user_id || n.create_user_id || n.note_user_id || '';
    const whenStr = ts ? `[${fmtTs(ts)}]` : '';
    const label = `${whenStr}${who ? ` by ${who}:` : ''}`;

    return `
      <div class="note-row" data-id="${n.note_id ?? ''}" data-type="${n.note_type_cd || 'user'}"
           style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; width:100%;">
        <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
          <div class="note-meta" style="font-size:12px; color:#6b7280; line-height:1.2;">
            ${label}
          </div>
          <textarea class="note-input" rows="3"
            style="flex:1; min-height:84px; border:1px solid #d1d5db; border-radius:10px; padding:8px 10px; font-size:14px; resize:vertical;"
            placeholder="${isSystem ? 'System note' : 'Write a note…'}" ${isSystem ? 'readonly' : ''}>${(n.note_text||'')}</textarea>
        </div>
        <button type="button" class="btn icon-only note-del" title="Delete" aria-label="Delete"
          ${isSystem ? 'disabled aria-disabled="true" style="opacity:.45; cursor:not-allowed;"' : ''}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" ${isSystem ? 'style="opacity:.45"' : ''}>
            <path fill="currentColor" d="M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-3h6l1 2H8l1-2z"/>
          </svg>
        </button>
      </div>
    `;
  };

  const bodyHTML = `
    <div id="notesEditor">
      ${list.length ? list.map(rowHTML).join('') : `<div class="muted" style="margin-bottom:8px;">No notes yet.</div>`}
    </div>
  `;

  const footerHTML = `
    <div class="inline-controls" style="display:flex; gap:8px; justify-content:flex-end;">
      <button type="button" class="btn btn--sm" id="addNoteBtn">+ Add note</button>
      <button type="button" class="btn btn--sm btn--primary" id="saveNotesBtn">Save</button>
      <button type="button" class="btn btn--sm" id="backNotesBtn">Back</button>
    </div>
  `;

  openSheet({
    title: 'Notes',
    bodyHTML,
    footerHTML,
    onOpen(){
      const host = document.getElementById('notesEditor');

      // Delete (system notes have disabled delete)
      host.addEventListener('click', (e)=>{
        const delBtn = e.target.closest && e.target.closest('.note-del');
        if (!delBtn || delBtn.disabled) return;
        e.stopPropagation();
        const rowEl = e.target.closest('.note-row');
        if (!rowEl) return;
        rowEl.remove();
      });

      // Add new (top) → user note, with fresh audit label data
      document.getElementById('addNoteBtn')?.addEventListener('click', (e)=>{
        e.stopPropagation();
        const nowIso = new Date().toISOString();
        const n = {
          note_id: mkTmp(),
          note_text: '',
          note_type_cd: 'user',
          create_user_id: modUser,
          create_ts: nowIso,
          last_mod_user_id: modUser,
          last_mod_ts: nowIso
        };
        host.insertAdjacentHTML('afterbegin', rowHTML(n));
        host.querySelector('.note-row .note-input')?.focus();
      });

      document.getElementById('backNotesBtn')?.addEventListener('click', ()=> closeSheet());

      // SAVE → after set (+ deletions), enrich with audit, update textarea
      document.getElementById('saveNotesBtn')?.addEventListener('click', (e)=>{
        e.stopPropagation();

        const rows = Array.from(host.querySelectorAll('.note-row'));
        const baseline = baselineRaw; // alias for clarity
        const baseById = new Map(
          baseline.filter(b => b.note_id != null).map(b => [String(b.note_id), b])
        );
        const nowIso = new Date().toISOString();

        // After (no deletes) → keep type, text; enrich audit fields
        let afterRich = rows.map(rowEl => {
          const rawId = rowEl.getAttribute('data-id') || null;
          const note_id = (rawId && !isTmp(rawId)) ? rawId : null;
          const note_type_cd = (rowEl.getAttribute('data-type') || 'user').toLowerCase();
          const isSystem = note_type_cd === 'system';
          const txt = (rowEl.querySelector('.note-input')?.value || '').trim();

          const base = note_id != null ? baseById.get(String(note_id)) : null;
          const prevText = base ? String(base.note_text || '').trim() : '';
          const changed  = isSystem ? false : (to_one_line(txt) !== to_one_line(prevText));

          return {
            note_id,
            note_text: isSystem ? (base?.note_text || txt) : txt,
            note_type_cd,
            // audit:
            create_user_id:  base?.create_user_id  || (note_id ? (base?.last_mod_user_id || modUser) : modUser),
            create_ts:       base?.create_ts       || nowIso,
            last_mod_user_id: changed ? modUser : (base?.last_mod_user_id || base?.create_user_id || modUser),
            last_mod_ts:      changed ? nowIso   : (base?.last_mod_ts || base?.create_ts || nowIso)
          };
        });

        // Keep system notes even if blank; drop blank user notes
        afterRich = afterRich.filter(n => n.note_type_cd === 'system' || n.note_text);

        // Deletions: any baseline non-system note_id not present now
        const afterIds = new Set(afterRich.map(a => a.note_id).filter(v => v != null).map(String));
        const deletes = [];
        baseline.forEach(b => {
          const id = b.note_id;
          const isSystem = String(b.note_type_cd||'').toLowerCase() === 'system';
          if (id != null && !afterIds.has(String(id)) && !isSystem){
            deletes.push({ note_id: id, deleted: true });
          }
        });

        // Build payload (updates + inserts + deletes)
        const updates = afterRich.filter(n => n.note_id != null).map(n => ({
          note_id: n.note_id,
          note_text: n.note_text,
          note_type_cd: n.note_type_cd,
          last_mod_user_id: n.last_mod_user_id,
          last_mod_ts: n.last_mod_ts
        }));
        const inserts = afterRich.filter(n => n.note_id == null).map(n => ({
          note_id: null,
          note_text: n.note_text,
          note_type_cd: n.note_type_cd,
          create_user_id: n.create_user_id,
          create_ts: n.create_ts,
          last_mod_user_id: n.last_mod_user_id,
          last_mod_ts: n.last_mod_ts
        }));

        // Expose arrays for submitEditSubscriber()
        window._currentNotesJson = afterRich;                                  // for reopen/textarea format
        window._editNotes        = sanitizeNotesArray([...updates, ...inserts, ...deletes]);
        window._editNotesDirty   = true;

        // Update legacy textarea with "[time] by user: text" lines
        updateNotesTextareaFromArray(afterRich);

        closeSheet();
      });
    }
  });
}





function toOneLine(s){
    return String(s || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  



/* ---------- ADDRESSES: bottom sheet / right drawer ---------- */
function openAddressesInline(){
    const roField = document.getElementById('edit_primaryAddress');
  
    const modUser =
      (window.currentUser && String(window.currentUser)) ||
      (typeof userEmail !== 'undefined' && String(userEmail)) ||
      'web';
  
    // Baseline snapshot when the editor opens (used to compute deletes)
    const baseline = Array.isArray(window._currentAddressesJson)
      ? JSON.parse(JSON.stringify(window._currentAddressesJson))
      : [];
  
    // Normalize to free-style line shape + keep audit fields
    let list = baseline.map(a => ({
        address_id: a.address_id ?? null,
        address_line_1: String(a.address_line_1 || a.address_line || '').trim(),
        is_primary: !!a.is_primary,
        create_user_id: a.create_user_id || '',
        create_ts: a.create_ts || null,
        last_mod_user_id: a.last_mod_user_id || '',
        last_mod_ts: a.last_mod_ts || null
    }));
    
    // Seed from legacy primary if no items exist (with audit fields)
    if (!list.length && roField && roField.value.trim()){
        const nowIso = new Date().toISOString();
        list = [{
        address_id: null,
        address_line_1: roField.value.trim(),
        is_primary: true,
        create_user_id: (window.currentUser || 'web'),
        create_ts: nowIso,
        last_mod_user_id: (window.currentUser || 'web'),
        last_mod_ts: nowIso
        }];
    }
  
    // Ensure exactly one primary
    if (list.length && !list.some(a => a.is_primary)) list[0].is_primary = true;
  
    const isTmp = v => typeof v === 'string' && v.startsWith('tmp_');
    const mkTmp = () => 'tmp_' + Math.random().toString(36).slice(2);
  
    const rowHTML = (a) => {
        const ts  = a.last_mod_ts || a.create_ts;
        const who = a.last_mod_user_id || a.create_user_id || '';
        const whenStr = ts
          ? `[${(typeof fmtTs === 'function' ? fmtTs(ts) : new Date(ts).toLocaleString())}]`
          : '';
        const label = `${whenStr}${who ? ` by ${who}:` : ''}`;
      
        return `
          <div class="addr-row" data-id="${a.address_id ?? ''}"
               style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px;">
            <label style="display:inline-flex; align-items:center; gap:6px; margin-top:6px;">
              <input type="radio" name="primary_addr" ${a.is_primary ? 'checked' : ''}/>
              <span class="muted" style="font-size:12px;">Primary</span>
            </label>
      
            <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
              <div class="addr-meta" style="font-size:12px; color:#6b7280; line-height:1.2;">
                ${label}
              </div>
              <textarea class="addr-input" rows="4"
                style="flex:1; min-height:120px; border:1px solid #d1d5db; border-radius:10px; padding:10px 12px; font-size:14px; resize:vertical;"
                placeholder="Enter full address…">${(a.address_line_1 || '')}</textarea>
            </div>
      
            <button type="button" class="btn icon-only addr-del" title="Delete" aria-label="Delete">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M6 7h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zm3-3h6l1 2H8l1-2z"/>
              </svg>
            </button>
          </div>
        `;
      };
      
  
    const bodyHTML = `
      <div id="addrEditor">
        ${list.length ? list.map(rowHTML).join('') : `<div class="muted" style="margin-bottom:8px;">No addresses yet.</div>`}
      </div>
    `;
  
    const footerHTML = `
      <div class="inline-controls" style="display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn btn--sm" id="addAddrBtn">+ Add address</button>
        <button type="button" class="btn btn--sm btn--primary" id="saveAddrsBtn">Save</button>
        <button type="button" class="btn btn--sm" id="backAddrsBtn">Back</button>
      </div>
    `;
  
    openSheet({
      title: 'Addresses',
      bodyHTML,
      footerHTML,
      onOpen(){
        const host = document.getElementById('addrEditor');
  
        // Enforce single primary (UI)
        host.addEventListener('change', (e)=>{
          if (e.target && e.target.name === 'primary_addr'){
            host.querySelectorAll('input[name="primary_addr"]').forEach(r => { if (r !== e.target) r.checked = false; });
          }
        });
  
        // Delete a row (stay open)
        host.addEventListener('click', (e)=>{
          const delBtn = e.target.closest && e.target.closest('.addr-del');
          if (!delBtn) return;
          e.stopPropagation();
          const rowEl = e.target.closest('.addr-row');
          if (!rowEl) return;
          rowEl.remove();
  
          // If none checked, set first remaining as primary
          const rows = host.querySelectorAll('.addr-row');
          if (rows.length && !host.querySelector('input[name="primary_addr"]:checked')){
            rows[0].querySelector('input[name="primary_addr"]').checked = true;
          }
        });
  
        // Add new (to top)
        document.getElementById('addAddrBtn')?.addEventListener('click', (e)=>{
          e.stopPropagation();
          const a = { address_id: mkTmp(), address_line_1:'', is_primary: (host.querySelectorAll('.addr-row').length === 0) };
          host.insertAdjacentHTML('afterbegin', rowHTML(a));
          host.querySelector('.addr-row .addr-input')?.focus();
          if (a.is_primary){
            host.querySelectorAll('input[name="primary_addr"]').forEach((r, i)=> r.checked = (i===0));
          }
        });
  
        document.getElementById('backAddrsBtn')?.addEventListener('click', ()=> closeSheet());
  
        // SAVE → read DOM, sanitize, compute inserts/updates/deletes
        document.getElementById('saveAddrsBtn')?.addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
  
          const rows = Array.from(host.querySelectorAll('.addr-row'));
  
          // Helper: normalize to string id key
          const idKey = v => (v == null ? null : String(v));
  
          // Read DOM → AFTER (no deletes)
          let after = rows.map(rowEl => {
            const rawId = rowEl.getAttribute('data-id') || null;
            const address_id = (rawId && !isTmp(rawId)) ? rawId : null; // treat tmp_* as new
            const txt = rowEl.querySelector('.addr-input')?.value || '';
            // Use your one-liner normalizer; if yours is named toOneLine, swap the call below
            const address_line_1 = (typeof to_one_line === 'function' ? to_one_line(txt) : (typeof toOneLine === 'function' ? toOneLine(txt) : String(txt).replace(/\s+/g,' ').trim()));
            const is_primary = !!rowEl.querySelector('input[name="primary_addr"]')?.checked;
            return { address_id, address_line_1, is_primary };
          }).filter(a => a.address_line_1);
  
          // Ensure one primary
            if (after.length && !after.some(a => a.is_primary)) after[0].is_primary = true;

            // --- Enrich AFTER with audit fields so formatter can show "[time] by ..."
            const normalize = (t) =>
            (typeof to_one_line === 'function' ? to_one_line(t)
            : typeof toOneLine   === 'function' ? toOneLine(t)
            : String(t || '').replace(/\s+/g,' ').trim());

            const nowIso   = new Date().toISOString();
            const baseById = new Map(baseline
            .filter(b => b.address_id != null)
            .map(b => [String(b.address_id), b]));

            const afterRich = after.map(a => {
            const base = a.address_id != null ? baseById.get(String(a.address_id)) : null;
            const baseLine = normalize(base?.address_line_1);
            const changed  = !base || baseLine !== a.address_line_1 || !!base.is_primary !== !!a.is_primary;

            return {
                ...a,
                create_user_id:  base?.create_user_id  || (a.address_id ? (base?.last_mod_user_id || 'web') : (window.currentUser || 'web')),
                create_ts:       base?.create_ts       || nowIso,
                last_mod_user_id: changed
                ? (window.currentUser || 'web')
                : (base?.last_mod_user_id || base?.create_user_id || (window.currentUser || 'web')),
                last_mod_ts:      changed
                ? nowIso
                : (base?.last_mod_ts || base?.create_ts || nowIso)
            };
            });

            // Compute diff vs baseline (updates/inserts/deletes) for payload
            const baseIds  = new Set(baseline.map(b => b.address_id).filter(v => v != null).map(String));
            const afterIds = new Set(after.map(a => a.address_id).filter(v => v != null).map(String));

            const updates = afterRich.filter(a => a.address_id != null).map(a => ({
            address_id: a.address_id,
            address_line_1: a.address_line_1,
            is_primary: !!a.is_primary,
            last_mod_user_id: a.last_mod_user_id,
            last_mod_ts: a.last_mod_ts
            }));

            const inserts = afterRich.filter(a => a.address_id == null).map(a => ({
            address_id: null,
            address_line_1: a.address_line_1,
            is_primary: !!a.is_primary,
            create_user_id: a.create_user_id,
            create_ts: a.create_ts,
            last_mod_user_id: a.last_mod_user_id,
            last_mod_ts: a.last_mod_ts
            }));

            const deletes = [];
            baseIds.forEach(id => { if (!afterIds.has(id)) deletes.push({ address_id: id, deleted: true }); });

            const draft = [...updates, ...inserts, ...deletes];

            // Persist for submitEditSubscriber()
            window._editAddresses = sanitizeAddressesArray(draft);
            window._editAddressesDirty = true;

            // Snapshot with audit fields so formatter can render [time] by :
            window._currentAddressesJson = afterRich;

            // Write compiled list (includes "[time] by : …")
            updateAddressesTextareaFromArray(afterRich);

            closeSheet();

        });
      }
    });
  }


////////////////////////// 
/////////// INBOX //////// 
//////////////////////////

function fmtTsSafe(ts){
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' });
  }
  

// Create/insert an inline pane under the clicked pill, hide others,
// and keep list visible (same behavior as your inline editors)
function insertInboxPaneUnder(hostPill, innerHTML){
    const list   = document.getElementById('list');
    const tiles  = document.querySelector('.tiles-grid');
    const search = document.querySelector('.search');
    if (!list || !hostPill) return;
  
    // Reuse or create the pane
    let pane = document.getElementById('inboxPane');
    if (!pane) {
      pane = document.createElement('section');
      pane.id = 'inboxPane';
      pane.className = 'card inline-details';
    }
    // IMPORTANT: set innerHTML directly (do NOT pick firstElementChild)
    pane.innerHTML = String(innerHTML || '');
  
    // Insert INSIDE #list, directly after the clicked pill
    if (hostPill.parentElement === list) {
      hostPill.insertAdjacentElement('afterend', pane);
    } else {
      list.appendChild(pane);
    }
  
    // Hide other pills, keep host visible
    list.querySelectorAll('.pill').forEach(p => {
      if (p === hostPill) p.classList.remove('is-hidden');
      else p.classList.add('is-hidden');
    });
  
    // Show list; hide tiles & search, but do NOT hide global back
    if (tiles)  tiles.hidden  = true;
    if (search) search.hidden = true;
    list.hidden = false;
  
    // Wire the inline "Back to matches" inside the pane
    pane.querySelector('[data-act="back"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      pane.remove();
      list.querySelectorAll('.pill').forEach(p => p.classList.remove('is-hidden'));
      if (tiles)  tiles.hidden  = false;
      if (search) search.hidden = false;
    });
  
    // Make sure it’s visible and scrolled into view
    pane.hidden = false;
    pane.style.display = 'block';
    requestAnimationFrame(() => pane.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  
  
  function hideInboxPaneRestore() {
    const pane   = document.getElementById('inboxPane');
    const list   = document.getElementById('list');
    const tiles  = document.querySelector('.tiles-grid');
    const search = document.querySelector('.search');
  
    if (pane) pane.hidden = true;
    if (tiles)  tiles.hidden  = false;
    if (search) search.hidden = false;
    Array.from(list.children).forEach(el => el.classList.remove('is-hidden'));

  }


  function buildInboxInline(items = [], payload) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const fix2 = v => (v == null || v === '') ? '' : Number(v).toFixed(2);
    const dims = r => {
      const L = fix2(r.length_in), W = fix2(r.width_in), H = fix2(r.height_in);
      return (L && W && H) ? `${L}×${W}×${H} in` : '—';
    };
    const wt = r => (r.weight_oz == null) ? '—' : `${fix2(r.weight_oz)} oz`;
    const fmtTsSafe = ts => { if (!ts) return ''; const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleString(); };
  
    const pmb  = payload?.row?.[0];
    const name = [payload?.row?.[1], payload?.row?.[2]].filter(Boolean).join(' ');
    const total = Array.isArray(items) ? items.length : 0;
  
    const rowsHtml = (items && items.length ? items : []).map(r => {
      const thumb = `
        <div class="thumb">
          ${
            r.preview_url
              ? `<button class="thumb has-img" type="button" data-fullimg="${esc(r.preview_url)}">
                   <img src="${esc(r.preview_url)}" alt="Mail ${esc(r.mail_id)}"
                        onerror="this.onerror=null; this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'No preview'}));">
                 </button>`
              : `<div class="ph">No preview</div>`
          }
        </div>`;
  
      const insertedStr = fmtTsSafe(r.insertion_time) || '—';
      const lastStr     = fmtTsSafe(r.last_status_ts);
      const byStr       = esc(r.create_user_id || '');
      const statusLower = String(r.last_status || '').toLowerCase();
  
      return `
        <div class="mail-row" data-id="${esc(r.mail_id)}" data-status="${esc(statusLower)}">
          ${thumb}
          <div class="mail-meta">
            <div class="hdr">
              <span class="badge">${esc(r.type || '')}</span>
              <span class="meta">#${esc(r.mail_id)}</span>
            </div>
            <div class="kvs">
              <div class="kv"><label>Dimensions</label><div>${esc(dims(r))}</div></div>
              <div class="kv"><label>Weight</label><div>${esc(wt(r))}</div></div>
              <div class="kv"><label>Status</label><div class="kv-status">${esc(r.last_status || '')}</div></div>
            </div>
            <div class="meta" style="margin-top:6px;">
              Inserted: ${insertedStr}${lastStr ? ` • Last status: ${lastStr}` : ''}${byStr ? ` • By: ${byStr}` : ''}
            </div>
            <div class="actions" data-mailid="${esc(r.mail_id)}">
              <select class="act-status" aria-label="Choose new status"><option value="">Change status…</option></select>
              <input class="act-comment" type="text" maxlength="500" placeholder="Add comment (optional)">
              <button class="apply-act" disabled>Apply</button>
              <span class="act-msg"></span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  
    const body = rowsHtml && rowsHtml.trim()
      ? rowsHtml
      : `<div class="meta">No mail found for this subscriber.</div>`;
  
    // encode payload for the View button
    const encoded = typeof encodeBase64 === 'function' ? encodeBase64(payload) : '';
  
    return `
      <div class="view-header">
        <button class="btn" data-act="back">← Back</button>
        <h2 class="view-title">
          Inbox • PMB ${esc(pmb ?? '')}${name ? ` — ${esc(name)}` : ''}
          <span id="inboxCount" class="count-badge" title="Visible items / total">${total}</span>
        </h2>
        <div class="view-actions">
          <!--<button class="btn btn--secondary" id="inboxViewBtn" data-encoded="${encoded}">View subscriber</button>-->
        </div>
      </div>
  
      <div class="inbox-filters">
        <input id="inboxFilterId" class="ctl" type="text" inputmode="numeric" placeholder="Filter by mail ID…">
        <select id="inboxFilterStatus" class="ctl"></select>
        <span class="meta" id="inboxFilterCount"></span>
      </div>
  
      <div class="view-grid" style="grid-template-columns:1fr;">
        ${body}
      </div>
    `;
  }
  
  


  // New: render inbox as a sibling section (not under #list)
  function showInboxPane(innerHTML){
    const main   = document.querySelector('main');
    const list   = document.getElementById('list');
    const tiles  = document.querySelector('.tiles-grid');
    const search = document.querySelector('.search');
  
    let pane = document.getElementById('inboxPane');
    if (!pane) {
      pane = document.createElement('section');
      pane.id = 'inboxPane';
      pane.className = 'card inline-details';
      if (list && list.parentElement) {
        list.insertAdjacentElement('afterend', pane);
      } else {
        main.appendChild(pane);
      }
    }
  
    // fill content
    pane.innerHTML = String(innerHTML || '');
  
    // SHOW pane (remove the boolean attribute; it overrides display)
    pane.removeAttribute('hidden');
    pane.style.removeProperty('display');
  
    // hide other surfaces
    if (tiles)  tiles.hidden  = true;
    if (search) search.hidden = true;
    if (list)   list.hidden   = true;
  
    // Back to matches
    pane.querySelector('[data-act="back"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      // re-hide pane
      pane.setAttribute('hidden', '');
      pane.style.display = 'none';
      // restore list surfaces
      if (list)   list.hidden   = false;
      if (tiles)  tiles.hidden  = false;
      if (search) search.hidden = false;
    }, { once:true });
  
    // NEW: View subscriber button (works even with #list hidden)
    const viewBtn = pane.querySelector('#inboxViewBtn');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const b64 = viewBtn.dataset.encoded || '';
        // hide inbox first
        pane.setAttribute('hidden','');
        pane.style.display = 'none';
        // open details using the non-inline viewer (does not need a pill)
        if (typeof openViewPanel === 'function') {
          openViewPanel(b64);
        } else if (typeof openViewFromBtn === 'function') {
          // fallback to inline if needed
          openViewFromBtn({ dataset:{ encoded:b64 }, closest:()=>document.querySelector('.pill:not(.is-hidden)') });
        }
      }, { once:true });
    }
  
    // bring it into view
    requestAnimationFrame(() => pane.scrollIntoView({ behavior:'smooth', block:'start' }));
  
    return pane;
  }
  
  

  async function wireInboxFilters(pane){
    if (!pane) return;
    const idEl = pane.querySelector('#inboxFilterId');
    const stEl = pane.querySelector('#inboxFilterStatus');
    const cnt  = pane.querySelector('#inboxFilterCount');
    const rows = [...pane.querySelectorAll('.mail-row')];
  
    // Populate the status dropdown with ALL known statuses
    const statuses = await loadStatuses();
    if (stEl){
      stEl.innerHTML =
        `<option value="">All statuses</option>` +
        statuses.map(s=>`<option value="${s.canon}">${s.code}</option>`).join('');
    }
  
    const apply = () => {
      const q  = (idEl?.value || '').trim();
      const st = (stEl?.value || '').trim();
      let shown = 0;
      rows.forEach(row => {
        const ok = (!q || String(row.dataset.id).includes(q))
                && (!st || row.dataset.status === st);
        row.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      if (cnt) cnt.textContent = `Showing ${shown} of ${rows.length}`;
      // If you have a header badge, refresh it too
      const badge = pane.querySelector('#inboxCount');
      if (badge){ badge.textContent = String(shown); badge.title = `${shown} of ${rows.length}`; }
    };
  
    let t; const deb = (fn, d=120) => (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), d); };
    idEl?.addEventListener('input', deb(apply));
    stEl?.addEventListener('change', apply);
    apply();
  }
  
  
  
  
  window.openInboxFromBtn = async function(btnEl){
    const details = document.getElementById('detailsPane');
    const list    = document.getElementById('list');
    const tiles   = document.querySelector('.tiles-grid');
    const search  = document.querySelector('.search');
    const addPane = document.getElementById('addPane'); // if present
  
    try {
      // ensure the right surfaces are visible/hidden
      if (addPane) addPane.hidden = true;
      if (details){ details.hidden = true; details.style.display = 'none'; }
      if (tiles)   tiles.hidden   = true;
      if (search)  search.hidden  = true;
      if (list)    list.hidden    = true;
  
      // payload + subscriber id
      const b64 = btnEl?.dataset?.encoded;
      if (!b64) return;
      const payload = decodeBase64(b64);
      const subscriberId = payload?.id;
      if (!subscriberId) return alertModal?.('Unable to determine subscriber id');
  
      // fetch inbox by subscriber id
      /*
       -- Get Inserted & Scanned Statuses
       /evotechmail/api/mailinbox/subscribers/:id/inbox?limit=100
       --Get all statuses
       /evotechmail/api/mailinbox/subscribers/:id/inbox?limit=100&statuses=all
       --Get Specific Statuses
       /evotechmail/api/mailinbox/subscribers/:id/inbox??statuses=forwarded,recycled,shredded
      */
      const url = `/evotechmail/api/mailinbox/subscribers/${encodeURIComponent(subscriberId)}/inbox?limit=150&statuses=all`;
      const r   = await fetch(url, { cache: 'no-store' });
      if (!r.ok) { console.error('inbox HTTP', r.status); return alertModal('Failed to load inbox'); }
      const { items = [] } = await r.json();
      //console.log('Inbox items:', items.length);
      //console.log(items);
      // render into sibling pane and show it
      const html = buildInboxInline(items, payload);
      const pane = showInboxPane(html);   // <-- key change
  
      // wire preview
      pane?.querySelectorAll('[data-fullimg]').forEach(btn => {
        btn.addEventListener('click', () => {
          const src = btn.getAttribute('data-fullimg');
          openSheet({
            title: 'Mail Image',
            bodyHTML: `<img src="${src}" alt="" style="max-width:100%;height:auto;display:block;margin:auto;">`,
            footerHTML: `<button class="btn" onclick="closeSheet()">Close</button>`
          });
        });
      });
  
      // actions + filters
      await wireInboxActions(pane);
      wireInboxFilters(pane);
  
    } catch (e) {
      console.error('openInboxFromBtn error:', e);
      alertModal('Error loading inbox');
    }
  };
  
  
  
  
  

  //Mail Inbox Helpers:
  let _statusesCache;  // [{id, code, desc}]
async function loadStatuses(){
  if (_statusesCache) return _statusesCache;
  const r = await fetch('/evotechmail/api/mailinbox/statuses', { cache:'no-store' });
  if (!r.ok) throw new Error('statuses load failed');
  const j = await r.json();
  // Limit to your six
  const allowed = new Set(['inserted','scanned','forwarded','recycled','shredded','pickedup']);
  _statusesCache = (j.statuses||[]).filter(s => allowed.has(String(s.code||'').toLowerCase()));
  // sort by your desired order
  const order = ['inserted','scanned','forwarded','recycled','shredded','pickedup'];
  _statusesCache.sort((a,b)=> order.indexOf(a.code.toLowerCase()) - order.indexOf(b.code.toLowerCase()));
  return _statusesCache;
}

async function wireInboxActions(pane){
    if (!pane) return;
  
    // helpers (scoped here; remove if you already have global versions)
    const canon = s => String(s||'').toLowerCase().replace(/\s+/g,'');
    const TERMINAL = new Set(['forwarded','recycled','shredded','pickedup']);
  
    const statuses = await loadStatuses(); // [{id, code, canon?}] -> if no .canon, we'll compute below
    const rows = [...pane.querySelectorAll('.mail-row')];
  
    rows.forEach(row => {
      const mailId   = row.dataset.id;
      const curCanon = canon(row.dataset.status || '');
      const sel = row.querySelector('.act-status');
      const inp = row.querySelector('.act-comment');
      const btn = row.querySelector('.apply-act');
      const msg = row.querySelector('.act-msg');
      if (!sel || sel.dataset.bound) return;
  
      // build menu with ALL statuses; disable Inserted + current
      sel.innerHTML = `<option value="">Change status…</option>` + statuses.map(s=>{
        const v = s.canon || canon(s.code);
        const dis = (v === 'inserted') || (v === curCanon);
        return `<option value="${v}" ${dis?'disabled':''}>${s.code}</option>`;
      }).join('');
  
      // if terminal -> lock the whole action bar
      if (TERMINAL.has(curCanon)) {
        sel.disabled = true;
        if (inp) inp.disabled = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Finalized'; }
        if (msg) msg.textContent = 'This item is finalized';
        sel.dataset.bound = '1';
        return;
      }
  
      const enableCheck = () => { btn.disabled = !sel.value; };
      sel.addEventListener('change', enableCheck);
      enableCheck();
  
      btn.addEventListener('click', async () => {
        if (!sel.value) return;
        btn.disabled = true; if (msg) msg.textContent = 'Saving…';
  
        try {
          const r = await fetch(`/evotechmail/api/mailinbox/mail/${encodeURIComponent(mailId)}/action`, {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ status_cd: sel.value, comment: inp.value || '' })
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
  
          // chosen (canonical & display label from statuses table)
          const chosenCanon = sel.value;
          const chosenObj   = statuses.find(s => (s.canon || canon(s.code)) === chosenCanon);
          const chosenLabel = chosenObj ? chosenObj.code : (chosenCanon[0].toUpperCase()+chosenCanon.slice(1));
  
          // update UI status text + dataset
          const kvStatus = row.querySelector('.kv-status');
          if (kvStatus) kvStatus.textContent = chosenLabel;
          row.dataset.status = chosenCanon;
  
          // update “Last status” ts if provided
          const metaLine = row.querySelector('.meta');
          if (metaLine && j.last_status_ts) {
            const ts = new Date(j.last_status_ts);
            const t  = isNaN(ts) ? '' : ts.toLocaleString();
            metaLine.innerHTML = metaLine.innerHTML.replace(/Last status:[^•<]+/,'Last status: '+t);
          }
  
          // if we landed on a terminal state → lock controls
          if (TERMINAL.has(chosenCanon)) {
            sel.disabled = true;
            if (inp) inp.disabled = true;
            if (btn) { btn.disabled = true; btn.textContent = 'Finalized'; }
            if (msg) msg.textContent = 'Saved';
            return;
          }
  
          // otherwise: disable chosen + Inserted; enable the rest; reset input
          [...sel.options].forEach(o=>{
            if (!o.value) return;
            o.disabled = (o.value === 'inserted') || (o.value === chosenCanon);
          });
          sel.value = '';
          if (inp) inp.value = '';
          if (msg) { msg.textContent = 'Saved'; setTimeout(()=> msg.textContent = '', 1200); }
        } catch(err){
          console.error(err);
          if (msg){ msg.textContent = 'Failed'; setTimeout(()=> msg.textContent = '', 1500); }
        } finally {
          // re-enable only if not terminal now
          if (!TERMINAL.has(row.dataset.status)) btn.disabled = false;
        }
      });
  
      sel.dataset.bound = '1';
    });
  
    // preview timeline wiring (unchanged)
    pane.querySelectorAll('[data-fullimg]').forEach(btn => {
        if (btn.dataset.wired) return;
        btn.addEventListener('click', async () => {
          const src = btn.getAttribute('data-fullimg') || '';
          const row = btn.closest('.mail-row');
      
          // derive the mail id (prefer dataset, fallback to URL)
          let mailId = row?.dataset?.id || '';
          if (!mailId && src) {
            const m = src.match(/\/mail(?:inbox)?\/(\d+)\/image/i);
            if (m) mailId = m[1];
          }
      
          let eventsHtml = '';
          try {
            const r = await fetch(`/evotechmail/api/mailinbox/mail/${encodeURIComponent(mailId)}/events`, { cache:'no-store' });
            if (r.ok) {
              const { events=[] } = await r.json();
              if (events.length){
                eventsHtml = `
                  <div style="margin-top:12px">
                    <div style="font-weight:700;margin-bottom:6px">History</div>
                    <ul style="list-style:none;padding:0;margin:0;display:grid;gap:8px">
                      ${events.map(e=>{
                        const t = new Date(e.create_ts);
                        const ts = isNaN(t) ? '' : t.toLocaleString();
                        const c = (e.comment||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
                        return `<li style="border:1px solid #eef2f7;border-radius:8px;padding:8px">
                          <div style="display:flex;gap:8px;align-items:center">
                            <span style="background:#e0f2f1;color:#0b8a8f;border-radius:999px;padding:2px 8px;font-weight:700;font-size:12px">${e.status_cd}</span>
                            <span style="color:#6b7280;font-size:12px">${ts}</span>
                            <span style="margin-left:auto;color:#6b7280;font-size:12px">${e.create_user_id||''}</span>
                          </div>
                          ${c ? `<div style="margin-top:6px">${c}</div>` : ''}
                        </li>`;
                      }).join('')}
                    </ul>
                  </div>`;
              }
            }
          } catch(_) {}
      
          openSheet({
            title: mailId ? `Mail #${mailId}` : 'Mail',
            bodyHTML: `<img src="${src}" alt="" style="max-width:100%;height:auto;display:block;margin:auto;">${eventsHtml}`,
            footerHTML: `<button class="btn" onclick="closeSheet()">Close</button>`
          });
        });
        btn.dataset.wired = '1';
      });
  }
  





// Normalize status codes consistently
function canonStatus(s){ return String(s||'').toLowerCase().replace(/\s+/g,''); }

// Preferred order; anything else sorts after these in alpha
const STATUS_ORDER = ['inserted','scanned','forwarded','recycled','shredded','pickedup'];
const TERMINAL_STATUSES = new Set(['forwarded','recycled','shredded','pickedup']);

_statusesCache = null;  // [{id, code, desc}]
async function loadStatuses(){
  if (_statusesCache) return _statusesCache;
  const r = await fetch('/evotechmail/api/mailinbox/statuses', { cache:'no-store' });
  if (!r.ok) throw new Error('Failed to load statuses');
  const j = await r.json();
  const list = (j.statuses||[]).map(s => ({
    id: s.id,
    code: s.code,
    canon: canonStatus(s.code)
  }));
  // sort by our preferred order, then alpha
  list.sort((a,b)=>{
    const ai = STATUS_ORDER.indexOf(a.canon);
    const bi = STATUS_ORDER.indexOf(b.canon);
    if (ai !== -1 || bi !== -1){
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return a.canon.localeCompare(b.canon);
  });
  _statusesCache = list;
  return _statusesCache;
}
