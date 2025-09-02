
(function(){
  const HIDE = false; // set true to completely hide; false to gray/lock
  const gate = (role) => {
    const admin = (role||'').toLowerCase()==='admin';
    document.querySelectorAll('[data-role="admin-only"]').forEach(el=>{
      if (admin) {
        el.classList.remove('is-locked'); el.disabled = false;
        if (HIDE) el.hidden = false;
        el.removeAttribute('aria-disabled');
        el.title = el.dataset.originalTitle || el.title || '';
      } else {
        if (HIDE) { el.hidden = true; return; }
        el.classList.add('is-locked'); el.disabled = true;
        el.setAttribute('aria-disabled','true');
        el.dataset.originalTitle = el.title || '';
        el.title = 'Admins only';
      }
    });
  };

  // optimistic default (lock until proven admin)
  gate(''); 
  fetch('/evotechmail/api/me', { cache:'no-store' })
    .then(r => r.ok ? r.json() : { signedIn:false })
    .then(j => gate(j?.role_cd || ''))
    .catch(()=> gate(''));
})();
