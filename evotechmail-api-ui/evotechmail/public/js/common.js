//  1   - Alert Modal

//Usage Sample:

/*
    <dialog id="alertModal" class="modal-overlay" aria-labelledby="alertTitle" aria-describedby="alertMsg">
    <div class="modal" role="document">
        <div class="modal__header">
        <span id="alertTitle">Notice</span>
        <button class="close-x" type="button" aria-label="Close">✕</button>
        </div>
        <div class="modal__body">
        <div style="display:flex; gap:10px; align-items:flex-start;">
            <!-- subtle info icon -->
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="#E0F2F1"></circle>
            <text x="12" y="16" text-anchor="middle" font-size="12" fill="#006D75" font-weight="700">i</text>
            </svg>
            <div id="alertMsg" style="white-space:pre-wrap"></div>
        </div>
        </div>
        <div class="modal__footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="btn btn--primary" data-role="ok">OK</button>
        </div>
    </div>
    </dialog>


// simple
alertModal('Mail ID 12345 has been recorded.');

// with custom title/button
alertModal('Subscriber updated successfully.', { title: 'Success', okText: 'Great' });

// auto-close after 2 seconds
alertModal('Saved.', { autoCloseMs: 2000 });
*/


(function(){
  const dlg = document.getElementById('alertModal');
  const titleEl = dlg.querySelector('#alertTitle');
  const msgEl = dlg.querySelector('#alertMsg');
  const btnOk = dlg.querySelector('[data-role="ok"]');
  const btnX  = dlg.querySelector('.close-x');

  let lastActive = null;
  function openDialog(){
    // prevent background scroll on iOS
    document.documentElement.style.overflow = 'hidden';
    dlg.showModal();
  }
  function closeDialog(){
    dlg.close();
    document.documentElement.style.overflow = '';
    if (lastActive && lastActive.focus) lastActive.focus();
  }

  // overlay click to close (only when clicking outside the modal panel)
  dlg.addEventListener('click', (e)=>{
    const rect = dlg.querySelector('.modal').getBoundingClientRect();
    const inPanel = (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top  && e.clientY <= rect.bottom
    );
    if (!inPanel) closeDialog();
  });

  btnOk.addEventListener('click', closeDialog);
  btnX.addEventListener('click', closeDialog);
  dlg.addEventListener('cancel', (e)=>{ e.preventDefault(); closeDialog(); }); // ESC

  // public API
  window.alertModal = function(message, opts = {}){
    const {
      title = 'Notice',
      okText = 'OK',
      autoCloseMs = null
    } = opts;

    lastActive = document.activeElement;
    titleEl.textContent = title;
    msgEl.textContent = typeof message === 'string' ? message : String(message ?? '');
    btnOk.textContent = okText;

    openDialog();

    return new Promise(resolve=>{
      const done = () => {
        dlg.removeEventListener('close', done);
        resolve(true);
      };
      dlg.addEventListener('close', done, { once:true });

      if (autoCloseMs && Number(autoCloseMs) > 0) {
        setTimeout(() => { if (dlg.open) closeDialog(); }, Number(autoCloseMs));
      }
    });
  };

  // optional compatibility alias if you were calling showerrorModal("…")
  window.showerrorModal = (msg) => window.alertModal(msg, { title: 'Info' });
})();





// Inline sheet helpers
const $el = id => document.getElementById(id);
function openSheet({ title, bodyHTML, footerHTML='', showBack=false }){
  $el('sheetTitle').textContent = title || '';
  $el('sheetBody').innerHTML = bodyHTML || '';
  $el('sheetFooter').innerHTML = footerHTML || '';
  $el('sheetBackBtn').hidden = !showBack;
  $el('sheet').hidden = false;
  document.documentElement.style.overflow = 'hidden';
}
function closeSheet(){
  $el('sheet').hidden = true;
  document.documentElement.style.overflow = '';
}
$el('sheetCloseBtn')?.addEventListener('click', closeSheet);
$el('sheet')?.addEventListener('click', (e)=>{
  // click outside inner -> close
  if (!e.target.closest('.sheet__inner')) closeSheet();
});




