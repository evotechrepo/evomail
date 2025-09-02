/* reporting.js – dropdowns + single-view layout */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

let REPORTS = [];     // cache for both views
let CURRENT_ID = null;

/* ----- view switching ----- */
/* replace these helpers in reporting.js */
function hide(sel){
    const v = document.querySelector(sel);
    if (!v) return;
    v.hidden = true;
    v.setAttribute('aria-hidden','true');
    v.style.display = 'none';
  }
  
  function show(sel){
    document.getElementById('hub').hidden = true;
    hide('#adminView'); hide('#runView');  // collapse any open view first
    const v = document.querySelector(sel);
    if (!v) return;
    v.hidden = false;
    v.setAttribute('aria-hidden','false');
    v.style.display = 'block';
  }
  
  function showHub(){
    const hub = document.getElementById('hub');
    if (hub) hub.hidden = false;
    hide('#adminView'); hide('#runView');
  }
  

  function setDeleteEnabled(on){
    const b = document.getElementById('delBtn');
    if (b) b.disabled = !on;
  }
  

/* ----- boot ----- */
document.addEventListener('DOMContentLoaded', async () => {
  // ensure only hub is visible at load
  showHub();

  // tile nav
  $('#openAdmin')?.addEventListener('click', async () => { await loadReports(); populateSelects(); show('#adminView'); });
  $('#openRun')?.addEventListener('click',   async () => { await loadReports(); populateSelects(); show('#runView'); });

  // back
  $('#backFromAdmin')?.addEventListener('click', showHub);
  $('#backFromRun')?.addEventListener('click', showHub);

  // admin dropdown -> load into editor
  $('#adminSelect')?.addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) { CURRENT_ID=null; clearEditor(); return; }
    await openForEdit(id);
  });

  // run dropdown + button
  $('#runBtn')?.addEventListener('click', () => {
    const id = $('#runSelect').value;
    if (id) runReport(id);
  });
  $('#runSelect')?.addEventListener('change', () => {
    const id = $('#runSelect').value;
    if (id) runReport(id); // auto-run on choose; remove if you want manual only
  });

  // admin buttons
  $('#newBtn')?.addEventListener('click', () => { CURRENT_ID=null; clearEditor(); $('#repName').focus(); setDeleteEnabled(false);});
  $('#verifyBtn')?.addEventListener('click', verifyCurrent);
  $('#saveBtn')?.addEventListener('click', saveCurrent);
});

/* ----- data ----- */
async function loadReports(){
  try{
    const r = await fetch('/evotechmail/api/reports', { cache:'no-store' });
    const j = await r.json();
    REPORTS = Array.isArray(j.items) ? j.items : [];
  }catch(_){ REPORTS=[]; }
}
function populateSelects(){
  const opts = [`<option value="">Select a report…</option>`]
    .concat(REPORTS.map(r=>`<option value="${r.report_id}">${esc(r.report_name)}</option>`))
    .join('');
  const a = $('#adminSelect'); if (a) a.innerHTML = opts;
  const ru= $('#runSelect');   if (ru) ru.innerHTML = opts;
}

/* ----- admin editor ----- */
function clearEditor(){
  $('#repName').value='';
  $('#repSql').value='';
  $('#verifyOut').innerHTML='';
  setDeleteEnabled(false);
}
async function openForEdit(id){
  try{
    const r = await fetch(`/evotechmail/api/reports/${encodeURIComponent(id)}`, { cache:'no-store' });
    if (!r.ok) throw new Error('Load failed');
    const j = await r.json();
    CURRENT_ID = id;
    $('#repName').value = j.report_name || '';
    $('#repSql').value  = j.report_sql  || '';
    $('#verifyOut').innerHTML='';
    setDeleteEnabled(true);
  }catch(_){
    CURRENT_ID=null;
    $('#verifyOut').innerHTML='<div class="bad">Failed to load report.</div>';
  }
}
async function verifyCurrent(){
  const name = $('#repName').value.trim();
  const sql  = $('#repSql').value;
  const out  = $('#verifyOut');
  if (!name || !sql) { out.innerHTML='<div class="bad">Name and SQL are required.</div>'; return false; }
  out.innerHTML='<div class="muted">Verifying…</div>';
  try{
    const r = await fetch('/evotechmail/api/reports/verify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ report_name: name, report_sql: sql })
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      out.innerHTML = `<div class="bad">❌ ${esc(j.error||('HTTP '+r.status))}</div>`;
      return false;
    }
    out.innerHTML = `
      <div class="good">✔ Verified</div>
      ${j.sections?.map((s,i)=>`
        <div class="card">
          <strong>${esc(s.title||('Section '+(i+1)))}</strong>
          <div class="muted">${s.row_count} row(s)</div>
          ${s.columns?.length?`<div class="muted">Columns: ${s.columns.map(esc).join(', ')}</div>`:''}
        </div>`).join('') || ''}`;
    return true;
  }catch(e){
    out.innerHTML = `<div class="bad">❌ ${esc(e.message||'Verify failed')}</div>`;
    return false;
  }
}
async function saveCurrent(){
  const ok = await verifyCurrent(); if (!ok) return;
  const name = $('#repName').value.trim();
  const sql  = $('#repSql').value;
  const out  = $('#verifyOut');

  try{
    let r, j;
    if (CURRENT_ID){
      r = await fetch(`/evotechmail/api/reports/${encodeURIComponent(CURRENT_ID)}`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ report_name: name, report_sql: sql })
      });
    }else{
      r = await fetch('/evotechmail/api/reports', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ report_name: name, report_sql: sql })
      });
    }
    j = await r.json();
    if (!r.ok || !j.ok){
      out.innerHTML += `<div class="bad" style="margin-top:6px">Save failed: ${esc(j.error||('HTTP '+r.status))}</div>`;
      return;
    }
    out.innerHTML += `<div class="good fade-ok" style="margin-top:6px">✔ Saved</div>`;
    // refresh dropdowns and clear editor for next
    await loadReports(); populateSelects();
    setTimeout(()=>{ CURRENT_ID=null; clearEditor(); }, 700);
  }catch(e){
    out.innerHTML += `<div class="bad" style="margin-top:6px">${esc(e.message||'Save failed')}</div>`;
  }
}

