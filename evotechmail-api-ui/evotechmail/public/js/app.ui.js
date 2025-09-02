/* scripts/app.js — pure fetch, no GAS.
   - Fetches all data on page load
   - Reads filters from the Search form
   - Renders results into #results and updates #recordCount
*/

(function(){
  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>'"]/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[m]));
  }

  function ensureContainer() {
    let el = document.getElementById('results');
    if (!el) {
      el = document.createElement('div');
      el.id = 'results';
      document.body.appendChild(el);
    }
    return el;
  }

  window.selectRow = function(tr){
    document.querySelectorAll('.result-table tr.selected')
      .forEach(el => el.classList.remove('selected'));
    tr.classList.add('selected');
  };
  

  
  function renderTable(headers, results) {
    const norm = s => String(s ?? '').trim().toLowerCase();
    const statusIndex = headers.findIndex(h => norm(h) === 'status');
    const bcgIndex    = headers.findIndex(h => norm(h) === 'bcg');
  
    let activeCount = 0;
    let inactiveCount = 0;
  
    let table = '<table class="result-table"><thead><tr>';
    headers.forEach(h => { table += `<th>${escapeHTML(h)}</th>`; });
    table += '<th>Actions</th></tr></thead><tbody>';
  
    results.forEach(item => {
      const row = Array.isArray(item?.row) ? item.row : [];

      // Normalize (case-insensitive + trimmed)
      const norm = s => String(s ?? '').trim().toLowerCase();
      const statusVal = statusIndex >= 0 ? norm(row[statusIndex]) : '';
      const bcgVal    = bcgIndex    >= 0 ? norm(row[bcgIndex])    : '';
  
      // Strike-through only when BOTH are closed
      const isClosedBoth = (statusVal === 'closed' && bcgVal === 'closed');
      if (isClosedBoth) inactiveCount++; else activeCount++;

      // Close button is ACTIVE only when status is closed AND bcg is NOT closed
      const canClose = (statusVal === 'closed' && bcgVal !== 'closed');
  
      const rowClass = isClosedBoth ? 'inactive-row' : '';

      // AFTER (include id):
      //const encodedRowData = encodeBase64({ row, id: item.id });
      const encodedRowData = encodeBase64({
        row,
        id: (item && item.id) ?? null,
        notesJson: Array.isArray(item?.notesJson) ? item.notesJson : null,
        addressesJson: Array.isArray(item?.addressesJson) ? item.addressesJson : null  // << NEW
      });

      let subscriber_id = (item && item.id) ?? null;
  
      //table += `<tr class="${rowClass}">`;
      table += `<tr class="${rowClass}" data-payload="${encodedRowData}" onclick="selectRow(this)">`;
  
      // PMB (index 0): clickable when NOT closed-both
      if (!isClosedBoth) {
        table += `<td style="cursor:pointer;color:blue;" onclick="openEditTab('${encodedRowData}')">${escapeHTML(row[0])}</td>`;
      } else {
        table += `<td>${escapeHTML(row[0])}</td>`;
      }
  
      // Rest of columns
      for (let i = 1; i < row.length; i++) {
        table += `<td>${escapeHTML(row[i])}</td>`;
      }


      // Actions 
      table += '<td style="text-decoration:none;"><div style="display:flex;gap:10px;align-items:center;">';

      // View eye (always enabled)
      table += `<button class="icon-btn" title="View" aria-label="View"
      data-encoded="${encodedRowData}"
      onclick="event.stopPropagation(); openViewFromBtn(this)">
      <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 5c-5.04 0-9.32 3.11-11.05 7 1.73 3.89 6.01 7 11.05 7s9.32-3.11 11.05-7C21.32 8.11 17.04 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
      </svg>
      </button>`;
      
      // Edit: disabled when both closed
      if (!isClosedBoth) {
        table += `<button style="padding:4px 8px;font-size:10px;cursor:pointer;" onclick="openEditTab('${encodedRowData}')">Edit</button>`;
      } else {
        table += `<button style="padding:4px 8px;font-size:10px;cursor:not-allowed;background:#ccc;" disabled>Edit</button>`;
      }

      // Actions…
      if (canClose) {
        table += `<button style="padding:4px 8px;font-size:10px;cursor:pointer;background-color:#ff4d4d;color:#fff;" onclick="inactivateSubscriber(${subscriber_id})">Close</button>`;
      } else {
        table += `<button style="padding:4px 8px;font-size:10px;cursor:not-allowed;background-color:#ffcccc;color:#aaa;" disabled>Close</button>`;
      }

      if (isClosedBoth){
        table += `<button style="padding:4px 8px;font-size:10px;cursor:pointer;background-color:#1a743b ;color:#fff;border:1px solid#166534;" onclick="reActivateSubscriber(${subscriber_id})">Restore</button>`;
      } else {
        table += `<button style="padding:4px 8px;font-size:10px;cursor:not-allowed;background-color: #e3f9eb ;color:#94a3b8;border:1px solid#bbf7d0;" disabled>Restore</button>`;
      }
  
      table += `</div></td>`;
      table += '</tr>';
    });
  
    table += '</tbody></table>';
  
    return { html: table, activeCount, inactiveCount };
  }
  

// Global renderer used by load/search
window.displayResults = function(data) {
  try {
    const headers = Array.isArray(data?.headers) ? data.headers.map(h => String(h).trim()) : [];
    const results = Array.isArray(data?.results) ? data.results : [];
    
    const el = ensureContainer();

    if (!results.length) {
      el.innerHTML = '<p>No results found.</p>';
      const rc0 = document.getElementById('recordCount');
      if (rc0) rc0.textContent = '0 results found.';
      return;
    }

    // renderTable(headers, results) should return { html, activeCount, inactiveCount }
    const { html, activeCount, inactiveCount } = renderTable(headers, results);

    el.innerHTML = html;

    const rc = document.getElementById('recordCount');
    if (rc) {
      rc.innerHTML = `
        ${results.length} result(s) found:
        <span style="color: green; font-weight: bold;">${activeCount} Active</span>,
        <span style="color: red; font-weight: bold;">${inactiveCount} Closed</span>.
      `;
    }
  } catch (e) {
    console.error('displayResults error:', e);
    const rc = document.getElementById('recordCount');
    if (rc) rc.textContent = '0 records';
  }
};
})();


