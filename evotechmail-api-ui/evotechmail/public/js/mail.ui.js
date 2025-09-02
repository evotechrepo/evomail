

  // Helper to encode data as Base64
  function encodeBase64(data) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
    catch { return ''; }
  }


  // Helper: robust base64 → JSON decode
  function decodeBase64(b64) {
    try { return JSON.parse(decodeURIComponent(escape(atob(b64)))); }
    catch { return null; }
  }

/////////////////////////////////////////////////////////////
// EMAILS 1
/////////////////////////////////////////////////////////////

// Open Mail Utilities => reveal and switch to the Email tab
function openMailUtils() {
    const goToEmailTab = () => {
      // 1) Reveal the Email tab button if hidden
      const emailBtn = document.getElementById('emailTabButton');
      if (emailBtn) emailBtn.style.display = 'block';
  
      // 2) Switch to the Email tab using your tab switcher, if present
      if (typeof showTab === 'function') {
        showTab('emailTab');
      } else {
        // Fallback: naive toggling
        const tabs = ['searchTab', 'tabularSearchTab', 'addTab', 'editTab', 'emailTab'];
        tabs.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = (id === 'emailTab') ? 'block' : 'none';
        });
        // Optional: reflect active state on buttons if needed
        ['searchTabButton','tabularSearchButton','addTabButton','editTabButton','emailTabButton']
          .forEach(btnId => document.getElementById(btnId)?.classList.toggle('active', btnId === 'emailTabButton'));
      }
  
      // 3) Bring it into view (nice touch)
      document.getElementById('emailTab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  
  
  
    // If running as a GAS web app, verify admin first
    try {
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function (isAdmin) {
          if (isAdmin) {
            goToEmailTab();
          } else {
            // Your existing modal handler, if present
            alertModal('You do not have permission to access Email.');
          }
        }).isAdminUser();
        return;
      }
    } catch (_) { /* ignore and fall through */ }
  
    // Local/dev fallback: just open it
    goToEmailTab();
  }
  
  
  
  
  
  /////////////////////////////////////////////////////////////
  // EMAILS 2
  /////////////////////////////////////////////////////////////
  
  // cache from /mail/group-emails (partner_cd -> [emails])
  let group_emails_cache = {};          // { partner_cd: [emails...] }
  
  // tracks the most-recent set of emails auto-inserted from partner checkboxes
  let last_group_bcc_set = new Set();
  
  function parse_csv_emails(csv) {
    return new Set(
      (csv || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    );
  }
  function join_emails(set) {
    return Array.from(set).sort().join(', ');
  }
  
  // util: slug for element IDs
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g,'');
  
  // fetch all partners + emails once
  async function fetch_all_group_emails() {
    // try plain path first (server mounts both / and /api) :contentReference[oaicite:1]{index=1}
    const tryUrls = ['/evotechmail/api/mail/group-emails', '/api/mail/group-emails'];
    for (const url of tryUrls) {
      try {
        const r = await fetch(url);
        if (r.ok) { group_emails_cache = await r.json(); return; }
      } catch (_) {}
    }
    throw new Error('Failed to load group emails');
  }
  
  // render partner checkboxes dynamically
  function render_bcc_partner_checkboxes() {
    const box = document.getElementById('bccGroups');
    if (!box) return;
    box.innerHTML = ''; // reset
  
    // stable order
    const partners = Object.keys(group_emails_cache).sort((a,b)=>a.localeCompare(b));
    partners.forEach(cd => {
      const id = `include_${slugify(cd)}`;
      const label = document.createElement('label');
      label.setAttribute('for', id);
  
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id   = id;
      input.dataset.partner = cd;
  
      input.addEventListener('change', update_bcc_field);
  
      const txt = document.createTextNode(' ' + cd);
      label.appendChild(input);
      label.appendChild(txt);
      box.appendChild(label);
    });
  }
  
  // normalise list of emails
  function normalize_email_list(csv) {
    const set = new Set();
    (csv || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
      .forEach(e => set.add(e));
    return Array.from(set);
  }
  
  document.getElementById('email_bcc')?.addEventListener('input', () => {
    // do nothing here—manual text remains; the next checkbox change will recompute properly
    // (we intentionally don't touch last_group_bcc_set here)
  })
  
  // merge selected groups into BCC
  function update_bcc_field() {
    const bcc_el = document.getElementById('email_bcc');
  
    // current contents in the box
    const current_set = parse_csv_emails(bcc_el.value);
  
    // treat anything currently in the box, minus the previously auto-added group emails, as "manual"
    const manual_set = new Set([...current_set].filter(e => !last_group_bcc_set.has(e)));
  
    // gather emails for all *currently checked* partners
    const checked = Array.from(document.querySelectorAll('#bccGroups input[type="checkbox"]:checked'));
    const selected_emails = [];
    for (const cb of checked) {
      const cd = cb.dataset.partner;
      if (group_emails_cache[cd]) selected_emails.push(...group_emails_cache[cd]);
    }
    const selected_set = parse_csv_emails(selected_emails.join(','));
  
    // new BCC = manual (user-entered) + selected groups (auto)
    const final_set = new Set([...manual_set, ...selected_set]);
  
    // write back and update the "last group" memory so unchecking removes those
    bcc_el.value = join_emails(final_set);
    last_group_bcc_set = selected_set;
  }
  
  
  // boot
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await fetch_all_group_emails();
      render_bcc_partner_checkboxes();
    } catch (e) {
      console.error(e);
      alertModal('Could not load partner groups.');
    }
  
    // keep preview live
    document.getElementById('email_body')?.addEventListener('input', updateEmailPreview);
    document.getElementById('email_subject')?.addEventListener('input', updateEmailPreview);
    updateEmailPreview(); // initial draw
  });
  
  function updateEmailPreview() {
    const htmlContent = document.getElementById('email_body')?.value || '';
    // (Optional) show subject above preview body:
    const subject = document.getElementById('email_subject')?.value || '';
    document.getElementById('email_preview').innerHTML =
      (subject ? `<div style="font-weight:700;margin-bottom:6px;">Subject: ${subject}</div>` : '') +
      htmlContent;
  }
  
  
  async function sendEmail() {
    if (!validateEmailForm()) return;
  
    const to      = document.getElementById('email_to').value.trim();
    let   cc      = document.getElementById('email_cc').value.trim();
    let   bcc     = document.getElementById('email_bcc').value.trim();
    const subject = document.getElementById('email_subject').value.trim();
    const body    = document.getElementById('email_body').value.trim();
  
    /*
    // Keep your mandatory CC/BCC client-side too (server also enforces)
    const mandatoryCC = 'office_manager@evotechservice.com';
    if (!cc.includes(mandatoryCC)) cc = cc ? cc + ',' + mandatoryCC : mandatoryCC;
    ['h.zabin@evotechservice.com','k.alkofahi@evotechservice.com'].forEach(addr=>{
      if (!bcc.includes(addr)) bcc = bcc ? `${bcc},${addr}` : addr;
    });
    */
  
    try {
      showLoading("Sending Email(s)");
  
      const res = await fetch('/evotechmail/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, bcc, subject, html: body })
      });
  
      const ct = res.headers.get('content-type') || '';
  
      if (!res.ok) {
        let details = '';
        try {
          if (ct.includes('application/json')) {
            const j = await res.json();
            details = j?.error || j?.message || JSON.stringify(j);
          } else {
            details = await res.text();
          }
        } catch (_) {
          // ignore parse failures
        }
  
        const errId = res.headers.get('x-error-id');
        const hint =
          res.status === 401 ? ' (auth failed—check SMTP user/app password)' :
          res.status === 403 ? ' (forbidden—provider policy or auth issue)' :
          res.status === 429 ? ' (rate-limited—slow down / batch smaller)' :
          res.status >= 500 ? ' (server error—check server logs)' : '';
  
        const composed =
          `HTTP ${res.status} ${res.statusText}${hint}` +
          (errId ? ` [error-id: ${errId}]` : '') +
          (details ? ` — ${String(details).slice(0,500)}` : '');
  
        throw new Error(composed);
      }
  
      const j = ct.includes('application/json') ? await res.json() : {};
      alertModal(`Email sent${j.messageId ? ` (id: ${j.messageId})` : ''}.`);
      clearEmailForm();
    } catch (err) {
      console.error('sendEmail failed:', err);
      const msg = (err && err.message) ? err.message : String(err);
      hideLoading();
      alertModal(`Error sending email: ${msg}`);
    } finally {
      hideLoading();
    }
  }
  
  
  
  
  function validateEmailForm() {
    const to = document.getElementById('email_to').value.trim();
    const subject = document.getElementById('email_subject').value.trim();
    const body = document.getElementById('email_body').value.trim();
  
    if (!to) {
      alertModal('The "To" field is required.');
      return false;
    }
  
    if (!subject) {
      alertModal('The "Subject" field is required.');
      return false;
    }
  
    if (!body) {
      alertModal('The "Body" field is required.');
      return false;
    }
  
    return true;
  }
  
  
  // --- Date helpers ---
  function yyyy_mm_dd(d){ return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function parse_date_input(value){
    // robust parse for "YYYY-MM-DD"
    const [y,m,d] = (value || '').split('-').map(Number);
    return (y && m && d) ? new Date(y, m-1, d) : new Date();
  }
  function format_mmddyyyy(d){
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  function weekday_name(d){
    return d.toLocaleDateString(undefined, { weekday:'long' });
  }
  
  // --- Template builder (uses chosen date) ---
  function build_office_closure_template_for(d){
    const day  = weekday_name(d);
    const date = format_mmddyyyy(d);
  
    const subject = `Office Closure on ${day}, ${date}`;
    const html = `
  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.4; margin: 0; padding: 0;">
    <div><strong>Dear Subscriber,</strong></div><br>
    <div>Please be informed that our office will be closed on <strong>${day}, ${date}</strong>.</div><br>
    <div>During this time, we will not be able to respond to emails or phone calls, and all pick-up orders will be fulfilled on the next business day. We apologize for any inconvenience and appreciate your understanding.</div><br>
    <div>Our regular business hours will resume on <strong>${day}, ${date}</strong>.</div><br>
    <div>Thank you for your understanding and continued support.</div><br>
    <div>Best Regards,<br>
      Office Manager<br>
      Operations | Evotech US L.L.C</div><br>
    <div>
      Phone: +1 (571) 352-7339<br>
      Email: office_manager@evotechservice.com<br>
      Website: <a href="https://www.evotechservice.com">www.evotechservice.com</a><br>
      Address: 585 Grove St, Unit 145, Herndon, VA 20170
    </div><br>
    <div style="margin-top: 10px;">
      <img src="/evotechmail/assets/evo.png" alt="Logo" style="max-width: 220px; height: 70px; border: none;" />
    </div>
  </div>`;
    return { subject, html };
  }
  
  // --- Wire the checkbox + date input ---
  function apply_office_closure_template(){
    const date_el = document.getElementById('template_date');
    const d = parse_date_input(date_el?.value);
    const t = build_office_closure_template_for(d);
    document.getElementById('email_subject').value = t.subject;
    document.getElementById('email_body').value    = t.html;
    updateEmailPreview();
  }
  
  // ---- Registered Agent Service template ----
  function build_registered_agent_service_template_for(d) {
    const day  = weekday_name(d);
    const date = format_mmddyyyy(d);
  
    const subject = 'Enhance Your Business Efficiency with Our New Registered Agent Service';
  
    const html = `
  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.4; margin: 0; padding: 0;">
    <div><strong>Dear business owner subscriber,</strong></div><br>
  
    <div>At EvoTech US LLC, we’re committed to helping your business run smoothly. That’s why we’re excited to offer our new <strong>Registered Agent Service</strong>—a convenient solution to keep your business compliant with state requirements.</div><br>
  
    <div><strong>Here’s How It Works:</strong></div>
    <div>To take advantage of this new service, business accounts will need to switch to a <strong>yearly virtual mail subscription</strong>, which ensures seamless handling of your mail. Additionally, the Registered Agent Service is available for just <strong>$50/year</strong>, giving you a comprehensive solution to manage both your virtual mail and state compliance needs in one place.</div><br>
  
    <div><strong>What’s Included with Our Registered Agent Service?</strong></div>
    <ul style="margin-top: 5px; margin-bottom: 10px;">
      <li>Acting as your official point of contact with state authorities.</li>
      <li>Receiving and securely handling important legal and compliance documents.</li>
      <li>Providing peace of mind so you never miss a critical notice or deadline.</li>
    </ul>
  
    <div><strong>Why Make the Switch?</strong></div>
    <div>By combining your yearly virtual mail subscription with the Registered Agent Service, you’ll enjoy:</div>
    <ul style="margin-top: 5px; margin-bottom: 10px;">
      <li>Simplified business management with fewer providers to coordinate.</li>
      <li>Cost savings compared to separate services.</li>
      <li>Dependable service from a provider you already trust.</li>
    </ul>
  
    <div><strong>Ready to Get Started?</strong></div>
    <div>Simply reply to this email (<a href="mailto:registeredagentsupport@evotechservice.com">registeredagentsupport@evotechservice.com</a>), and we’ll guide you through the process of switching to a yearly plan and adding the Registered Agent Service to your account.</div><br>
  
    <div>Let us help you streamline your business operations and stay compliant effortlessly!</div><br>
  
    <div>Best Regards,<br>
    Office Manager<br>
    Operations | Evotech US L.L.C</div><br>
  
    <div>
      Phone: +1 (571) 352-7339<br>
      Email: office_manager@evotechservice.com<br>
      Website: <a href="https://www.evotechservice.com">www.evotechservice.com</a><br>
      Address: 585 Grove St, Unit 145, Herndon, VA 20170
    </div><br>
  
    <div style="margin-top: 10px;">
      <img src="/evotechmail/assets/evo.png" alt="Logo" style="max-width: 220px; height: 70px; border: none;" />
    </div>
  </div>`.trim();
  
    return { subject, html };
  }
  
  
  function apply_registered_agent_template() {
    const date_el = document.getElementById('template_date');
    const d = parse_date_input(date_el?.value);
    const t = build_registered_agent_service_template_for(d);
    document.getElementById('email_subject').value = t.subject;
    document.getElementById('email_body').value    = t.html;
    updateEmailPreview();
  }
  
  
  // Mutual exclusivity + field handling for the RA checkbox
  function toggleRegisteredAgentTemplate(){
    const ra = document.getElementById('useRegisteredAgentTemplate').checked;
    const date_el = document.getElementById('template_date');
  
    if (ra){
      // uncheck closure
      const ocEl = document.getElementById('useTemplateCheckbox');
      if (ocEl) ocEl.checked = false;
  
      if (date_el){
        date_el.disabled = false;
        if (!date_el.value) date_el.value = yyyy_mm_dd(new Date());
      }
  
      apply_registered_agent_template();
    } else {
      if (date_el) date_el.disabled = true;
  
      const oc = document.getElementById('useTemplateCheckbox')?.checked;
      if (!oc){
        document.getElementById('email_subject').value = '';
        document.getElementById('email_body').value    = '';
        updateEmailPreview();
      }
    }
  }
  
  
  
  // existing closure toggle — now exclusive with RA template
  function toggleTemplate(){
    const use = document.getElementById('useTemplateCheckbox').checked;
  
    // If Office Closure is selected, uncheck RA template
    const raEl = document.getElementById('useRegisteredAgentTemplate');
    if (use && raEl) raEl.checked = false;
  
    const date_el = document.getElementById('template_date');
    if (date_el){
      date_el.disabled = !use;
      if (use && !date_el.value){
        date_el.value = yyyy_mm_dd(new Date());
      }
    }
  
    if (use){
      apply_office_closure_template();
    } else {
      // Only clear if neither template is selected
      const ra = document.getElementById('useRegisteredAgentTemplate')?.checked;
      if (!ra) {
        document.getElementById('email_subject').value = '';
        document.getElementById('email_body').value    = '';
        updateEmailPreview?.();
      }
    }
  }
  
  
  document.addEventListener('DOMContentLoaded', () => {
    const cb  = document.getElementById('useTemplateCheckbox');
    const dt  = document.getElementById('template_date');
    const ra  = document.getElementById('useRegisteredAgentTemplate'); // NEW
  
    if (cb){
      cb.removeEventListener('change', toggleTemplate);
      cb.addEventListener('change', toggleTemplate);
    }
    if (dt){
      dt.removeEventListener('change', on_template_date_change);
      dt.addEventListener('change', on_template_date_change);
    }
    if (ra){   // NEW
      ra.removeEventListener('change', toggleRegisteredAgentTemplate);
      ra.addEventListener('change', toggleRegisteredAgentTemplate);
    }
  
    // keep live preview if user edits manually
    document.getElementById('email_body')?.addEventListener('input', updateEmailPreview);
    document.getElementById('email_subject')?.addEventListener('input', updateEmailPreview);
  });

  //TEST BLOCK
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('email_to').value = 'h_zabin@hotmail.com';
    document.getElementById('email_cc').value = 'h.zabin@evotechservice.com';
    document.getElementById('email_bcc').value = 'mailer@evotechservice.com';
  });
  
  function on_template_date_change() {
    const cb = document.getElementById('useTemplateCheckbox');
    if (cb && cb.checked) {
      apply_office_closure_template();
    }
  }
  
  // ===== Shared Sheet helpers (Lists + Logs) =====