/* ----- run view ----- */
    let LAST_RUN = null;

    async function runReport(id){
    const out = $('#runOut');
    out.innerHTML = '<div class="muted">Running…</div>';
    try{
        const r = await fetch(`/evotechmail/api/reports/${encodeURIComponent(id)}/execute`, { method:'POST' });
        const j = await r.json();
        if (!r.ok || !j.ok) { out.innerHTML = `<div class="bad">❌ ${esc(j.error||('HTTP '+r.status))}</div>`; return; }
        LAST_RUN = j; // keep for TSV
        out.innerHTML = `
        <h3 style="margin:0 0 6px 0;color:#0b8a8f">${esc(j.report_name)} <span class="muted">(${j.sections.length} section(s))</span></h3>
        ${j.sections.map((sec,i)=>renderSection(sec,j.report_id,i)).join('')}`;
        wireTSVButtons();
    }catch(e){
        out.innerHTML = `<div class="bad">❌ ${esc(e.message||'Run failed')}</div>`;
    }
    }


    function renderSection(sec, reportId, idx){
        const head = `
          <div class="sec-head">
            <strong>${esc(sec.title||('Section '+(idx+1)))}</strong>
            <span class="sp">${sec.rows.length} row(s) • ${sec.ms} ms</span>
            <button class="btn btn--sm dl-tsv" data-tsv="${idx}">Download TSV</button>
          </div>`;
        if (!sec.rows.length) return `<div class="card sec">${head}<div class="muted">No rows.</div></div>`;
        const cols = sec.columns || Object.keys(sec.rows[0]||{});
        const thead=`<thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>`;
        const tbody=`<tbody>${sec.rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
        return `<div class="card sec">${head}<div class="table-wrap"><table>${thead}${tbody}</table></div></div>`;
      }
      
      function wireTSVButtons(){
        document.querySelectorAll('.dl-tsv').forEach(btn=>{
          if (btn.dataset.wired) return;
          btn.dataset.wired = '1';
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-tsv'));
            const sec = LAST_RUN?.sections?.[idx];
            if (!sec) return;
            const tsv = toTSV(sec);
            const name = `${(LAST_RUN.report_name||'report').replace(/\s+/g,'_')}_section${idx+1}.tsv`;
            const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click();
            URL.revokeObjectURL(a.href); a.remove();
          });
        });
      }
      
      function toTSV(sec){
        const cols = sec.columns || Object.keys(sec.rows?.[0] || {});
        const clean = v => (v==null ? '' : String(v).replace(/\t/g,' ').replace(/\r?\n/g,' '));
        const header = cols.join('\t');
        const rows   = (sec.rows||[]).map(r => cols.map(c=>clean(r[c])).join('\t')).join('\n');
        return header + (rows ? '\n' + rows : '') + '\n';
      }
      

      async function deleteCurrent(){
        if (!CURRENT_ID) return;
        
        const hard = false; // bypass, all soft
        /*
        const hard = false; // set true if you want hard delete from UI
        const msg  = hard
          ? 'This will permanently delete the report. Continue?'
          : 'This will deactivate the report (soft delete). Continue?';
        if (!confirm(msg)) return;
        */
        const out = $('#verifyOut');
        try{
          const url = `/evotechmail/api/reports/${encodeURIComponent(CURRENT_ID)}${hard ? '?hard=false' : ''}`;
          const r = await fetch(url, { method:'DELETE' });
          const j = await r.json();
          if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));
      
          out.innerHTML = `<div class="good fade-ok">✔ Deleted${hard?' permanently':''}</div>`;
          // refresh lists and clear editor
          await loadReports();
          populateSelects();
          CURRENT_ID = null;
          clearEditor();
          // also clear selected option
          const sel = $('#adminSelect'); if (sel) sel.value = '';
        }catch(e){
          out.innerHTML = `<div class="bad">Delete failed: ${esc(e.message||'Error')}</div>`;
        }
      }
      
      document.getElementById('delBtn')?.addEventListener('click', deleteCurrent);
      