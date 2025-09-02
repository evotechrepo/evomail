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


////////////////////////////////////////////////////////////
///////////////////// compliance.js ////////////////////////
////////////////////////////////////////////////////////////

(function(){
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
    const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  
    // DOM
    const listEl    = $('#list');
    const qEl       = $('#q');
    const refreshEl = $('#refreshBtn');
    const loadedEl  = $('#loadedCount');
  
    // State
    const S = {
      q: '',
      status: '',          // raw status code filter (optional)
      compliant: 'all',    // 'all' | 'true' | 'false'
      limit: 50,
      offset: 0,
      items: [],
      busy: false,
      end: false,
    };
  
    let LOOKUPS = null;
    async function loadLookups(){
      if (LOOKUPS) return LOOKUPS;
      const r = await fetch('/evotechmail/api/lookups', { cache:'no-store' });
      LOOKUPS = await r.json();
      return LOOKUPS;
    }
    
    // Build filter UI inline with search (adds 2 selects)
    function ensureFilterControls(){
      const bar = $('.search');
      if (!bar || $('#compSel')) return;
  
      const compSel = document.createElement('select');
      compSel.id = 'compSel';
      compSel.innerHTML = `
        <option value="all">Compliant: All</option>
        <option value="true">Compliant: Yes</option>
        <option value="false">Compliant: No</option>
      `;
      compSel.className = 'btn'; // reuse your button style as a nice pill
      bar.appendChild(compSel);
  
      compSel.addEventListener('change', () => { S.compliant = compSel.value; reload(); });
    }
  
    // Fetch
    async function fetchPage(){
        if (S.busy || S.end) return [];
        S.busy = true;
        try {
          const p = new URLSearchParams({
            q: S.q || '',
            status: S.status || '',
            compliant: S.compliant || 'all',
            limit: String(S.limit),
            offset: String(S.offset)
          });
          const url = `/evotechmail/api/compliance/subscribers?${p.toString()}`;
          const r = await fetch(url, { cache: 'no-store' });
          if (!r.ok) {
            console.error('Compliance fetch failed:', r.status, url);
            // show a small inline note instead of throwing
            const list = document.getElementById('list');
            if (list && !list.children.length) {
              list.innerHTML = `<div class="muted" style="padding:12px">Failed to load (${r.status}). Try Refresh.</div>`;
            }
            return [];
          }
          const j = await r.json();
          const items = Array.isArray(j.items) ? j.items : [];
          S.offset += items.length;
          if (items.length < S.limit) S.end = true;
          return items;
        } catch (err) {
          console.error('Compliance fetch error:', err);
          return [];
        } finally {
          S.busy = false;
        }
      }
      
  
    // Render list
    function renderList(append=false){
      if (!append) listEl.innerHTML = '';
      if (!S.items.length) {
        listEl.innerHTML = '<div class="muted" style="padding:12px">No matches.</div>';
        updateCount();
        return;
      }
      const frag = document.createDocumentFragment();
      for (const s of S.items) frag.appendChild(renderPill(s));
      listEl.appendChild(frag);
      addLoadMoreIfNeeded();
      updateCount();
    }
  
    // Pill
    function renderPill(s){
        const el = document.createElement('div');
        el.className = 'pill';
        el.dataset.id = s.subscriber_id;              // so we can update the badge later
        const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || '(no name)';
        const co   = s.company ? `<span class="co">${esc(s.company)}</span>` : '';
        const badge = s.usps_compliant
          ? `<span class="badge-usps on" title="USPS compliant">USPS</span>`
          : `<span class="badge-usps off" title="Not USPS compliant">USPS</span>`;
      
        el.innerHTML = `
          <div class="left">
            <span class="pmb-badge">PMB ${esc(s.pmb)}</span>
            <span class="name">${esc(name)}</span>
            ${co}
            ${badge}
          </div>
          <div class="right-actions">
            <button class="icon-btn view-btn" title="Open details">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="#0b7285" d="M12 5C6.48 5 2.05 8.22.5 12c1.55 3.78 5.98 7 11.5 7s9.95-3.22 11.5-7C21.95 8.22 17.52 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>
              </svg>
            </button>
          </div>`;
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('.right-actions')) return;
          openDetailsDrawer(s);
        });
        el.querySelector('.view-btn').addEventListener('click', (ev) => { ev.stopPropagation(); openDetailsDrawer(s); });
        return el;
      }
      
  
 // === Drawer (create once) ===
