// Shared error handling: every fetch() call on every page goes through this.
(function () {
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