/*
/* Loading overlay //
.loading{position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.28); z-index:1000}
.loading[hidden]{display:none}
.loading__card{
  width:min(92vw,360px); background:#fff; border-radius:16px; padding:16px 18px; text-align:center;
  box-shadow:0 18px 60px rgba(0,0,0,.25)
}
.loading__title{margin:8px 0 4px; font-size:16px; color:#0b7285}
.loading__text{margin:0; font-size:13px; color:#475569}

/* Spinner //
.loading__spinner{
  width:36px; height:36px; margin:2px auto 8px; border-radius:50%;
  border:3px solid #e2e8f0; border-top-color:#0ea5b9; animation:spin .9s linear infinite
}
@keyframes spin{to{transform:rotate(360deg)}}

/* Progress (optional) //
.loading__progress{margin-top:10px; height:8px; border-radius:999px; background:#e6edf3; overflow:hidden}
.loading__progress-bar{height:100%; background:#0ea5b9; transition:width .2s ease}


html:
<section id="loading" class="loading" hidden aria-live="assertive" aria-modal="true" role="dialog" aria-label="Please wait">
  <div class="loading__card" role="document">
    <div class="loading__spinner" aria-hidden="true"></div>
    <h2 id="loadingTitle" class="loading__title">Please wait…</h2>
    <p id="loadingText" class="loading__text">Working on it</p>

    <div id="loadingProgressWrap" class="loading__progress" hidden>
      <div id="loadingProgressBar" class="loading__progress-bar" style="width:0%"></div>
    </div>
  </div>
</section>

*/
/* USAGE:
// Example: around a fetch/update
toggleLoading(true, { title: 'Saving', text: 'Updating subscriber…' });
try {
  await submitEditSubscriber();
} finally {
  toggleLoading(false);
}

// With progress (optional)
toggleLoading(true, { title: 'Uploading', text: 'Compressing image…', progress: 0 });
setLoadingProgress(35);
setLoadingProgress(100); // then toggleLoading(false)
// Convenience
//function showLoading(text='Working on it…'){ toggleLoading(true, { text }); }
//function hideLoading(){ toggleLoading(false); }
*/

// ---- Loading overlay: auto-injects HTML + CSS on first use ----
(function(){
  function ensureLoadingUI(){
    if (!document.getElementById('loadingStyles')){
      const css = `
      .loading{position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.28);z-index:10000;overscroll-behavior:contain;touch-action:none}
      .loading[hidden]{display:none}
      .loading__card{width:min(92vw,360px);background:#fff;border-radius:16px;padding:16px 18px;text-align:center;box-shadow:0 18px 60px rgba(0,0,0,.25)}
      .loading__title{margin:8px 0 4px;font-size:16px;color:#0b7285}
      .loading__text{margin:0;font-size:13px;color:#475569}
      .loading__spinner{width:36px;height:36px;margin:2px auto 8px;border-radius:50%;border:3px solid #e2e8f0;border-top-color:#0ea5b9;animation:spin .9s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      .loading__progress{margin-top:10px;height:8px;border-radius:999px;background:#e6edf3;overflow:hidden}
      .loading__progress-bar{height:100%;background:#0ea5b9;transition:width .2s ease}

      /* Mobile tweaks */
      @media (max-width:480px){
        .loading__card{width:92vw;padding:14px 16px;border-radius:14px}
        .loading__spinner{width:28px;height:28px;border-width:2.5px}
        .loading__title{font-size:15px}
        .loading__text{font-size:13px}
      }

      /* Tablet/desktop tweak */
      @media (min-width:768px){
        .loading__card{width:min(80vw,420px)}
        .loading__spinner{width:40px;height:40px}
      }

      /* Respect reduced motion */
      @media (prefers-reduced-motion:reduce){
        .loading__spinner{animation:none}
      }`;
      const s = document.createElement('style');
      s.id = 'loadingStyles';
      s.textContent = css;
      document.head.appendChild(s);
    }
    if (!document.getElementById('loading')){
      const html = `
        <section id="loading" class="loading" hidden aria-live="assertive" aria-modal="true" role="dialog" aria-label="Please wait">
          <div class="loading__card" role="document">
            <div class="loading__spinner" aria-hidden="true"></div>
            <h2 id="loadingTitle" class="loading__title">Please wait…</h2>
            <p id="loadingText" class="loading__text">Working on it</p>
            <div id="loadingProgressWrap" class="loading__progress" hidden>
              <div id="loadingProgressBar" class="loading__progress-bar" style="width:0%"></div>
            </div>
          </div>
        </section>`;
      document.body.insertAdjacentHTML('beforeend', html);
    }
  }

  window.toggleLoading = function(on, opts={}){
    ensureLoadingUI();
    const el = document.getElementById('loading');
    if (!el) return;
    if (opts.title != null) el.querySelector('#loadingTitle').textContent = String(opts.title);
    if (opts.text  != null) el.querySelector('#loadingText').textContent  = String(opts.text);
    if (typeof opts.progress === 'number') setLoadingProgress(opts.progress); else {
      const wrap = el.querySelector('#loadingProgressWrap'); if (wrap) wrap.hidden = true;
    }
    el.hidden = !on;
    document.body.style.overflow = on ? 'hidden' : '';
  };

  window.setLoadingProgress = function(pct){
    ensureLoadingUI();
    const el = document.getElementById('loading');
    const wrap = el?.querySelector('#loadingProgressWrap');
    const bar  = el?.querySelector('#loadingProgressBar');
    if (!wrap || !bar) return;
    const v = Math.max(0, Math.min(100, Number(pct)||0));
    wrap.hidden = false;
    bar.style.width = v + '%';
  };

  window.showLoading = function(text='Working on it…'){ toggleLoading(true, { text }); };
  window.hideLoading  = function(){ toggleLoading(false); };
})();