function toggleLoading(show) {
  document.getElementById('loadingModal').style.display = show ? 'flex' : 'none';
}



  function showErrorModal(message) {
    document.getElementById('errorMessage').innerText = message;
    document.getElementById('errorModalWrapper').style.display = 'flex';
  }

  function closeErrorModal() {
    document.getElementById('errorModalWrapper').style.display = 'none';
  }

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

  // Ensure a hidden input exists; create it if missing
  function ensureHidden(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('input');
      el.type = 'hidden';
      el.id = id;
      (document.getElementById('editForm') || document.body).appendChild(el);
    }
    return el;
  }


  function setVal(id, v='') {
    const el = document.getElementById(id);
    if (el) el.value = v;
  }

  function decodeBase64(b64) {
    try { return JSON.parse(decodeURIComponent(escape(atob(b64)))); }
    catch { return null; }
  }

  function setSelectByTextOrValue(id, value) {
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
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openAddressesEditor(subscriberId) {
    const overlay   = document.getElementById('addressesModal');
    const list      = document.getElementById('addressesList');
    const addBtn    = document.getElementById('addAddressBtn');
    const saveBtn   = document.getElementById('saveAddressBtn');
    const cancelBtn = document.getElementById('cancelAddressBtn');
    const closeBtn  = document.getElementById('closeAddressesBtn');
  
    const modUser =
      (window.currentUser && String(window.currentUser)) ||
      (typeof userEmail !== 'undefined' && String(userEmail)) ||
      'web';
  
    // Always open from UI snapshot (no deleted entries)
    let addresses = Array.isArray(window._currentAddressesJson)
      ? window._currentAddressesJson.map(a => ({ ...a }))
      : [];
  
    // stable order: primary first, then by id
    addresses.sort((a,b) => {
      if (!!b.is_primary - !!a.is_primary) return (!!b.is_primary - !!a.is_primary);
      return (a.address_id ?? Number.MAX_SAFE_INTEGER) - (b.address_id ?? Number.MAX_SAFE_INTEGER);
    });

    const toOneLine = (s) => String(s || '')
    .replace(/[\r\n]+/g, ' ')   // turn newlines/tabs into a space
    .replace(/\s{2,}/g, ' ')    // collapse multiple spaces
    .trim();
  
  function render() {
      list.replaceChildren();
  
      addresses.forEach((a, idx) => {
        const card = document.createElement('div');
        card.className = 'note-card'; // reuse styling
  
        const top = document.createElement('div');
        top.className = 'note-card__top';
  
        // meta (who/when)
        const meta = document.createElement('div');
        meta.className = 'note-card__meta';
        const when = a.last_mod_ts || a.create_ts;
        meta.textContent = [
          a.last_mod_user_id || a.create_user_id ? `by ${(a.last_mod_user_id || a.create_user_id)}` : '',
          when ? `@ ${new Date(when).toLocaleString()}` : ''
        ].filter(Boolean).join('  ');
  
        // Primary toggle (radio-like behavior)
        const primaryWrap = document.createElement('label');
        primaryWrap.style.display = 'inline-flex';
        primaryWrap.style.alignItems = 'center';
        primaryWrap.style.gap = '6px';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = !!a.is_primary;
        chk.addEventListener('change', () => {
          // make this primary, unset others
          addresses.forEach((x, i) => x.is_primary = (i === idx));
          render();
        });
        primaryWrap.append(chk, document.createTextNode('Primary'));
  
        const del = document.createElement('button');
        del.className = 'btn btn--danger';
        del.type = 'button';
        del.textContent = 'Delete';
        del.onclick = () => { addresses.splice(idx, 1); render(); };
  
        top.append(meta, primaryWrap, del);
  
        const ta = document.createElement('textarea');
        ta.className = 'note-text';
        ta.rows = 2;
        ta.placeholder = 'Address line 1';
        ta.value = a.address_line_1 || '';
        //ta.addEventListener('input', e => { a.address_line_1 = e.target.value; });
        const toOneLine = s => String(s || '')
          .replace(/[\r\n]+/g, ' ')   // remove newlines/tabs -> space
          .replace(/\s{2,}/g, ' ')    // collapse multi-spaces
          .trim();

        // block Enter from inserting a newline
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') e.preventDefault();
        });

        // while typing: DO NOT normalize spaces
        ta.addEventListener('input', (e) => {
          a.address_line_1 = e.target.value;  // keep exactly what the user typed
        });

        // when leaving the field: normalize to one line
        ta.addEventListener('blur', (e) => {
          a.address_line_1 = toOneLine(e.target.value);
          e.target.value   = a.address_line_1;  // update the UI once
        });

        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
        });
        


  
        card.append(top, ta);
        list.appendChild(card);
      });
    }
    
      if (addBtn) {
        addBtn.onclick = (e) => {
          e.preventDefault();
          // Add a new in-UI note with provisional user + timestamp at the top
          addresses.unshift({
            address_id: null,
            address_line_1: '',
            is_primary: addresses.every(x => !x.is_primary) // if none, first new becomes primary
          });
          /* Next pushes below
          // New address defaults to non-primary
          addresses.push({
            address_id: null,
            address_line_1: '',
            is_primary: addresses.every(x => !x.is_primary) // if none, first new becomes primary
          });
          */
          render();
        };
      }
    
      if (saveBtn) {
        saveBtn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
    
          // RAW snapshot used for UI reopen (no deletes)
          const raw = addresses.map(a => ({
            address_id: a.address_id ?? null,
            //address_line_1: String(a.address_line_1 || '').trim(),
            address_line_1: toOneLine(a.address_line_1),
            is_primary: !!a.is_primary,
            last_mod_user_id: a.last_mod_user_id || modUser,
            last_mod_ts: a.last_mod_ts || new Date().toISOString(),
            create_user_id: a.create_user_id || modUser,
            create_ts: a.create_ts || new Date().toISOString()
          }));
    
          // Build payload (add/update/delete) by comparing with before
          const before = Array.isArray(window._currentAddressesJson) ? window._currentAddressesJson : [];
          const beforeById = new Map(before.filter(a => a.address_id != null).map(a => [Number(a.address_id), a]));
          const afterById  = new Map(raw.filter(a => a.address_id != null).map(a => [Number(a.address_id), a]));
    
          const draft = [];
          // updates (existing still present)
          for (const [id, a] of afterById.entries()) {
            draft.push({ address_id: id, address_line_1: a.address_line_1, is_primary: !!a.is_primary });
          }
          // deletes (existing missing now)
          for (const [id, a] of beforeById.entries()) {
            if (!afterById.has(id)) draft.push({ address_id: id, deleted: true });
          }
          // inserts (new)
          for (const a of raw) {
            if (a.address_id == null && a.address_line_1) {
              draft.push({ address_id: null, address_line_1: a.address_line_1, is_primary: !!a.is_primary });
            }
          }
    
          // Clean & enforce single primary in payload
          window._editAddresses = sanitizeAddressesArray(draft);
          window._editAddressesDirty = true;
    
          // UI snapshot for next open (no deletes)
          window._currentAddressesJson = raw;
    
          // Update the small textarea to show the chosen primary
          updateAddressesTextareaFromArray(window._currentAddressesJson);
    
          closeDialog(overlay);
        };
      }
    
      if (cancelBtn)  cancelBtn.onclick = (e)=>{ e.preventDefault(); closeDialog(overlay); };
      if (closeBtn)   closeBtn.onclick  = (e)=>{ e.preventDefault(); closeDialog(overlay); };
    
      render();
      // open as a true modal with backdrop
      if (overlay) openDialog(overlay);
    }
  


    function updateAddressesTextareaFromArray(arr = []) {
      const el = document.getElementById('edit_primaryAddress');
      if (!el) return;
      const compiled = formatAddressesForTextarea(Array.isArray(arr) ? arr : []);
      el.value = compiled;
      el.dataset.empty = compiled.trim() ? '0' : '1';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

  // Reuse fmtTs(ts) you already have

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


  window.openEditTab = function(encodedData) {
    const payload = decodeBase64(encodedData) || {};

    // If caller didn't include addressesJson (or notesJson), grab them from the selected row
    if (!Array.isArray(payload.addressesJson)) {
      const p = getSelectedRowPayload();
      if (p && Array.isArray(p.addressesJson)) payload.addressesJson = p.addressesJson;
    }
    if (!Array.isArray(payload.notesJson)) {
      const p = getSelectedRowPayload();
      if (p && Array.isArray(p.notesJson)) payload.notesJson = p.notesJson;
    }

    const row = Array.isArray(payload) ? payload
            : (payload && Array.isArray(payload.row)) ? payload.row
            : [];
    let subscriberId = payload?.id ?? null;

    document.getElementById('editTabButton')?.style.setProperty('display','block');
    if (typeof showTab === 'function') showTab('editTab');
    else document.getElementById('editTab')?.style.setProperty('display','block');

    if (!subscriberId && row?.length && window.cachedSheetData?.results) {
      const hit = window.cachedSheetData.results.find(r => String(r?.row?.[0]) === String(row[0]));
      if (hit?.id) subscriberId = hit.id;
    }
    document.getElementById('edit_subscriber_id').value = subscriberId ?? '';

    // Fill normal fields
    document.getElementById('edit_pmb').value            = row[0] ?? '';
    document.getElementById('edit_firstName').value      = row[1] ?? '';
    document.getElementById('edit_lastName').value       = row[2] ?? '';
    document.getElementById('edit_company').value        = row[3] ?? '';
    document.getElementById('edit_phone').value          = row[4] ?? '';
    document.getElementById('edit_email').value          = row[5] ?? '';
    //document.getElementById('edit_primaryAddress').value = row[6] ?? '';

    const setSel = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g,' ').trim();
      const target = norm(value);
      let matched = false;
      for (const opt of Array.from(el.options)) {
        if (norm(opt.value) === target || norm(opt.textContent) === target) { el.value = opt.value; matched = true; break; }
      }
      if (!matched) el.value = value ?? '';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setSel('edit_status', row[7]);
    setSel('edit_source', row[8]);
    setSel('edit_bcg',    row[9]);

    // Textarea now shows ALL notes (with timestamp) compiled from notesJson
    const notesJson = Array.isArray(payload?.notesJson) ? payload.notesJson : [];
    const notesEl = document.getElementById('edit_notes');
    const compiled = formatNotesForTextarea(notesJson);
    notesEl.value = compiled;
    notesEl.dataset.empty = compiled.trim() ? '0' : '1';

    // Reset modal state for this edit session
    window._currentNotesJson = JSON.parse(JSON.stringify(notesJson)); // deep copy
    window._editNotes = null;
    window._editNotesDirty = false;

    // Clicking/focusing the notes textarea opens the modal (no captured array)
    if (notesEl && !notesEl.dataset.wiredModal) {
      const open = () => openNotesEditor(subscriberId);
      notesEl.addEventListener('focus', open);
      notesEl.addEventListener('click',  open);
      notesEl.dataset.wiredModal = '1';
    }

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

      // open modal on focus/click (same as notes)
      if (!addrEl.dataset.wiredModal) {
        const openA = () => openAddressesEditor(subscriberId);
        addrEl.addEventListener('focus', openA);
        addrEl.addEventListener('click',  openA);
        addrEl.dataset.wiredModal = '1';
      }
    }

    //
    snapshotOriginalEditState();

  };


  function updateNotesTextareaFromArray(arr = []) {
    const notesEl = document.getElementById('edit_notes');
    if (!notesEl) return;

    // Reuse your formatter (newest first, includes timestamps)
    const compiled = formatNotesForTextarea(Array.isArray(arr) ? arr : []);
    notesEl.value = compiled;
    notesEl.dataset.empty = compiled.trim() ? '0' : '1';

    // If you have listeners depending on this, fire a change event
    notesEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openNotesEditor(subscriberId) {
    const overlay   = document.getElementById('notesModal');
    const list      = document.getElementById('notesList');
    const addBtn    = document.getElementById('addNoteBtn');
    const saveBtn   = document.getElementById('saveNotesBtn');
    const cancelBtn = document.getElementById('cancelNotesBtn');
    const closeBtn  = document.getElementById('closeNotesBtn');
  
    // Who’s editing (used to stamp provisional meta on new notes for UI)
    const modUser =
      (window.currentUser && String(window.currentUser)) ||
      (typeof userEmail !== 'undefined' && String(userEmail)) ||
      'web';
  
    // Always open from UI snapshot (no deleted rows),
    // not from _editNotes (which may contain {deleted:true} entries)
    let notes = Array.isArray(window._currentNotesJson)
      ? window._currentNotesJson.map(n => ({ ...n }))  // shallow clone
      : [];
  
    // Sort existing notes by id desc[MIN_SAFE_INTEGER] [asc(MAX_SAFE_INTEGER)] as a stable order for editing
    notes.sort((a, b) =>
      (b.note_id ?? Number.MIN_SAFE_INTEGER) - (a.note_id ?? Number.MIN_SAFE_INTEGER)
    );
  
    const fmtTsLocal = ts => ts ? new Date(ts).toLocaleString() : '';
  
    function render() {
      if (!list) return;
      list.replaceChildren();
  
      notes.forEach((n, idx) => {
        const card = document.createElement('div');
        card.className = 'note-card';
  
        // top row: meta + delete/undo (we just show delete; undo isn’t needed in UI snapshot)
        const top = document.createElement('div');
        top.className = 'note-card__top';
  
        const meta = document.createElement('div');
        meta.className = 'note-card__meta';
        meta.textContent = [
          n.note_user_id ? `by ${n.note_user_id}` : '',
          n.note_ts ? `@ ${fmtTsLocal(n.note_ts)}` : ''
        ].filter(Boolean).join('  ');
  
        const del = document.createElement('button');
        del.className = 'btn btn--danger';
        del.type = 'button';
        del.textContent = 'Delete';

        const ta = document.createElement('textarea');
        ta.className = 'note-text';
        ta.rows = 2;
        ta.value = n.note_text ?? '';
        ta.addEventListener('input', e => { n.note_text = e.target.value; });

        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
        });
        
        if (isSystemNote(n)) {
          del.disabled = true;
          del.title = 'System-generated note cannot be deleted';
          del.style.opacity = '.5';
          del.style.cursor = 'not-allowed';822
          // lock it but allow copy/select
          ta.readOnly = true;
          ta.setAttribute('aria-readonly', 'true');
          ta.classList.add('note-text--locked');
          ta.title = 'System-generated note (read-only)';
        } else {
          del.onclick = () => { notes.splice(idx, 1); render(); };
        }      
  
        top.append(meta, del);
        
  
        card.append(top, ta);
        list.appendChild(card);
      });
    }
  
    // Rebind handlers fresh each open (no stale closures)
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.preventDefault();
        // Add a new in-UI note with provisional user + timestamp at the top
        notes.unshift({
          note_id: null,
          note_text: '',
          note_user_id: modUser,
          note_ts: new Date().toISOString()
        });
        /* below adds it at bottom
        // Add a new in-UI note with provisional user + timestamp
        notes.push({
          note_id: null,
          note_text: '',
          note_user_id: modUser,
          note_ts: new Date().toISOString()
        });
        */
        render();
      };
    }
  
    if (saveBtn) {
      saveBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
  
        // Build a RAW list with meta from current UI state
        const raw = notes.map(n => ({
          note_id:      n.note_id ?? null,
          note_text:    String(n.note_text ?? '').trim(),
          note_user_id: n.note_user_id || modUser,
          note_ts:      n.note_ts || new Date().toISOString()
        }));
  
        // Build payload (adds/edits); deletes are inferred by comparing with original snapshot:
        // - Anything that existed (had note_id) but is missing now → send as {note_id, deleted:true}
        // - Anything with note_id present → {note_id, note_text}
        // - Anything with note_id null → {note_id:null, note_text}
        const before = Array.isArray(window._currentNotesJson)
          ? window._currentNotesJson
          : [];
  
        const beforeById = new Map(
          before.filter(n => n.note_id != null).map(n => [Number(n.note_id), n])
        );
        const afterById = new Map(
          raw.filter(n => n.note_id != null).map(n => [Number(n.note_id), n])
        );
  
        const payloadDraft = [];
  
        // 1) existing notes still present → update (text may or may not have changed, server can ignore no-op)
        for (const [id, n] of afterById.entries()) {
          payloadDraft.push({ note_id: id, note_text: n.note_text });
        }
  
        // 2) existing notes removed → delete
        for (const [id, n] of beforeById.entries()) {
          if (!afterById.has(id)) {
            payloadDraft.push({ note_id: id, deleted: true });
          }
        }
  
        // 3) brand-new notes (no id) → insert
        for (const n of raw) {
          if (n.note_id == null && n.note_text) {
            payloadDraft.push({ note_id: null, note_text: n.note_text });
          }
        }
  
        // after you collect notes into `notes`
        window._editNotes = notes.map(n => ({
          note_id: n.note_id ?? null,
          note_text: String(n.note_text || '').trim(),
          note_type_cd: (n.note_type_cd && String(n.note_type_cd).toLowerCase() === 'system') ? 'system' : 'user'
        }));

        // Final sanitize (drops blanks, dup new texts, etc.)
        window._editNotes = sanitizeNotesArray(payloadDraft);
        
        window._editNotesDirty = true;
  
        // Update the UI snapshot (what we reopen with) = current notes (raw), no deletes
        window._currentNotesJson = raw;
  
        // Rebuild textarea (timestamps included) from current UI JSON
        updateNotesTextareaFromArray(window._currentNotesJson);
  
        closeDialog(overlay);
      };
    }
  
    if (cancelBtn) {
      cancelBtn.onclick = (e) => { e.preventDefault(); closeDialog(overlay); };
    }
    if (closeBtn) {
      closeBtn.onclick = (e) => { e.preventDefault(); closeDialog(overlay); };
    }
  
    render();
    // open as a true modal with backdrop
    if (overlay) openDialog(overlay);
  }


  function waitForsearch() {
    return new Promise((resolve, reject) => {
      const now = new Date().getTime();
      searchData();
    });
  }

  // Execute search with spinner handling
  function executeSearchWaitForResults() {
    waitForsearch().then(() => {
      toggleLoading(false);
    }).catch(() => {
      toggleLoading(false);
    });
  }


  async function refetchDataAfterUpdate() {
    toggleLoading(true);
    try {
      if (typeof loadAll === 'function') {
        await loadAll();              // full reload first
      }
      if (typeof executeSearchWaitForResults === 'function') {
        executeSearchWaitForResults();  // then reapply filters (optional)
      }
    } finally {
      toggleLoading(false);
    }
  }


  
  


  function escapeJS(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\\/g, '\\\\')       // Escape backslashes
              .replace(/'/g, "\\'")         // Escape single quotes
              .replace(/"/g, '\\"')         // Escape double quotes
              .replace(/\n/g, '\\n')        // Escape newlines
              .replace(/\r/g, '\\r')        // Escape carriage returns
              .replace(/\t/g, '\\t');       // Escape tabs
  }



  function escapeHTML(text) {
    if (typeof text !== 'string') {
      if (text === undefined || text === null) {
        return '';  // Return empty string if undefined or null
      }
      text = text.toString();  // Convert numbers or other types to string
    }
    
    return text.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
  }

let debounceTimer;
let correctSource = '';
let searchCorrectSource = '';
let userEmail = '';

// --- Utilities ---
function toggleLoading(show) {
  const el = document.getElementById('loadingModal');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function val(id) {
  const el = document.getElementById(id);
  return (el && typeof el.value === 'string') ? el.value.trim() : '';
}

// Read filters from your Search form controls (IDs from your HTML)
function getFilters() {
  const f = {
    pmb:            val('pmb'),
    source:         val('source'),
    firstName:      val('firstName'),
    lastName:       val('lastName'),
    company:        val('company'),
    phone:          val('phone'),
    email:          val('email'),
    primaryAddress: val('primaryAddress'),
    status:         val('status'),
    bcg:            val('bcg')
  };
  if (f.status) f.status = f.status.toLowerCase();
  Object.keys(f).forEach(k => { if (!f[k]) delete f[k]; });
  return f;
}

// --- Fetch ALL on page load ---
async function loadAll() {
  toggleLoading(true);
  try {
    const r = await fetch('/evotechmail/api/fetch-all?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    window.cachedSheetData = data;
    await load_lookups_and_populate();  // ← fill dropdowns from DB
    await loadHeaderValues();  // optional counters
    displayResults(data);
  } catch (e) {
    console.error(e);
  } finally {
    toggleLoading(false);
  }
}


  // --- Header summaries: print + render ---
  async function loadHeaderValues() {
    try {
      const r = await fetch('/evotechmail/api/header-values');
      if (!r.ok) {
        console.error('header-values HTTP', r.status, await r.text().catch(() => ''));
        return;
      }
      const values = await r.json();

      // Always print what the API returned
      //console.log('header-values:', values);

      // If you still have a custom renderer, let it run
      if (typeof window.displaySheetValues === 'function') {
        await window.displaySheetValues(values);
      }

      // 1) New string fields (create targets if missing)
      const activeStr = values["Active Subscribers"] || '';
      const allStr    = values["All Subscribers"] || '';
      const bcgStr    = values["USPS BCG Actions"] || '';

      // Helper to find or create a <pre> target
      const ensureBlock = (id, title) => {
        let wrap = document.getElementById(id);
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.id = id;
          // Try to place near counters if they exist; else append to body
          const counters = document.getElementById('counters') || document.body;
          counters.appendChild(wrap);
        }
        // Minimal structure: title + pre
        if (!wrap._built) {
          wrap.innerHTML = `
            <h3 style="margin:8px 0 4px 0">${title}</h3>
            <pre style="white-space:pre-wrap;margin:0"></pre>
          `;
          wrap._built = true;
        }
        return wrap.querySelector('pre');
      };

      if (activeStr) ensureBlock('activeSubscribersBlock', 'Active Subscribers').textContent = activeStr;
      if (allStr)    ensureBlock('allSubscribersBlock',    'All Subscribers').textContent    = allStr;
      if (bcgStr)    ensureBlock('uspsBcgActionsBlock',    'USPS BCG Actions').textContent   = bcgStr;

    } catch (e) {
      console.error('loadHeaderValues error:', e);
    }
  }

// --- Search with form filters ---
async function searchData() {
  try {
    toggleLoading(true);
    const filters = getFilters();
    const r = await fetch('/evotechmail/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters || {})
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    displayResults(data);
  } catch (e) {
    console.error('Search error:', e);
  } finally {
    toggleLoading(false);
  }
}

  // Free search across all columns (safe for nulls)
  async function filterFreeSearch() {
    const searchInput = document.getElementById('freeSearchInput');
    if (!searchInput) return; // input not on page

    const raw = searchInput.value || '';
    const query = raw.toLowerCase().trim();
    const caret = (typeof searchInput.selectionStart === 'number') ? searchInput.selectionStart : null;

    const all = Array.isArray(window.cachedSheetData?.results) ? window.cachedSheetData.results : [];

    if (!query) {
      renderFilteredTable(all, {}, -1, caret, raw, 'freeSearchInput');
      return;
    }

    const words = query.split(/\s+/).filter(Boolean);

    // Preserve scroll position (if the tab exists)
    const tabEl = document.getElementById('tabularSearchTab');
    const scrollTop = tabEl ? tabEl.scrollTop : 0;

    const filteredResults = all.filter(item => {
      const cols = Array.isArray(item?.row) ? item.row : [];
      // every word must appear in at least one column
      return words.every(word =>
        cols.some(cell => String(cell ?? '').toLowerCase().includes(word))
      );
    });

    renderFilteredTable(filteredResults, {}, -1, caret, raw, 'freeSearchInput');
    if (tabEl) tabEl.scrollTop = scrollTop;
  }


  // Column-by-column filters (safe for nulls and when nothing focused)
  async function filterTabularResults(event) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const inputs = document.querySelectorAll('#tabularSearchTab input, #tabularSearchTab select');

      const active = document.activeElement;
      const activeIndex = Array.from(inputs).indexOf(active);
      const caret = (active && active.tagName === 'INPUT') ? active.selectionStart : null;

      const filters = {};
      inputs.forEach(input => {
        const key = input.dataset.column || '';
        filters[key] = (input.value || '').toLowerCase();
      });

      const headers = Array.isArray(window.cachedSheetData?.headers) ? window.cachedSheetData.headers : [];
      const rows    = Array.isArray(window.cachedSheetData?.results) ? window.cachedSheetData.results : [];

      const filteredResults = rows.filter(item => {
        const row = Array.isArray(item?.row) ? item.row : [];
        return headers.every((header, index) => {
          const filterValue = filters[header];
          if (!filterValue) return true;
          const cellValue = String(row[index] ?? '').toLowerCase(); // <- safe coercion
          return cellValue.includes(filterValue);
        });
      });

      renderFilteredTable(filteredResults, filters, activeIndex, caret);
    }, 300);
  }

  
  async function renderFilteredTable(filteredResults, filters = {}, activeInputIndex, caretPosition, searchQuery = '', lastFocusedId = '') {
    const tabContent = document.getElementById('freeSearchTableContainer');
    if (!tabContent) return;
    tabContent.innerHTML = '';
  
    const table = document.createElement('table');
    table.classList.add('result-table');
  
    // ---- Header row (filters) ----
    const headerRow = document.createElement('tr');
    const headers = Array.isArray(cachedSheetData?.headers) ? cachedSheetData.headers : [];
  
    // Local helper to build a DB-driven select (values = lowercased labels; data-code = canonical code)
    const buildLookupHeaderSelect = (headerName, items, currentLC) => {
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">${headerName}</option>`;
      (items || []).forEach(({ code, label }) => {
        const opt = document.createElement('option');
        opt.value = String(label || '').toLowerCase();
        opt.textContent = label || code || '';
        opt.dataset.code = code || '';
        if (currentLC && opt.value === currentLC) opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    };
  
    headers.forEach(header => {
      const th = document.createElement('th');
      const h = String(header || '').trim().toLowerCase();
      const currentLC = String(filters?.[header] || '').toLowerCase();
  
      if (h === 'source' || h === 'bcg' || h === 'status') {
        let items = [];
        if (h === 'source') items = window._lookups?.sources || [];
        if (h === 'bcg')    items = window._lookups?.bcg || [];
        if (h === 'status') items = window._lookups?.statuses || [];
  
        const select = buildLookupHeaderSelect(header, items, currentLC);
        select.dataset.column = header;
        select.id = `filter_${header}`;
        select.addEventListener('change', (event) => {
          lastFocusedId = event.target.id;
          filterTabularResults();
        });
        th.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Filter ${header}`;
        input.dataset.column = header;
        input.id = `filter_${header}`;
        input.value = filters?.[header] || '';
        input.addEventListener('input', (event) => {
          lastFocusedId = event.target.id;
          filterTabularResults();
        });
        th.appendChild(input);
      }
  
      headerRow.appendChild(th);
    });
  
    table.appendChild(headerRow);
  
    // ---- Body rows ----
    (filteredResults || []).forEach(item => {
      const row = document.createElement('tr');
      row.className = item.isActive ? '' : 'inactive-row';
      (item.row || []).forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        row.appendChild(td);
      });
      table.appendChild(row);
    });
  
    tabContent.appendChild(table);
  
    // ---- Restore focus/caret ----
    setTimeout(() => {
      if (lastFocusedId) {
        const el = document.getElementById(lastFocusedId);
        if (el) {
          el.focus();
          if (caretPosition != null && typeof el.setSelectionRange === 'function') {
            el.setSelectionRange(caretPosition, caretPosition);
          }
        }
      }
    }, 0);
  }
  


  // Add Tabular Search Tab — DB-driven lookups
async function renderTabularSearch() {
  const tabContent = document.getElementById('freeSearchTableContainer');
  if (!tabContent) return;
  tabContent.innerHTML = '';

  const table = document.createElement('table');
  table.classList.add('result-table');

  // Header row with filters
  const headerRow = document.createElement('tr');
  const headers = Array.isArray(cachedSheetData?.headers) ? cachedSheetData.headers : [];

  const buildLookupHeaderSelect = (headerName, items) => {
    const sel = document.createElement('select');
    sel.innerHTML = `<option value="">${headerName}</option>`;
    (items || []).forEach(({ code, label }) => {
      const opt = document.createElement('option');
      opt.value = String(label || '').toLowerCase(); // filtering uses label text includes
      opt.textContent = label || code || '';
      opt.dataset.code = code || '';
      sel.appendChild(opt);
    });
    return sel;
  };

  headers.forEach(header => {
    const th = document.createElement('th');
    const h = String(header || '').trim().toLowerCase();

    if (h === 'source' || h === 'bcg' || h === 'status') {
      let items = [];
      if (h === 'source') items = window._lookups?.sources || [];
      if (h === 'bcg')    items = window._lookups?.bcg || [];
      if (h === 'status') items = window._lookups?.statuses || [];

      const select = buildLookupHeaderSelect(header, items);
      select.dataset.column = header;
      select.id = `filter_${header}`;
      select.addEventListener('change', filterTabularResults);
      th.appendChild(select);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `${header}`;
      input.dataset.column = header;
      input.id = `filter_${header}`;
      input.addEventListener('input', filterTabularResults);
      th.appendChild(input);
    }

    headerRow.appendChild(th);
  });

  table.appendChild(headerRow);

  // Body rows
  const rows = Array.isArray(cachedSheetData?.results) ? cachedSheetData.results : [];
  rows.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = item.isActive ? '' : 'inactive-row';
    (item.row || []).forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  tabContent.appendChild(table);
}


  async function showTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');

    // Show the selected tab content
    document.getElementById(tabId).style.display = 'block';

    // Remove 'active' class from all tabs
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    // Add 'active' class to the selected tab using data attribute
    const selectedTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (selectedTab) {
      selectedTab.classList.add('active');
    } else {
      console.warn(`Tab with ID ${tabId} not found.`);
    }

    // Render Tabular Search content when its tab is selected
    if (tabId === 'tabularSearchTab') {
      renderTabularSearch();
    }
  } 

  async function clearAddForm() {
    document.querySelectorAll('#addTab input[type="text"], #addTab textarea').forEach(input => input.value = '');
    document.getElementById('add_bcg').value = 'New';
    document.getElementById('add_source').value = '';
    document.getElementById('add_status').value = '';
  }

  async function clearSearchForm() {
    document.querySelectorAll('#searchTab input[type="text"], #searchTab textarea').forEach(input => input.value = '');
    document.getElementById('bcg').value = '';
    document.getElementById('source').value = '';
    document.getElementById('status').value = '';
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

  async function forceCorrectSource() {
      const sourceField = document.getElementById('add_source');
      if (sourceField.value !== correctSource) {
        sourceField.value = correctSource;
      }
  }

  async function autoPopulateSearchSource(){
      const pmb = parseInt(document.getElementById('pmb').value, 10);
      const sourceField = document.getElementById('source');

      if (pmb >= 100 && pmb <= 499) {
        searchCorrectSource = 'PostScanMail';
      } else if (pmb >= 500 && pmb <= 899) {
        searchCorrectSource = 'AnyTimeMailBox';
      } else if (pmb >= 900 && pmb <= 1299) {
        searchCorrectSource = 'iPostal';
      } else if (pmb >= 1300) {
        searchCorrectSource = 'Davinci';
      } else {
        searchCorrectSource = 'Owner';
      }

      sourceField.value = searchCorrectSource;
  }

  function forceSearchCorrectSource() {
    const pmbField = document.getElementById('pmb');
    const sourceField = document.getElementById('source');
    const pmbValue = pmbField.value.trim();

    if (pmbValue === '') {
      // If PMB is empty, allow any source selection
      return;
    }

    if (sourceField.value !== searchCorrectSource) {
      sourceField.value = searchCorrectSource;
    }
  }

  function validatePMB(pmb) {
      return /^\d+$/.test(pmb);
  }

  function validateEmail(input) {
    const parts = String(input || '')
      .split(/[;,]/)          // split on comma or semicolon
      .map(s => s.trim())     // trim spaces
      .filter(Boolean);       // drop empties
  
    if (parts.length === 0) return false;
  
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return parts.every(e => re.test(e));
  }

  function showError(message) {
      showErrorModal(message);  // Reusing the existing modal for displaying validation errors
  }

  function displayError(error) {
    toggleLoading(false);
    const message = (typeof error === 'string') ? error : error?.message || 'Unknown error';
    showErrorModal(message);
  }


// === Change tracking helpers ===
function _norm(s){ return String(s ?? '').replace(/\s+/g,' ').trim(); }

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
  window._editOriginal = _editFormState();
  // deep copy the addresses snapshot we populate in openEditTab
  window._baselineAddressesJson = JSON.parse(JSON.stringify(window._currentAddressesJson || []));
}

function diffFields(before={}, after={}, opts={}){
  const labels = {
    firstName:'First Name', lastName:'Last Name', company:'Company',
    phone:'Phone', email:'Email', /* primaryAddress intentionally ignored */
    status:'Status', source:'Source', bcg:'BCG'
  };
  const ignore = new Set(['primaryAddress', ...(opts?.ignore||[])]);
  const out = [];
  const _norm = s => String(s ?? '').replace(/\s+/g,' ').trim();

  for (const k of Object.keys(labels)){
    if (ignore.has(k)) continue;
    if (_norm(before[k]) !== _norm(after[k])) {
      const from = _norm(before[k]) || '∅';
      const to   = _norm(after[k])  || '∅';
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

// Capture original field values + address map (structured)
window._editOriginal = {
  firstName: edit_firstName.value, lastName: edit_lastName.value,
  company: edit_company.value, phone: edit_phone.value,
  email: edit_email.value, /* primaryAddress intentionally omitted */
  status: edit_status.value, source: edit_source.value, bcg: edit_bcg.value
};
// Deep copy of the current structured addresses map you maintain in the editor
window._baselineAddressesJson = JSON.parse(JSON.stringify(window._currentAddressesJson || []));



function summarizeAddressChanges(before=[], after=[]){
  const alive = x => x && !x.deleted;
  const normLine = x => _norm(x?.address_line_1 || '');
  const B = (before||[]).filter(alive), A = (after||[]).filter(alive);

  const bSet = new Set(B.map(normLine).filter(Boolean));
  const aSet = new Set(A.map(normLine).filter(Boolean));

  let added=0, removed=0;
  for (const v of aSet) if (!bSet.has(v)) added++;
  for (const v of bSet) if (!aSet.has(v)) removed++;

  const pickPrimary = arr => {
    const p = arr.find(z => z.is_primary && !z.deleted) || arr[0];
    return p ? _norm(p.address_line_1) : '';
  };
  const pB = pickPrimary(B), pA = pickPrimary(A);

  const bits = [];
  if (pB || pA) {
    if (pB !== pA) bits.push(`primary "${pB || '∅'}" → "${pA || '∅'}"`);
  }
  if (added || removed) bits.push(`${added} added${removed ? `, ${removed} removed` : ''}`);

  return bits.length ? `Addresses: ${bits.join('; ')}` : '';
}


  function isSystemNote(n){
    return (String(n?.note_type_cd || '')).toLowerCase() === 'system';
  }


  
  async function updateSubscriber() {
    const email = (document.getElementById('edit_email').value || '').trim();

    //only validate if it is not null
    if (email && !validateEmail(email)) {
      (typeof showErrorModal === 'function' ? showErrorModal : alert)('Please enter a valid email address.');
      return;
    }
    
  
    const subscriberId = document.getElementById('edit_subscriber_id')?.value;
    if (!subscriberId) {
      (typeof showErrorModal === 'function' ? showErrorModal : alert)('Missing subscriber_id for update.');
      return;
    }

    const firstName = document.getElementById('edit_firstName').value.trim();
    const lastName  = document.getElementById('edit_lastName').value.trim();
    const phone     = document.getElementById('edit_phone').value.trim();
  
    if (!firstName) {
      showErrorModal('Please enter a First Name.');
      return false;
    }
    if (!lastName) {
      showErrorModal('Please enter a Last Name.');
      return false;
    }
    if (!phone) {
      showErrorModal('Please enter a Phone number.');
      return false;
    }
  
    const modUser =
      (window.currentUser && String(window.currentUser)) ||
      (typeof userEmail !== 'undefined' && String(userEmail)) ||
      'web';
  
    const useJson = Array.isArray(window._editNotes) && window._editNotesDirty;
    //alert(useJson);
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
  
    // Only send notesJson when the modal was saved this session
    if (useJson) payload.notesJson = sanitizeNotesArray(window._editNotes);

    // NEW: send addresses when saved in this session
    const useAddr = Array.isArray(window._editAddresses) && window._editAddressesDirty;
    //alert(useAddr);
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

    


  
    const updateBtn = document.getElementById('updateSubscriberBtn');
    if (updateBtn) updateBtn.disabled = true;
  
    toggleLoading(true);
    try {
      const r = await fetch(`/evotechmail/api/subscribers/by-id/${encodeURIComponent(subscriberId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
  
      const ok = r.ok;
      const ct = r.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await r.json() : await r.text();
      if (!ok) throw new Error(body?.error || (typeof body === 'string' ? body : 'Update failed'));
  
      (typeof showErrorModal === 'function' ? showErrorModal : alert)('Subscriber updated successfully!');
  
      // Reset modal + state so next edit starts fresh
      resetNotesEditorState(); // if you added earlier helper; otherwise inline the few lines
  
      // Go back + refresh data (or hard reload if you prefer)
      const btn = document.getElementById('editTabButton');
      if (btn) btn.style.display = 'none';
      if (typeof showTab === 'function') showTab('searchTab');
  
      await refetchDataAfterUpdate();
      await loadHeaderValues();
      // or: window.location.reload();
  
    } catch (e) {
      (typeof showErrorModal === 'function' ? showErrorModal : alert)('Error updating subscriber: ' + (e?.message || String(e)));
    } finally {
      toggleLoading(false);
      if (updateBtn) updateBtn.disabled = false;
    }
  }
  

  function resetNotesEditorState({ clearTextarea = false, alsoClose = true } = {}) {
    const dlg = document.getElementById('notesModal');
    if (alsoClose && dlg) closeDialog(dlg);  // use dialog API only
  
    // Clear rendered cards
    const list = document.getElementById('notesList');
    if (list) (list.replaceChildren ? list.replaceChildren() : (list.innerHTML = ''));
  
    // Reset notes state only
    window._editNotes = null;
    window._editNotesDirty = false;
    window._currentNotesJson = [];
  
    // Sync compact textarea + empty flag
    const notesEl = document.getElementById('edit_notes');
    if (notesEl) {
      if (clearTextarea) notesEl.value = '';
      notesEl.dataset.empty = notesEl.value.trim() ? '0' : '1';
    }
  }
  
  

  

  // Format date as "YYYY-MM-DD HH:mm"
  function fmtTs(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  
  

  // Wire up: auto-load + button click
  document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();           // fetches on page load ✅

    const btn = document.getElementById('searchButton');
    if (btn && !btn._wired) {
      btn.addEventListener('click', (e) => { e.preventDefault(); searchData(); });
      btn._wired = true;
    }
  });

  document.addEventListener('keydown', function(event) {
    //console.log(`Key pressed: ${event.key}`);  // Check if Enter is being detected

    // Skip when a modal is open or the event target is inside it
    const inModal = event.target.closest('#notesModal, #addressesModal');
    const isOpen = (id) => {
      const el = document.getElementById(id);
      return el && getComputedStyle(el).display !== 'none';
    };

    if (inModal || isOpen('notesModal') || isOpen('addressesModal')) return;

    if (event.key === 'Enter' && !event.shiftKey) {
      //const activeTab = document.querySelector('.tab.active').id;
      const activeTab = document.querySelector('.tab.active').dataset.tab;
      //console.log(`Active Tab: ${activeTab}`);  // See which tab is active

      if (activeTab === 'searchTab') {
        searchData();
      } else if (activeTab === 'addTab') {
        //addSubscriber();
        checkAndAddRecord();
      } else if (activeTab === 'editTab') {
        updateSubscriber();
      }
    }
  });

// keep searchData globally available for inline onclick="searchData()"
window.searchData = searchData;



// ---- Lookups (globals) ----
window._lookups = { sources: [], statuses: [], bcg: [] };

async function load_lookups_and_populate() {
  try {
    const r = await fetch('/evotechmail/api/lookups', { cache: 'no-store' });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    window._lookups = {
      sources:  Array.isArray(data.sources)  ? data.sources  : [],
      statuses: Array.isArray(data.statuses) ? data.statuses : [],
      bcg:      Array.isArray(data.bcg)      ? data.bcg      : [],
    };

    // Search tab
    populate_select('#source',  window._lookups.sources,  'Select Source');
    populate_select('#status',  window._lookups.statuses, 'Select Status');
    populate_select('#bcg',     window._lookups.bcg,      'Select BCG');

    // Add tab
    populate_select('#add_source', window._lookups.sources,  'Select Source');
    populate_select('#add_status', window._lookups.statuses, 'Select Status');
    //populate_select('#add_bcg',    window._lookups.bcg,      'Select BCG');

    // Edit tab
    populate_select('#edit_source', window._lookups.sources,  'Select Source');
    populate_select('#edit_status', window._lookups.statuses, 'Select Status');
    populate_select('#edit_bcg',    window._lookups.bcg,      'Select BCG');

  } catch (e) {
    console.error('load_lookups_and_populate:', e);
  }
}

// Fill a <select> with DB lookups, keep label as visible text.
// We keep .value = label (for backward compatibility) and store code in data-code.
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

// Helper: set a select by lookup code (falls back to label)
function set_select_by_code_or_label(selector, target) {
  const el = document.querySelector(selector);
  if (!el) return;
  const want = String(target || '').toLowerCase().trim();
  let matched = false;

  for (const opt of Array.from(el.options)) {
    const code = (opt.dataset.code || '').toLowerCase().trim();
    const label = (opt.textContent || '').toLowerCase().trim();
    if (code === want || label === want) {
      el.value = opt.value;
      matched = true;
      break;
    }
  }
  if (!matched) el.value = '';
  el.dispatchEvent(new Event('change', { bubbles: true }));
}



async function inactivateSubscriber(subscriber_id) {
  if (!subscriber_id) {
    showErrorModal('subscriber_id is required.');
    return;
  }

  toggleLoading(true);
  try {
    const url = `/evotechmail/api/subscribers/${encodeURIComponent(subscriber_id)}/inactivate`;
    const r = await fetch(url, { method: 'POST' });
    const t = await r.text();
    if (!r.ok) throw new Error(t || 'Request failed');

    // reflect only BCG in UI (no status change)
    if (typeof set_select_by_code_or_label === 'function') {
      set_select_by_code_or_label('#edit_bcg', 'closed');
    }

    await refetchDataAfterUpdate();
    if (typeof searchData === 'function') searchData();
    showErrorModal(t || `Subscriber ${subscriber_id} BCG set to 'closed'.`);
  } catch (e) {
    showErrorModal('Error during inactivation: ' + e.message);
  } finally {
    toggleLoading(false);
  }
}


async function reActivateSubscriber(subscriber_id) {
  if (!subscriber_id) {
    showErrorModal('subscriber_id is required.');
    return;
  }

  toggleLoading(true);
  try {
    const url = `/evotechmail/api/subscribers/${encodeURIComponent(subscriber_id)}/reactivate`;
    const r = await fetch(url, { method: 'POST' });
    const t = await r.text();
    if (!r.ok) throw new Error(t || 'Request failed');

    // reflect only BCG in UI (no status change)
    if (typeof set_select_by_code_or_label === 'function') {
      set_select_by_code_or_label('#edit_bcg', 'closed');
    }

    if (typeof searchData === 'function') searchData();
    showErrorModal(t || `Subscriber ${subscriber_id} BCG set to 'closed'.`);
    await refetchDataAfterUpdate();
  } catch (e) {
    showErrorModal('Error during inactivation: ' + e.message);
  } finally {
    toggleLoading(false);
  }
}





// Helper: single-line the address textarea
function toOneLineAddress(s) {
  return String(s || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function checkAndAddRecord() {

  const pmb   = (document.getElementById('add_pmb').value || '').trim();
  if (!/^\d+$/.test(pmb)) {
    showErrorModal('Please enter a valid numeric PMB.');
    return;
  }

  const email = (document.getElementById('add_email').value || '').trim();
  //only validate if it is not null
  if (email && !validateEmail(email)) {
    (typeof showErrorModal === 'function' ? showErrorModal : alert)('Please enter a valid email address.');
    return;
  }

  // Prefer lookup codes (dataset.code); fall back to label/value
  const srcEl = document.getElementById('add_source');
  const stEl  = document.getElementById('add_status');

  const source = srcEl?.selectedOptions?.[0]?.dataset?.code || (srcEl?.value || '').trim();
  const status = stEl?.selectedOptions?.[0]?.dataset?.code || (stEl?.value  || '').trim();

  if (!status) {
    showErrorModal('Please select a Status.');
    return;
  }
  if (!source) {
    showErrorModal('Please select a Source.');
    return;
  }

  const firstName = document.getElementById('add_firstName').value.trim();
  const lastName  = document.getElementById('add_lastName').value.trim();
  const phone     = document.getElementById('add_phone').value.trim();

  if (!firstName) {
    showErrorModal('Please enter a First Name.');
    return false;
  }
  if (!lastName) {
    showErrorModal('Please enter a Last Name.');
    return false;
  }
  if (!phone) {
    showErrorModal('Please enter a Phone number.');
    return false;
  }

  // require primary address (after you validate status/source, before building payload)
  const addrEl = document.getElementById('add_primaryAddress');
  const primaryAddressOneLine = toOneLineAddress(addrEl.value);
  if (!primaryAddressOneLine) {
    showErrorModal('Primary Address is required.');
    addrEl.focus({ preventScroll: true });
    addrEl.scrollIntoView({ block: 'center' });
    return;
  }

  // Optional pre-check on the client (fast feedback)
  try {
    const dup = (window.cachedSheetData?.results || []).some(it => {
      const r = Array.isArray(it.row) ? it.row : [];
      const samePMB = String(r[0] ?? '').trim() === pmb;
      const rowStatus = String(r[7] ?? '').toLowerCase().trim(); // "Status" column
      const wantStatus = String(status).toLowerCase().trim();
      return samePMB && rowStatus === wantStatus && rowStatus !== 'closed';
    });
    if (dup) {
      showErrorModal(`A non-closed subscriber with PMB ${pmb} and status '${status}' already exists.`);
      return;
    }
  } catch { /* ignore client pre-check errors */ }

  const payload = {
    pmb,
    firstName:      document.getElementById('add_firstName').value || '',
    lastName:       document.getElementById('add_lastName').value  || '',
    company:        document.getElementById('add_company').value   || '',
    phone:          document.getElementById('add_phone').value     || '',
    email,
    status,
    source,
    primaryAddress: toOneLineAddress(document.getElementById('add_primaryAddress').value || ''),
    notes:          (document.getElementById('add_notes').value || '').trim()
  };

  toggleLoading(true);
  try {
    const r = await fetch('/evotechmail/api/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error(body?.error || (typeof body === 'string' ? body : 'Add failed'));

    showErrorModal(`Subscriber with pmb(${pmb})[id(${body.subscriber_id}) added successfully.`);
    clearAddForm();
    await refetchDataAfterUpdate();
    await loadHeaderValues();
    if (typeof showTab === 'function') showTab('searchTab');
  } catch (e) {
    showErrorModal('Error adding subscriber: ' + (e?.message || String(e)));
  } finally {
    toggleLoading(false);
  }
}


function decodePayload(b64){
  try { return JSON.parse(atob(b64)); } catch { return {}; }
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




// ---------- View modal open/close ----------
window.openViewFromBtn = function (btn) {
  const b64 = btn?.dataset?.encoded;
  if (!b64) { console.warn('eye button missing data-encoded'); return; }
  window.openViewModal(b64);
};

window.openViewModal = function (b64) {
  let payload;
  try {
    payload = (typeof decodeBase64 === 'function') ? decodeBase64(b64) : JSON.parse(atob(b64));
  } catch (e) {
    console.error('Failed to decode payload', e);
    showErrorModal('Could not open record.');
    return;
  }

  const row = payload.row || [];
  const [pmb, first, last, company, phone, email, primaryAddr, status, source, bcg] = row;

  // top fields
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('view_pmb', pmb);
  set('view_name', [first, last].filter(Boolean).join(' ') || 'Individual');
  set('view_company', company || 'Individual');
  set('view_phone', phone);
  set('view_email', email);
  set('view_status', status);
  set('view_source', source);
  set('view_bcg', bcg);

  // address + notes sources (payload → fallback to one-line addr → empty notes)
  const addrs = (Array.isArray(payload.addressesJson) && payload.addressesJson.length)
    ? payload.addressesJson
    : (primaryAddr ? [{ address_line_1: String(primaryAddr), is_primary: true }] : []);
  const notes  = Array.isArray(payload.notesJson) ? payload.notesJson : [];

  // inject HTML
  const addrEl  = document.querySelector('#view_addressesInline');
  const notesEl = document.querySelector('#view_notesInline');
  if (addrEl)  addrEl.innerHTML  = roRenderAddresses(addrs);
  if (notesEl) notesEl.innerHTML = roRenderNotes(notes, 20);

  // open dialog (native API only)
  const dlg = document.getElementById('viewModal');
  if (!dlg) return console.error('#viewModal not found');
  openDialog(dlg);  //  use the same helper everywhere

};


function wireModal(id, { outsideClickCloses = false } = {}) {
  const dlg = document.getElementById(id);
  if (!dlg || dlg._wired) return;
  dlg._wired = true;

  // ESC
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dlg); });

  // Backdrop click policy
  dlg.addEventListener('click', (e) => {
    const card = dlg.querySelector('.modal'); if (!card) return;
    const clickedOutside = !card.contains(e.target);
    if (clickedOutside) {
      if (outsideClickCloses) closeDialog(dlg);
      else e.stopPropagation(); // swallow so it won’t bubble to document
    }
  });

  // Make sure any stale styles are gone after a close (safety net)
  dlg.addEventListener('close', () => {
    dlg.removeAttribute('open');
    dlg.style.removeProperty('display');
  });
}

// wire once on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  ['viewModal','notesModal','addressesModal'].forEach(id =>
    wireModal(id, { outsideClickCloses: false })
  );
  const vdlg = document.getElementById('viewModal');
  document.getElementById('closeViewBtn') ?.addEventListener('click', () => closeDialog(vdlg));
  document.getElementById('closeViewBtn2')?.addEventListener('click', () => closeDialog(vdlg));
  
  const vdlgNotes = document.getElementById('notesModal');
  document.getElementById('closeNotesBtn') ?.addEventListener('click', () => closeDialog(vdlgNotes));
  
  const vdlgAddress = document.getElementById('addressesModal');
  document.getElementById('closeAddressesBtn') ?.addEventListener('click', () => closeDialog(vdlgAddress));
});






function roRenderAddresses(list = []) {
  if (!Array.isArray(list) || list.length === 0) {
    return '<div class="meta">No addresses.</div>';
  }

  const sorted = list.slice().sort((a,b)=>{
    if (!!b.is_primary !== !!a.is_primary) return (b.is_primary?1:0)-(a.is_primary?1:0);
    const at=a.last_mod_ts||a.create_ts, bt=b.last_mod_ts||b.create_ts;
    const aT=at?new Date(at).getTime():0, bT=bt?new Date(bt).getTime():0;
    if (bT!==aT) return bT-aT;
    return (b.address_id??0)-(a.address_id??0);
  });

  const rows = sorted
    .filter(a => !a.deleted)
    .map(a=>{
      const line = [
        a.address_line_1,
        a.address_line_2,
        [a.city, a.state_province].filter(Boolean).join(', '),
        a.postal_code,
        a.country
      ].filter(Boolean).join(', ').replace(/\s+/g,' ').trim();

      const metaPieces = [];
      if (a.last_mod_user_id || a.create_user_id) metaPieces.push(a.last_mod_user_id || a.create_user_id);
      const ts = a.last_mod_ts || a.create_ts;
      if (ts) metaPieces.push(new Date(ts).toLocaleString());
      const meta = metaPieces.join(' @ ');

      return `
        <div class="addr-card ro" style="border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff;margin-bottom:10px;">
          <div class="addr-top" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div class="addr-meta meta">${meta}</div>
            ${a.is_primary ? `<span class="badge" style="display:inline-block;padding:2px 8px;font-size:12px;border-radius:9999px;background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;">Primary</span>` : ''}
          </div>
          <div class="addr-line ro-value" style="white-space:pre-wrap;word-break:break-word;">
            ${(window.escapeHTML?escapeHTML(line):line) || ''}
          </div>
        </div>`;
    }).join('');

  return rows || '<div class="meta">No addresses.</div>';
}

function roRenderNotes(list = [], maxVisible = 20) {
  if (!Array.isArray(list) || list.length === 0) {
    return '<div class="meta">No notes.</div>';
  }
  const safe = list.slice(0, maxVisible);
  return safe.map(n=>{
    const who  = n.note_user_id || n.create_user_id || '';
    const when = n.note_ts ? new Date(n.note_ts).toLocaleString() : '';
    const meta = [who, when].filter(Boolean).join(' @ ');
    const text = (window.escapeHTML ? escapeHTML(n.note_text||'') : (n.note_text||''));
    return `
      <div class="note-card ro" style="border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#fff;margin-bottom:10px;">
        <div class="note-meta meta" style="margin-bottom:6px;">${meta}</div>
        <div class="note-text ro-value" style="white-space:pre-wrap;word-break:break-word;">${text}</div>
      </div>`;
  }).join('');
}


