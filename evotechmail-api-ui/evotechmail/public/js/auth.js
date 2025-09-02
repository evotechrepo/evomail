(() => {
  // Global holders (legacy compatibility)
  window.currentUser = null;
  window.userEmail   = null;

  async function fetchMe() {
    try {
      const r = await fetch('/evotechmail/api/me', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j?.signedIn) return null;

      window.currentUser = j.display_name || j.email || '';
      window.userEmail   = j.email || '';
      document.documentElement.dataset.userEmail = window.userEmail;
      return j;
    } catch {
      return null;
    }
  }

  // A single promise you can await anywhere
  const p = fetchMe();

  // Expose a helper for pages to await
  window.ensureCurrentUser = async ({ redirectOn401 = true } = {}) => {
    const me = await p;

    // Avoid redirect loops on the login page itself
    const path = location.pathname;
    const onLogin =
      path.endsWith('/evotechmail/index.html') ||
      /\/evotechmail\/?$/.test(path);

    if (!me && redirectOn401 && !onLogin) {
      location.replace('/evotechmail/index.html');
    }
    return me;
  };
})();

  
