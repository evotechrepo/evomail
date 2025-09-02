  document.addEventListener('DOMContentLoaded', async () => {
      await ensureCurrentUser();
      // your mail page init can go here
  });

  // wire smart phone picture take/select
  document.addEventListener('DOMContentLoaded', async () => {
    // Make the thumbnail open a neutral chooser (library + camera)
    $('thumb').addEventListener('click', (e) => {
      e.preventDefault();
      const fi = $('fileInput');
      fi.removeAttribute('capture');
      fi.click();
    });

    // Explicit "Take Photo" -> temporarily add capture
    $('takePhotoBtn').addEventListener('click', (e) => {
      e.preventDefault();
      const fi = $('fileInput');
      fi.setAttribute('capture', 'environment'); // rear camera hint
      fi.click();
      // remove right away so next open can show library if desired
      setTimeout(() => fi.removeAttribute('capture'), 0);
    });

    // Explicit "Choose from Library" -> ensure no capture
    $('chooseLibBtn').addEventListener('click', (e) => {
      e.preventDefault();
      const fi = $('fileInput');
      fi.removeAttribute('capture');
      fi.click();
    });
  });



async function populateMailTypes(){
    const sel = $('mailType');
    if (!sel) return;

    const prev = sel.value || '';   // preserve selection if reloading
    sel.disabled = true;
    sel.innerHTML = '<option value="" disabled selected>Loading…</option>';

    try {
      const r = await fetch('/evotechmail/api/lookups', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) throw new Error('lookups fetch failed');
      const j = await r.json();

      const list = Array.isArray(j.mailType) ? j.mailType : [];
      sel.innerHTML = ''; // clear

      // Create <option> elements
      for (const { code, label } of list) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = label || code;
        sel.appendChild(opt);
      }

      // Restore prior selection if still present, else pick first
      if (prev && list.some(x => x.code === prev)) {
        sel.value = prev;
      } else if (list.length) {
        sel.value = list[0].code;
      }
    } catch (e) {
      console.error('populateMailTypes:', e);
      // Fallback: if fetch failed and no options exist, add safe defaults
      if (!sel.options.length) {
        for (const [v,t] of [['LETTER','Letter'],['ENVELOPE','Envelope'],['LARGE_ENVELOPE','Large Envelope'],['PACKAGE','Package']]) {
          const opt = document.createElement('option');
          opt.value = v; opt.textContent = t; sel.appendChild(opt);
        }
      }
    } finally {
      sel.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateMailTypes();
  });


const api = {
list: () => fetch('/evotechmail/api/scan/subscribers', { credentials:'include' }).then(r=>r.json()),
upload: (fd) => fetch('/evotechmail/api/scan/upload', { method:'POST', body:fd, credentials:'include' }).then(r=>r.json()),
insert: (body)=> fetch('/evotechmail/api/scan/insert', {
  method:'POST', credentials:'include',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify(body)
}).then(r=>r.json())
};

let all = [];            // fetched once on first search
let selected = null;

const $ = id => document.getElementById(id);
const list = $('list');
const formCard = $('formCard');
const preview = $('preview');
const thumb = $('thumb');

function render(items){
list.innerHTML = '';
items.forEach(s => {
  const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
  const co = s.company ? `<span class="co">${s.company}</span>` : '';
  const el = document.createElement('div');
  el.className = 'pill';
  el.innerHTML = `
    <div class="left">
      <span class="pmb">PMB ${s.pmb}</span>
      <span class="name">${name || '(no name)'}</span>
      ${co}
    </div>
  `;
  el.addEventListener('click', () => selectSubscriber(s)); // WHOLE ROW CLICKABLE
  list.appendChild(el);
});
}

function selectSubscriber(s){
  selected = s;
  formCard.hidden = false;
  $('fileInput').value = '';
  preview.removeAttribute('src');
  thumb.classList.remove('has-img');
  const sm = $('saveMsg');
  if (sm) sm.textContent = `Selected PMB ${s.pmb}`;   // ← guard
  window.scrollTo({ top: formCard.offsetTop - 8, behavior: 'smooth' });
}


async function ensureLoaded(){
// called the first time user types; fetch list once
if (all.length) return;
await ensureCurrentUser();
const j = await api.list();
if (!j.ok) { alertModal('Failed to load list'); return; }
all = j.items || [];
$('loadedCount').textContent = `${all.length} subscribers loaded`;
}