let drawer;
function ensureDrawer(){
  if (drawer) return drawer;
  drawer = document.createElement('section');
  drawer.id = 'compDrawer';
  drawer.className = 'comp-drawer';
  drawer.innerHTML = `
    <div class="comp-panel" role="dialog" aria-modal="true" aria-labelledby="compTitle">
      <header class="comp-head">
        <div id="compTitle" class="title"></div>
        <button class="close-x" aria-label="Close">✕</button>
      </header>
      <div class="comp-body"></div>
      <footer class="comp-foot"></footer>
    </div>`;
  document.body.appendChild(drawer);

  drawer.addEventListener('click', (e)=>{ if (e.target === drawer) closeDrawer(); });
  drawer.querySelector('.close-x').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  return drawer;
}

function openDetailsDrawer(s){
  ensureDrawer();
  const body = drawer.querySelector('.comp-body');
  const title = drawer.querySelector('.title');

  title.innerHTML = `
    <strong>PMB ${esc(s.pmb)}</strong> — ${esc([s.first_name, s.last_name].filter(Boolean).join(' ') || '(no name)')}
    ${s.company ? `<span class="co">${esc(s.company)}</span>` : ''}`;

    // ensure a Back button on the far right
    const head = drawer.querySelector('.comp-head');
    let backBtn = head.querySelector('#backBtn');
    if (!backBtn){
    backBtn = document.createElement('button');
    backBtn.id = 'backBtn';
    backBtn.className = 'btn btn--primary--smm';
    backBtn.textContent = 'Back';

    // place it at the far right
    const closeX = head.querySelector('.close-x');
    if (closeX) closeX.style.display = 'none';      // hide old X so Back is right-most
    head.appendChild(backBtn);

    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeDrawer();                                // go "back" = close the drawer
        // optional: restore focus to last selected pill if you track it
        // lastPill?.focus();
    });
    }


  body.innerHTML = `
    <div class="vstack" style="gap:12px">
      <div class="row">
        <label class="toggle">
        <input id="compToggle" class="toggle-input" type="checkbox" ${s.usps_compliant ? 'checked' : ''}>
        <span class="toggle-track" aria-hidden="true"></span>
        <span class="toggle-text">USPS compliant</span>
        </label>

        <div class="status-stack" style="margin-left:auto">
        <span id="statusRead" class="chip">Status: —</span>
        <span id="bcgRead" class="chip chip--bcg">BCG: —</span>
        </div>

      </div>

      <div>
        <label class="lbl">Add compliance note</label>
          <textarea id="compNote" rows="3" placeholder="What changed, who verified, etc." class="ta-soft"></textarea>
        <div class="row">
            <button id="saveCompBtn" class="btn btn--primary btn--sm">Save</button>
            <span id="saveMsg" class="muted"></span>
        </div>
      </div>

      <div>
        <div class="lbl lbl-row">
          <span>Notes</span>
          <button id="refreshNotes" class="icon-btn icon-btn--sm" aria-label="Refresh notes" title="Refresh">
          <!-- refresh svg -->
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#0b8a8f" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.3 0 2.5.42 3.47 1.13L13 10h7V3l-2.35 3.35z"/>
          </svg>
          </button>
        </div>
        <ul id="notesList" class="notes"></ul>
      </div>

    </div>`;

    // Fill Status / BCG display labels
    (function(){
        const statusEl = drawer.querySelector('#statusRead');
        const bcgEl    = drawer.querySelector('#bcgRead');
    
        function applyLabels(L){
        const sCode  = (s.status || '').toString();
        const bCode  = (s.bcg_status || '').toString();
    
        const sLabel = (L?.statuses || []).find(x => (x.code||'').toLowerCase() === sCode.toLowerCase())?.label || sCode || 'Unknown';
        const bLabel = (L?.bcg      || []).find(x => (x.code||'').toLowerCase() === bCode.toLowerCase())?.label || bCode || 'Unknown';
    
        if (statusEl) statusEl.textContent = `Status: ${sLabel}`;
        if (bcgEl)    bcgEl.textContent    = `BCG: ${bLabel}`;
        }
    
        // set immediately with whatever is on window, then refine after async load
        applyLabels(window.LOOKUPS);
        if (typeof loadLookups === 'function') {
        loadLookups().then(applyLabels).catch(()=>applyLabels(window.LOOKUPS));
        }
    })();
  
  


  // wire save
  drawer.querySelector('#saveCompBtn').addEventListener('click', async ()=>{
    const next = drawer.querySelector('#compToggle').checked;
    const note = drawer.querySelector('#compNote').value.trim();
    const saveMsg = drawer.querySelector('#saveMsg');

    if (next !== !!s.usps_compliant && !note) {
      saveMsg.textContent = 'Please add a note when changing compliance.';
      setTimeout(()=> saveMsg.textContent = '', 1800);
      return;
    }

    try {
      drawer.querySelector('#saveCompBtn').disabled = true;
      saveMsg.textContent = 'Saving…';
      const r = await fetch(`/evotechmail/api/subscribers/${encodeURIComponent(s.subscriber_id)}/compliance`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ compliant: next, note })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
      s.usps_compliant = next;
      drawer.querySelector('#compNote').value = '';
      saveMsg.textContent = 'Saved';
      setTimeout(()=> saveMsg.textContent = '', 1200);
      // flip badge on the pill
      const badge = document.querySelector(`.pill[data-id="${s.subscriber_id}"] .badge-usps`);
      if (badge){ badge.classList.toggle('on', next); badge.classList.toggle('off', !next); }
    } catch(e){ console.error(e); saveMsg.textContent='Failed'; setTimeout(()=> saveMsg.textContent='',1500);
    } finally { drawer.querySelector('#saveCompBtn').disabled = false; }
    loadNotes(s.subscriber_id);
  });

  drawer.querySelector('#refreshNotes').addEventListener('click', () => loadNotes(s.subscriber_id));
  loadNotes(s.subscriber_id);

  drawer.classList.add('open');
}