(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  let wired = false;

  function wireOnce(){
    if (wired) return; wired = true;
    const sheet = $('#sheet'); if (!sheet) return;

    // backdrop click closes sheet
    sheet.addEventListener('click', (e)=>{
      if (!e.target.closest('.sheet__inner')) closeSheet();
    });
    // Esc closes sheet
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && !sheet.hidden) closeSheet();
    });
    // Back button
    $('#sheetBackBtn')?.addEventListener('click', ()=>{
      if (typeof window._sheetGoBack === 'function') window._sheetGoBack();
      else closeSheet();
    });
  }

  window.openSheet = ({title, bodyHTML, footerHTML=''})=>{
    wireOnce();
    $('#sheetTitle').textContent = title || '';
    $('#sheetBody').innerHTML = bodyHTML || '';
    $('#sheetFooter').innerHTML = footerHTML || '';
    $('#sheetBackBtn').hidden = false;   // always show Back on the sheet
    $('#sheet').hidden = false;
    document.documentElement.style.overflow = 'hidden';
  };

  window.closeSheet = ()=>{
    const s = document.getElementById('sheet');
    if (!s) return;
    s.hidden = true;
    document.documentElement.style.overflow = '';
  };
})();

 
/* ============================================================
   Email Lists -> inline sheet (desktop drawer / mobile sheet)
   Fully self-contained; no external helpers required.
   ============================================================ */
   (function(){
    // tiny helpers
    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  
    function flashStatus(text, ok){
      const s = $('#emailsOutputStatus');
      if (!s) return;
      s.textContent = text || '';
      s.style.color = ok ? '#006b76' : '#991b1b';
    }
  
    // Build partner chips from lookups → sources[*].code
    async function loadPartnersInto(grid){
      grid.innerHTML = `<span class="muted">Loading partners…</span>`;
      try {
        const r = await fetch('/evotechmail/api/lookups', { credentials: 'include' });
        if (!r.ok) throw new Error(`Lookups HTTP ${r.status}`);
        const j = await r.json();

        const items = Array.isArray(j?.sources) ? j.sources : [];
        const partners = items
          .map(p => (p?.code ?? p?.label ?? '').toString().trim())
          .filter(Boolean);

        if (!partners.length){
          grid.innerHTML = `<span class="muted">No partners configured.</span>`;
          return;
        }
  
        grid.innerHTML = partners.map(code => {
          const id = `partner_${code.replace(/[^a-z0-9]+/gi, '_')}`;
          return `<label for="${id}" class="inline" style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;background:#fff;font-weight:600;cursor:pointer;display:inline-block;margin:4px;">
            <input type="checkbox" id="${id}" value="${code}"> ${code}
          </label>`;
        }).join('');
        

//console.log(grid.innerHTML);

        // keep "Select all" synced
        grid.addEventListener('change', ()=>{
          const all = $$('input[type="checkbox"]', grid);
          const sel = all.filter(cb => cb.checked).length;
          const selAll = $('#partners_select_all');
          if (selAll) selAll.checked = (all.length > 0 && sel === all.length);
        });
  
      } catch (e) {
        console.error('lookups error', e);
        grid.innerHTML = `<div style="color:#ef4444;font-size:12px">Failed to load partners.</div>`;
      }
    }
  
    // PUBLIC: call from the tile button
    window.openEmailListsModal = function openEmailListsModal(){
      const body = `
        <div class="grid">
          <div class="row" style="align-items:center;gap:12px;flex-wrap:wrap">
            <label class="inline"><input type="checkbox" id="partners_select_all"> Select all partners</label>
            <label class="inline"><input type="checkbox" id="filterBusinessOwner"> Business owner</label>
          </div>
  
          <div id="partnersGrid" class="row" style="flex-wrap:wrap;gap:8px;min-height:40px"></div>
  
          <div class="row" style="margin-top:6px;gap:16px">
            <label class="inline"><input type="radio" name="email_status" value="active" checked> Active</label>
            <label class="inline"><input type="radio" name="email_status" value="closed"> Inactive</label>
          </div>
  
          <div class="row" style="gap:8px">
            <button id="fetchEmailsBtn" class="btn btn--primary" type="button">Fetch</button>
            <button id="copyEmailsBtn" class="btn" type="button" disabled>Copy</button>
            <button id="downloadEmailsBtn" class="btn" type="button" disabled>Download</button>
            <span id="listsStatus" class="muted" style="margin-left:auto"></span>
          </div>
  
          <label class="muted" style="margin-top:6px">Results (comma-separated, read-only)</label>
          <textarea id="emailsOutput" readonly style="width:100%;min-height:140px"></textarea>
  
          <div id="emailsOutputStatus" aria-live="polite" class="muted" style="min-height:18px"></div>
        </div>
      `;

      
      openSheet({
        title: 'Export Email Lists',
        bodyHTML: body,
        footerHTML: `<span class="muted">Active = any status other than “closed”.</span>`
      });
    
      // Back: just close the sheet from Lists
      window._sheetGoBack = () => closeSheet();
  
      // wire "Select all" now that DOM exists
      $('#partners_select_all')?.addEventListener('change', (e)=>{
        $$('#partnersGrid input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
      });
  
      // load the partner chips
      const grid = $('#partnersGrid');
      //alertModal('Before Calling loadPartnersInto');
      loadPartnersInto(grid);
  
      // Copy & Download
      const ta = $('#emailsOutput');
      $('#copyEmailsBtn')?.addEventListener('click', async ()=>{
        if (!ta?.value) return;
        try { await navigator.clipboard.writeText(ta.value); flashStatus('Copied to clipboard', true); }
        catch { flashStatus('Copy failed — select and Ctrl+C', false); }
      });
      $('#downloadEmailsBtn')?.addEventListener('click', ()=>{
        if (!ta?.value) return;
        const blob = new Blob([ta.value], { type:'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const d = new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
        a.href = url; a.download = `emails-${y}${m}${day}.txt`;
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(url); a.remove();
        flashStatus('Download started', true);
      });
  
      // Fetch → calls backend and paints to textarea
      $('#fetchEmailsBtn')?.addEventListener('click', async ()=>{
        const boxes = $$('#partnersGrid input[type="checkbox"]:checked');
        const partners = boxes.map(b => b.value);
        const businessOwner = $('#filterBusinessOwner')?.checked === true;
  
        if (!partners.length && !businessOwner){
          flashStatus('Select at least one partner or choose “Business owner”.', false);
          return;
        }
  
        const status = $('input[name="email_status"]:checked')?.value || 'active';
        const btn = $('#fetchEmailsBtn'); const line = $('#listsStatus');
        btn.disabled = true; btn.textContent = 'Fetching…'; line.textContent = 'Working…';
  
        try {
          const params = new URLSearchParams();
          if (partners.length) params.set('partners', partners.join(','));
          params.set('status', status);
          if (businessOwner) params.set('business_owner', 'true');
  
          const r = await fetch(`/evotechmail/api/mail/export-emails?${params.toString()}`, { credentials:'include' });
          const j = await r.json();
          const csv = String(j?.emails || '').trim();
  
          ta.value = csv;
          $('#copyEmailsBtn').disabled = $('#downloadEmailsBtn').disabled = !csv;
          line.textContent = csv ? `Loaded ${csv.split(',').filter(Boolean).length} address(es)` : 'No emails found';
          flashStatus(csv ? 'Emails loaded' : 'No emails found for selection', !!csv);
        } catch (err) {
          console.error('export-emails failed', err);
          line.textContent = 'Failed';
          flashStatus('Failed to fetch emails', false);
        } finally {
          btn.disabled = false; btn.textContent = 'Fetch';
        }
      });
    };
  
    // ensure the global points to this implementation
    window.openEmailListsModal = window.openEmailListsModal;
  })();
  


  
  
  
  function clearEmailForm() {
    // text inputs / textareas
    ['email_to','email_cc','email_bcc','email_subject','email_body'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  
    // uncheck any BCC group checkboxes
    document.querySelectorAll('#bccGroups input[type="checkbox"]').forEach(cb => cb.checked = false);
  
    // templates: uncheck both and disable/reset date
    const cbClosure = document.getElementById('useTemplateCheckbox');
    const cbRA      = document.getElementById('useRegisteredAgentTemplate');
    const dt        = document.getElementById('template_date');
  
    if (cbClosure) cbClosure.checked = false;
    if (cbRA)      cbRA.checked = false;
    if (dt) { dt.value = ''; dt.disabled = true; }
  
    // clear preview
    const prev = document.getElementById('email_preview');
    if (prev) prev.innerHTML = '';
  
    // refresh preview (no-ops if empty)
    if (typeof updateEmailPreview === 'function') updateEmailPreview();
  
    // focus first field
    document.getElementById('email_to')?.focus();
  }
  
  
  function closeEmailListsModal() {
    const modal = document.getElementById('emailListsModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = '';
    }
  }
  
  function toggleSelectAllPartners() {
    const selectAll = document.getElementById('partners_select_all');
    const boxes = document.querySelectorAll('#partnersGrid input[type="checkbox"]');
    boxes.forEach(cb => { cb.checked = !!selectAll.checked; });
  }
  
  
  async function exportEmails() {
    const host = '/evotechmail/api/mail'; // <-- fix path
  
    const boxes = Array.from(document.querySelectorAll('#partnersGrid input[type="checkbox"]:checked'));
    const partners = boxes.map(b => b.value);
  
    const businessOwner = document.getElementById('filterBusinessOwner')?.checked === true;
  /*
    if (!partners.length && !businessOwner) {
      alert('Please select at least one partner or choose "Business owner".');
      return;
    }
  */
  
    const status = (document.querySelector('input[name="email_status"]:checked')?.value) || 'active';
  
    const params = new URLSearchParams();
    if (partners.length) params.set('partners', partners.join(','));
    params.set('status', status);
    if (businessOwner) params.set('business_owner', 'true');
  
    const fetchBtn = document.getElementById('fetchEmailsBtn');
    fetchBtn.disabled = true; fetchBtn.textContent = 'Fetching...';
  
    try {
      const r = await fetch(`${host}/export-emails?${params.toString()}`);
      const ct = r.headers.get('content-type') || '';
      if (!r.ok) throw new Error(ct.includes('json') ? JSON.stringify(await r.json()) : await r.text());
      const data = ct.includes('json') ? await r.json() : { emails: '' };
  
      const out = String(data.emails || '').trim();
      const ta = document.getElementById('emailsOutput');
      ta.value = out;
  
      const has = out.length > 0;
      document.getElementById('copyEmailsBtn').disabled = !has;
      document.getElementById('downloadEmailsBtn').disabled = !has;
  
    } catch (e) {
      console.error('export-emails failed', e);
      //alert('Failed to fetch emails. See console for details.');
    } finally {
      fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch';
    }
  }
  
  
  
  
  
  function copyEmailList() {
    const ta = document.getElementById('emailsOutput');
    if (!ta || !ta.value) return;
    navigator.clipboard?.writeText(ta.value).then(
      () => alert('Copied!'),
      () => alert('Copy failed — you can still select and Ctrl+C.')
    );
  }
  
  function downloadEmailList() {
    const ta = document.getElementById('emailsOutput');
    if (!ta || !ta.value) return;
    const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const dd = String(now.getDate()).padStart(2,'0');
    a.href = url;
    a.download = `emails-${yyyy}${mm}${dd}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }
  
  
  
  // ===== Email Logs UI =====
  
  const LOGS_API = '/evotechmail/api/notifications';
  const LOGS_PAGE_SIZE = 5;
  
  let _logsOffset = 0;
  let _logsTotal  = 0;
  let _logsQuery  = { status:'', q:'' };
  
  
  function fmtDate(s){
    try { return new Date(s).toLocaleString(); } catch { return s || ''; }
  }

  /*
  function fmtDate(s) {
    try {
      return new Date(s).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return s || '';
    }
  }
    */

  function asInt(v){ return Number.isFinite(v) ? v : (parseInt(v,10) || 0); }
  function text(str){ return String(str ?? ''); }
  
  
  
  function updateLogsPagerUI(){
    const prev  = document.getElementById('logsPrevBtn');
    const next  = document.getElementById('logsNextBtn');
    const label = document.getElementById('logsPageLabel');
  
    const total = Number(_logsTotal || 0);
    const size  = Number(LOGS_PAGE_SIZE || 25);
    const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
    const page  = Math.min(pages, Math.floor((_logsOffset||0) / Math.max(1,size)) + 1);
  
    if (label) label.textContent = `${page} / ${pages}`;
    if (prev)  prev.disabled = (_logsOffset <= 0);
    if (next)  next.disabled = (_logsOffset + size >= total);
  }
  
  function setSheetHeaderForDetail(){
    const closeBtn = document.getElementById('sheetCloseBtn');
    if (closeBtn){
      closeBtn.textContent = 'Back';
      closeBtn.onclick = () => (typeof window._sheetGoBack === 'function' ? window._sheetGoBack() : showLogsList());
    }
  }
  function setSheetHeaderForList(){
    const closeBtn = document.getElementById('sheetCloseBtn');
    if (closeBtn){
      closeBtn.textContent = 'Close';
      closeBtn.onclick = () => closeSheet();
    }
  }
  
  function hideEl(el, yes=true){ if (el) el.hidden = !!yes; }
  
  // show the list chrome, hide detail
  function showLogsList(){
    // list parts
    hideEl(document.getElementById('emailLogsTable')?.closest('.table-wrap'), false);
    hideEl(document.getElementById('emailLogsPager'), false);
  
    // filter rows (two .row containers near the top)
    document.querySelectorAll('#logsView > .row').forEach(r => hideEl(r, false));
  
    // detail
    hideEl(document.getElementById('emailLogDetailView'), true);
  
    // header
    setSheetHeaderForList();
  
    // default back action: close sheet
    window._sheetGoBack = () => closeSheet();
  }
  
  // hide the list chrome, show only detail
  function showLogDetail(){
    hideEl(document.getElementById('emailLogsTable')?.closest('.table-wrap'), true);
    hideEl(document.getElementById('emailLogsPager'), true);
    document.querySelectorAll('#logsView > .row').forEach(r => hideEl(r, true));
  
    hideEl(document.getElementById('emailLogDetailView'), false);
    setSheetHeaderForDetail();
  }
  

  
// ============================================================
// Email Logs -> right drawer (desktop) / bottom sheet (mobile)
// ============================================================
window.openEmailLogsModal = async function openEmailLogsModal() {
  const body = `
    <div id="logsView">
      <!-- Row 1: Status only -->
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <select id="logsFilterStatus" style="flex:1;min-width:140px">
          <option value="">All</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
        </select>
        <input id="logsFilterSearch" type="text" placeholder="Search subject/body or recipient…" style="flex:2;min-width:180px">
      </div>

      <!-- Row 2: Dates + Search (puts Search under dates on desktop) -->
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <label>Date From <input type="date" id="logsDateFrom" style="flex:2;min-width:180px"></label>
        <label>Date To <input type="date" id="logsDateTo" style="flex:2;min-width:180px"></label>
         <button class="btn btn--primary" type="button" id="logsSearchBtn">Search</button>
      </div>

      <!-- Table -->
      <div class="table-wrap" style="overflow-x:auto;margin-bottom:8px">
        <table class="table table--compact" id="emailLogsTable" style="width:100%">
          <thead>
            <tr>
              <th class="nowrap">Date</th>
              <th>Subject</th>
              <th class="tc">Rcpts</th>
              <th class="tc">Status</th>
              <th class="tr">Action</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <!-- Pager -->
      <div id="emailLogsPager" class="row" style="gap:12px;align-items:center">
        <button class="btn btn--primary" id="logsPrevBtn" type="button" disabled>Prev</button>
        <span id="logsPageLabel">&nbsp;</span>
        <button class="btn btn--primary" id="logsNextBtn" type="button" disabled>Next</button>
      </div>

      <!-- Detail view -->
      <div id="emailLogDetailView" hidden style="margin-top:14px">
        <div style="margin-top:12px">
          <button class="btn btn--primary" type="button" id="logsBackBtn">Back to list</button>
        </div>
        <div id="emailLogDetailBody"></div>
      </div>
    </div>
  `;

  openSheet({
    title: 'Email Logs',
    bodyHTML: body,
    footerHTML: `<span class="muted">Use filters above to refine results.</span>`
  });

    // Back: just close the sheet from Lists
    window._sheetGoBack = () => closeSheet();


  // Initial date range (last 7 days)
  const dfEl = document.getElementById('logsDateFrom');
  const dtEl = document.getElementById('logsDateTo');
  if (dfEl && dtEl && !dfEl.value && !dtEl.value){
    const today = new Date();
    const from  = new Date(today); from.setDate(from.getDate() - 6);
    dfEl.value = yyyyMmDd(from);
    dtEl.value = yyyyMmDd(today);
  }
  [dfEl, dtEl].forEach(el=>{
    if (el && !el._wiredChange){
      el._wiredChange = true;
      el.addEventListener('change', normalizeLogsDates);
    }
  });

  // Query state + enter-to-search
  _logsOffset = 0;
  const stSel = document.getElementById('logsFilterStatus');
  const qInp  = document.getElementById('logsFilterSearch'); // still supported if you later add it back on row 1
  const wireEnter = el=>{
    if (el && !el._enterWired){
      el._enterWired = true;
      el.addEventListener('keydown', e=>{ if (e.key === 'Enter') reloadEmailLogs(); });
    }
  };
  wireEnter(qInp); wireEnter(dfEl); wireEnter(dtEl);
  document.getElementById('logsSearchBtn')?.addEventListener('click', reloadEmailLogs);

  // Pager
  const prev = document.getElementById('logsPrevBtn');
  const next = document.getElementById('logsNextBtn');
  if (!prev._wired){
    prev._wired = true;
    prev.addEventListener('click', async ()=>{
      if (_logsOffset <= 0) return;
      _logsOffset = Math.max(0, _logsOffset - LOGS_PAGE_SIZE);
      await loadEmailLogsPage();
      updateLogsPagerUI();
    });
  }
  if (!next._wired){
    next._wired = true;
    next.addEventListener('click', async ()=>{
      if (_logsOffset + LOGS_PAGE_SIZE >= _logsTotal) return;
      _logsOffset += LOGS_PAGE_SIZE;
      await loadEmailLogsPage();
      updateLogsPagerUI();
    });
  }

  // Back-to-list (in detail view)
  const backBtn = document.getElementById('logsBackBtn');
  if (backBtn && !backBtn._wired){
    backBtn._wired = true;
    backBtn.addEventListener('click', ()=> showLogsList());
  }

  // First load
  await loadEmailLogsPage();
  updateLogsPagerUI();
  showLogsList();
};

  
  
  
  // Triggered by “Search” button
  async function reloadEmailLogs(){
    const stSel = document.getElementById('logsFilterStatus');
    const qInp  = document.getElementById('logsFilterSearch');
  
    _logsQuery = {
      status: stSel ? (stSel.value || '') : '',
      q:      qInp  ? (qInp.value   || '') : ''
    };
    _logsOffset = 0;
    await loadEmailLogsPage();
    updateLogsPagerUI();
    showLogsList();
  }
  
  
  
  async function loadEmailLogsPage(){
    const qs = new URLSearchParams({
      limit:  LOGS_PAGE_SIZE,
      offset: _logsOffset,
      _: Date.now()            // bust caches in dev
    });
    if (_logsQuery.status) qs.set('status', _logsQuery.status);
    if (_logsQuery.q)      qs.set('q', _logsQuery.q);
  
    // Optional: exact recipient match if user typed a single email
    if (_logsQuery.q && /@/.test(_logsQuery.q) && !_logsQuery.q.includes(' ')) {
      qs.set('email', _logsQuery.q);
    }
  
    // date range
    const df = document.getElementById('logsDateFrom')?.value;
    const dt = document.getElementById('logsDateTo')?.value;
    const { df: dfVal, dt: dtVal } = normalizeLogsDates(); // guarantees From <= To
    if (dfVal) qs.set('since', startOfDayISO(dfVal));
    if (dtVal) qs.set('until', endOfDayISO(dtVal));
    
  
    const r = await fetch(`${LOGS_API}?${qs.toString()}`);
    if (!r.ok){
      console.error('logs fetch failed', r.status, await r.text());
      alert('Failed to load logs'); return;
    }
    const data = await r.json(); // expected: { ok, items, total, limit, offset }
  
    const items = Array.isArray(data.items) ? data.items : [];
    const tbody = document.querySelector('#emailLogsTable tbody');
    tbody.replaceChildren();
  
    items.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.notification_id; // <- so we can find it later

  
      const tdDate = document.createElement('td');
      tdDate.textContent = fmtDate(row.create_ts || row.last_attempt_ts);
      tdDate.classList.add('nowrap');
  
      const tdSubj = document.createElement('td');
      //tdSubj.textContent = text(row.subject);
      const subj = text(row.subject);
      tdSubj.textContent = subj.length > 20 ? subj.slice(0, 20) + '...' : subj;
  
      const tdRcpt = document.createElement('td');
      const meta = row.delivery_meta || {};
      tdRcpt.textContent = asInt(meta.rcpt_total || 0);
      tdRcpt.classList.add('tc');
  
      const tdStatus = document.createElement('td');
      tdStatus.style.textAlign = 'center';
      const badge = document.createElement('span');
      badge.className = 'badge status-badge ' + (row.status === 'SUCCESS' ? 'badge--success' : 'badge--danger');
      badge.textContent = row.status === 'SUCCESS' ? 'S' : 'F' || '';
      tdStatus.appendChild(badge);
  
      // action: view (eye) + maybe resend
      const tdAct = document.createElement('td');
      tdAct.className = 'actions-cell';

      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn btn--icon';
      viewBtn.type = 'button';
      viewBtn.title = 'View';
      viewBtn.setAttribute('aria-label','View');
      viewBtn.dataset.action = 'view';
      viewBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5c-5 0-9 5-9 7s4 7 9 7 9-5 9-7-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"></path>
      </svg>`;
      viewBtn.addEventListener('click', ()=> openEmailLogDetail(row.notification_id));
      tdAct.appendChild(viewBtn);

      if (row.status === 'FAILED') {
      const resend = document.createElement('button');
      resend.className = 'btn btn--icon';
      resend.type = 'button';
      resend.title = 'Resend';
      resend.setAttribute('aria-label','Resend');
      resend.dataset.action = 'resend';
      resend.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"></path>
        </svg>`;
      resend.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        resendNotification(row.notification_id, this); // pass the button
      });
      tdAct.appendChild(resend);
    }

  
      tr.append(tdDate, tdSubj, tdRcpt, tdStatus, tdAct);
      tbody.appendChild(tr);
    });
  
    // Delegate eye clicks
    if (!tbody._eyeWired){
      tbody._eyeWired = true;
      tbody.addEventListener('click', (e)=>{
        const btn = e.target.closest('button.logs-view');
        if (!btn) return;
        const id = btn.dataset.id;
        if (id) openEmailLogDetail(id);
      });
    }
  
    // Pager state
    _logsTotal = asInt(data.total);
    const page     = Math.floor(_logsOffset / LOGS_PAGE_SIZE) + 1;
    const pageMax  = Math.max(1, Math.ceil(_logsTotal / LOGS_PAGE_SIZE));
    document.getElementById('logsPageLabel').textContent = `${page} / ${pageMax}`;
    document.getElementById('logsPrevBtn').disabled = (_logsOffset <= 0);
    document.getElementById('logsNextBtn').disabled = (_logsOffset + LOGS_PAGE_SIZE >= _logsTotal);
  }
  
  
  
  async function openEmailLogDetail(id){
    try {
      const r = await fetch(`${LOGS_API}/${encodeURIComponent(id)}`, { credentials:'include' });
      if (!r.ok){
        console.error('detail fetch failed', r.status, await r.text());
        alert('Failed to load email details');
        return;
      }
      const { notification: row } = await r.json();
      if (!row){ alert('Not found'); return; }
  
      // 1) Hide list chrome, switch header to "Back"
      showLogDetail();            // hides table/pager/filters
      setSheetHeaderForDetail();  // change Close→Back while in detail
  
      // 2) Build compact meta grid
      const result = row.result_details || {};
      const smtp   = (result.smtp || {});
      const imap   = (result.imap || {});
      const to  = (row.to_addrs || []).join(', ');
      const cc  = (row.cc_addrs || []).join(', ');
      const bcc = (row.bcc_addrs || []).join(', ');
  
      const bodyEl = document.getElementById('emailLogDetailBody');
      if (!bodyEl){ alert('Detail host not found'); return; }
      bodyEl.replaceChildren();
  
      const metaGrid = document.createElement('div');
      metaGrid.style.display = 'grid';
      metaGrid.style.gridTemplateColumns = '140px 1fr';
      metaGrid.style.columnGap = '10px';
      metaGrid.style.rowGap = '6px';
      metaGrid.style.fontSize = '13px';
      metaGrid.style.color = '#374151';
  
      // helper for label/value rows
      const row2 = (label, value) => {
        const L = document.createElement('div');
        L.innerHTML = `<strong>${label}</strong>`;
        const V = document.createElement('div');
        V.textContent = value || '';
        metaGrid.append(L, V);
      };
  
      row2('Date',       fmtDate(row.create_ts || row.last_attempt_ts));
      row2('Sent By',    (row.create_user_id || ''));
      row2('Attempt No.', String(row.attempt_no || ''));
      row2('Status',     (row.status || ''));
      row2('Context',    (row.context || ''));
      row2('From',       (row.from_addr || ''));
      row2('To',         to);
      if (cc)  row2('CC',  cc);
      if (bcc) row2('BCC', bcc);
      row2('Subject',    (row.subject || ''));
      row2('Message-ID', (result.message_id || ''));
      row2('SMTP',       (smtp.response || ''));
      row2('IMAP',       imap.appended ? `Appended to ${imap.folder || '[Gmail]/Sent Mail'}` : (imap.error ? `Error: ${imap.error}` : ''));
  
      // 3) Message preview (iframe) with inlined body font styling
      const previewWrap = document.createElement('div');
      previewWrap.style.marginTop = '10px';
  
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.style.width = '100%';
      iframe.style.height = '60vh';
      iframe.style.border = '1px solid #e5e7eb';
      iframe.style.borderRadius = '8px';
      iframe.style.background = '#fff';
  
      const bodyRaw = String(row.body || '');
      const isHtml  = /<\w+[^>]*>/i.test(bodyRaw);
      const docStyle = `
        <!doctype html><meta charset="utf-8">
        <style>
          :root { color-scheme: light; }
          html,body{margin:0;padding:12px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;color:#374151;line-height:1.45}
          img{max-width:100%;height:auto}
          pre{white-space:pre-wrap}
        </style>
      `;
      iframe.srcdoc = isHtml
        ? `${docStyle}${bodyRaw}`
        : `${docStyle}<pre>${bodyRaw.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>`;
  
      previewWrap.appendChild(iframe);
  
      // 4) Paint detail into the sheet body
      const detailHost = document.getElementById('emailLogDetailBody');
      const wrapper = document.createElement('div');
      wrapper.style.fontSize = '13px';
      wrapper.style.color = '#374151';
      wrapper.append(metaGrid, previewWrap);
  
      detailHost.appendChild(wrapper);
  
      // Back handler for header/back button and Esc/backdrop
      window._sheetGoBack = () => showLogsList();
  
    } catch (e) {
      console.error('openEmailLogDetail error', e);
      alert('Failed to load email details');
    }
  }
  

  
  
  
  // helpers to toggle views
  function showLogsList(){
    const listArea   = document.getElementById('logsView'); // outer exists in logs sheet
    const detailView = document.getElementById('emailLogDetailView');
    if (detailView) detailView.hidden = true;
    // show the list bits
    document.getElementById('emailLogsTable')?.closest('.table-wrap')?.removeAttribute('hidden');
    document.getElementById('emailLogsPager')?.removeAttribute('hidden');
    // pressing Back now closes the sheet
    window._sheetGoBack = () => closeSheet();
  }
  
  function showLogDetail(){
    // hide list bits
    document.getElementById('emailLogsTable')?.closest('.table-wrap')?.setAttribute('hidden','');
    document.getElementById('emailLogsPager')?.setAttribute('hidden','');
    // show detail area
    const detailView = document.getElementById('emailLogDetailView');
    if (detailView) detailView.hidden = false;
    // pressing Back returns to list
    window._sheetGoBack = () => showLogsList();
  }
  
  
  
  function yyyyMmDd(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function startOfDayISO(localYYYYMMDD){
    const [y,m,d]=localYYYYMMDD.split('-').map(Number);
    return new Date(y, m-1, d, 0,0,0,0).toISOString();
  }
  function endOfDayISO(localYYYYMMDD){
    const [y,m,d]=localYYYYMMDD.split('-').map(Number);
    return new Date(y, m-1, d, 23,59,59,999).toISOString();
  }
  
  // Ensure From <= To; if both present and invalid, swap them and reflect in UI.
  function normalizeLogsDates(){
    const dfEl = document.getElementById('logsDateFrom');
    const dtEl = document.getElementById('logsDateTo');
    if (!dfEl || !dtEl) return { df:'', dt:'' };
  
    const df = dfEl.value || '';
    const dt = dtEl.value || '';
    if (df && dt && new Date(df) > new Date(dt)) {
      // swap in UI
      const tmp = df; dfEl.value = dt; dtEl.value = tmp;
    }
    return { df: dfEl.value || '', dt: dtEl.value || '' };
  }
  


  // ---------- Dialog helpers ----------

function openDialog(dlg) {
    if (!dlg) return;
    dlg.style.removeProperty('display');             // clear stale inline CSS
    try { if (!dlg.open) dlg.showModal(); } catch {} // create real backdrop + focus trap
  }
  
  function closeDialog(dlg) {
    if (!dlg) return;
    try { dlg.close(); } catch {}
    dlg.removeAttribute('open');
    dlg.style.removeProperty('display');
  
    // HEAL #1: bounce a shim to clear top-layer if UA is stuck
    requestAnimationFrame(() => {
      const stuck = document.querySelector('dialog:modal');
      if (!stuck) return;
  
      try {
        const shim = document.createElement('dialog');
        document.body.appendChild(shim);
        shim.showModal();
        shim.close();
        shim.remove();
      } catch {}
  
      // HEAL #2: if still stuck, clone-replace the offending dialog
      requestAnimationFrame(() => {
        const still = document.querySelector('dialog:modal');
        if (!still) return;
        const id = still.id;
        const clone = still.cloneNode(true);
        still.replaceWith(clone);
        if (typeof wireModal === 'function') {
          // re-apply one-time wiring to the fresh node
          wireModal(id, { outsideClickCloses: false });
        }
      });
    });
  }
  


  async function resendNotification(id, btn){
    if (!id) return;
    const rowEl   = document.querySelector(`#emailLogsTable tr[data-id="${id}"]`);
    const badgeEl = rowEl?.querySelector('.status-badge');
  
    // UI: busy state
    if (btn){ btn.disabled = true; btn.classList.add('is-busy'); }
  
    try {
      const r = await fetch(`${LOGS_API}/${encodeURIComponent(id)}/resend`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        credentials: 'include'
      });
  
      const ct   = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : {};
      const partial = (r.status === 207) || !!data.partial;
      const ok = !!data.ok;
  
      // Update badge
      if (badgeEl){
        badgeEl.classList.remove('badge--success','badge--danger','pulse');
        if (ok && !partial){
          badgeEl.classList.add('badge--success','pulse');
          badgeEl.textContent = 'S';
        } else {
          badgeEl.classList.add('badge--danger','pulse');
          badgeEl.textContent = partial ? 'FAILED' : 'FAILED';
        }
      }
  
      // If succeeded, also remove the resend icon (no longer FAILED)
      if (ok && !partial){
        const resendBtn = rowEl?.querySelector('button[data-action="resend"]');
        if (resendBtn) resendBtn.remove();
      }
    } catch (e) {
      console.error('resendNotification failed:', e);
      if (badgeEl){
        badgeEl.classList.remove('badge--success','pulse');
        badgeEl.classList.add('badge--danger','pulse');
        badgeEl.textContent = 'F';
      }
    } finally {
      if (btn){ btn.disabled = false; btn.classList.remove('is-busy'); }
    }
  }
  
  