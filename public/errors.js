// Shared error handling: every fetch() call on every page goes through this.
(function () {
  if (window.fetchWrapped) return;
  window.fetchWrapped = true;
  const originalFetch = window.fetch.bind(window);

  function banner(text) {
    let box = document.getElementById('errorBanner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'errorBanner';
      box.className = 'alert alert-danger shadow position-fixed top-0 start-50 translate-middle-x mt-3';
      box.style.zIndex = '2000';
      box.setAttribute('role', 'alert');
      (document.body || document.documentElement).appendChild(box);
    }
    box.textContent = text;
    box.classList.remove('d-none');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.add('d-none'), 7000);
  }

  window.fetch = async function (url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    let res;
    try {
      res = await originalFetch(url, { ...(options || {}), signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const message = err.name === 'AbortError'
        ? 'The server is taking too long to answer. Please try again.'
        : 'No connection. Check your internet and try again.';
      try { err.message = message; } catch (e) { /* keep original */ }
      banner(message);
      throw err;
    }
    clearTimeout(timer);

    const isApi = typeof url === 'string' && url.startsWith('/api/');

    // session ended: go back to the login page (but not for a wrong password)
    if (isApi && res.status === 401 && url !== '/api/login' && window.location.pathname !== '/') {
      window.location.href = '/?expired=1';
      return new Promise(() => {});
    }

    if (res.status >= 500) {
      banner('Something went wrong on the server. Please try again in a moment.');
    }

    // the host sometimes answers with plain text instead of JSON: turn it into the usual shape
    const type = res.headers.get('content-type') || '';
    if (isApi && !res.ok && !type.includes('application/json')) {
      const error = res.status === 413
        ? 'The file is too large. The maximum is 4 MB.'
        : 'Something went wrong. Please try again.';
      return new Response(JSON.stringify({ error }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return res;
  };
})();

// ---- dark mode, remembered in Web Storage ----
(function () {
  if (window.themeReady) return;
  window.themeReady = true;
  function stored() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  }

  function current() {
    return document.documentElement.getAttribute('data-bs-theme') || 'light';
  }

  const start = stored() ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-bs-theme', start);

  // Bootstrap's bg-light stays light in dark mode, so make it follow the theme.
  // The #themeToggle rules draw the sun and moon switch.
  const style = document.createElement('style');
  style.textContent = `
    [data-bs-theme="dark"] .bg-light { background-color: var(--bs-body-bg) !important; }
    #themeToggle { position: relative; width: 58px; height: 28px; padding: 0; flex: none;
      border: 1px solid rgba(128, 128, 128, .55); border-radius: 14px; background: #ced4da;
      cursor: pointer; vertical-align: middle; transition: background .2s; }
    #themeToggle .knob { position: absolute; top: 2px; left: 2px; width: 22px; height: 22px;
      border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .35);
      transition: transform .2s; }
    #themeToggle svg { position: absolute; top: 6px; width: 14px; height: 14px; }
    #themeToggle .sun { left: 7px; color: #f08c00; }
    #themeToggle .moon { right: 7px; color: #6c757d; }
    [data-bs-theme="dark"] #themeToggle { background: #495057; }
    [data-bs-theme="dark"] #themeToggle .knob { transform: translateX(30px); }
    [data-bs-theme="dark"] #themeToggle .moon { color: #212529; }
    #themeToggle:focus-visible { outline: 2px solid #0d6efd; outline-offset: 2px; }
  `;
  document.head.appendChild(style);

  const SUN = '<svg class="sun" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const MOON = '<svg class="moon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function label(button) {
    const dark = current() === 'dark';
    button.setAttribute('aria-checked', dark ? 'true' : 'false');
    button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) { /* storage blocked */ }
    const button = document.getElementById('themeToggle');
    if (button) label(button);
    window.dispatchEvent(new Event('themechange'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('themeToggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'themeToggle';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', 'Dark mode');
    button.innerHTML = '<span class="knob"></span>' + SUN + MOON;
    label(button);
    button.addEventListener('click', () => setTheme(current() === 'dark' ? 'light' : 'dark'));

    const logout = document.getElementById('logout');
    if (logout) {
      button.className = '';
      logout.parentNode.insertBefore(button, logout);
    } else {
      button.className = 'position-fixed top-0 end-0 m-3';
      button.style.zIndex = '1030';
      document.body.appendChild(button);
    }
  });
})();