// search-as-you-type (no list until user types)
let t=null;
$('q').addEventListener('input', async e => {
clearTimeout(t);
const val = e.target.value.trim().toLowerCase();
t = setTimeout(async () => {
  if (!val) { list.innerHTML = ''; return; } // empty query → empty list
  await ensureLoaded();
  const out = all.filter(s => {
    const pmb = String(s.pmb||'');
    const name = [s.first_name,s.last_name].filter(Boolean).join(' ').toLowerCase();
    const co = String(s.company||'').toLowerCase();
    return pmb.includes(val) || name.includes(val) || co.includes(val);
  });
  render(out);
}, 140);
});

$('refreshBtn').addEventListener('click', async () => {
all = []; list.innerHTML = '';              // clear and refetch on next search
$('loadedCount').textContent = '';
$('q').dispatchEvent(new Event('input'));   // re-trigger search with current term
});

  // click preview -> open camera/upload
//$('thumb').addEventListener('click', () => $('fileInput').click());

// file selection -> show image / placeholder toggle
$('fileInput').addEventListener('change', e => {
const f = e.target.files?.[0];
if (!f) { preview.removeAttribute('src'); $('thumb').classList.remove('has-img'); return; }
const url = URL.createObjectURL(f);
preview.src = url;
$('thumb').classList.add('has-img');
});

// clear under preview
$('clearImgBtn').addEventListener('click', () => {
$('fileInput').value = '';
preview.removeAttribute('src');
$('thumb').classList.remove('has-img');
});

function num(v){ return (v === '' || v == null) ? null : Number(v); }
function isPos(n){ return typeof n === 'number' && isFinite(n) && n > 0; }

async function validateBeforeInsert(){
// 1) subscriber selected
if (!selected?.subscriber_id) {
await alertModal('Please select a subscriber (tap a row).', { title: 'Missing Subscriber' });
return { ok:false };
}

// 2) image chosen
const f = $('fileInput').files?.[0];
if (!f) {
await alertModal('Please capture or upload a mail image.', { title: 'Image Required' });
return { ok:false };
}

// 3) weights/dimensions
const weight = num($('weight').value);
const len    = num($('len').value);
const wid    = num($('wid').value);
const hei    = num($('hei').value);

const errs = [];
if (!isPos(weight)) errs.push('Weight (oz) must be greater than 0.');
if (!isPos(len))    errs.push('Length (in) must be greater than 0.');
if (!isPos(wid))    errs.push('Width (in) must be greater than 0.');
if (!isPos(hei))    errs.push('Height (in) must be greater than 0.');

if (errs.length){
await alertModal(errs.join('\n'), { title: 'Fix These Fields' });
return { ok:false };
}

return { ok:true, weight, len, wid, hei, file: f };
}

$('saveBtn').addEventListener('click', async () => {
showLoading("Upload/Notify");
// Validate first
const v = await validateBeforeInsert();
if (!v.ok) 
  {
    hideLoading();
    return;
  }

// Upload image
const fd = new FormData();
fd.append('image', v.file);
$('saveBtn').disabled = true; $('saveMsg').textContent = 'Uploading…';
const up = await api.upload(fd);
if (!up?.ok) {
  $('saveBtn').disabled = false; $('saveMsg').textContent = 'Upload failed';
  hideLoading();
  return alertModal('Image upload failed. Please try again.', { title: 'Upload Error' });
}

// Insert
const body = {
  fk_subscriber_id: selected.subscriber_id,
  image_path: up.imagePath,
  weight_oz: v.weight,
  width_in:  v.wid,
  length_in: v.len,
  height_in: v.hei,
  mail_type_cd: $('mailType').value,
  notify: true
};

$('saveMsg').textContent = 'Saving…';
const j = await api.insert(body);
$('saveBtn').disabled = false;

if (!j?.ok) {
  $('saveMsg').textContent = 'Save failed';
  hideLoading();
  return alertModal(j?.error || 'Insert failed. Please try again.', { title: 'Insert Error' });
}

hideLoading();

// Success → introduce mail ID, reset form
$('saveMsg').textContent = `Inserted. Mail ID #${j.mailId}`;
await alertModal(`Mail ID ${j.mailId} has been inserted.`, { title: 'Mail Inserted', okText: 'Done' });

// Reset inputs & preview (keep the selected subscriber)
$('weight').value = $('len').value = $('wid').value = $('hei').value = '';
$('fileInput').value = '';
preview.removeAttribute('src'); $('thumb').classList.remove('has-img');
});

// No auto-load on page open