function closeDrawer(){ drawer?.classList.remove('open'); }

  
    async function loadNotes(subscriberId){
      const ul = $('#notesList', drawer);
      if (!ul) return;
      ul.innerHTML = '<li class="muted">Loading…</li>';
      try {
        const r = await fetch(`/evotechmail/api/compliance/subscribers/${encodeURIComponent(subscriberId)}/notes`, { cache:'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { notes = [] } = await r.json();
        if (!notes.length) { ul.innerHTML = '<li class="muted">No notes yet.</li>'; return; }
        ul.innerHTML = notes.map(n => {
          const t = new Date(n.note_ts); const ts = isNaN(t) ? '' : t.toLocaleString();
          return `<li>
            <div class="note-row">
              <span class="badge">${esc(n.note_type_cd)}</span>
              <span class="meta">${ts}</span>
              <span class="meta" style="margin-left:auto">${esc(n.note_user_id||'')}</span>
            </div>
            <div class="note-text">${esc(n.note_text)}</div>
          </li>`;
        }).join('');
      } catch (e) {
        console.error(e);
        ul.innerHTML = '<li class="muted">Failed to load notes.</li>';
      }
    }
  
    // Controls
    refreshEl?.addEventListener('click', reload);
    qEl?.addEventListener('input', debounce(() => { S.q = qEl.value.trim(); reload(); }, 250));
  
    // Loading
    async function reload(){
      S.offset = 0; S.end = false; S.items = [];
      const page = await fetchPage();
      S.items.push(...page);
      renderList(false);
    }
  
    async function loadMore(){
      const page = await fetchPage();
      if (!page.length) return;
      S.items.push(...page);
      renderList(true);
    }
  
    function addLoadMoreIfNeeded(){
      // remove existing
      $$('.load-more').forEach(b => b.remove());
      if (S.end || !S.items.length) return;
      const btn = document.createElement('button');
      btn.className = 'btn load-more';
      btn.textContent = 'Load more';
      btn.addEventListener('click', loadMore);
      listEl.appendChild(btn);
    }
  
    function updateCount(){
      loadedEl.textContent = `${S.items.length}${S.end ? '' : '+'} loaded`;
    }
  
    function debounce(fn, ms=200){
      let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
    }
  
    // init
    ensureFilterControls();
    reload();
  })();
  


  

