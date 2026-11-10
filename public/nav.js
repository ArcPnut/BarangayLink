document.write('<script src="/errors.js"><\/script>');
(function () {
  // icons are not loaded on every page, so load them here once
  if (!document.querySelector('link[href*="bootstrap-icons"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
    document.head.appendChild(css);
  }

  const links = [
    ['/resident', 'bi-house', 'Home'],
    ['/resident/profile', 'bi-person', 'Profile'],
    ['/resident/requests', 'bi-file-earmark-text', 'Requests'],
    ['/resident/reservations', 'bi-calendar-check', 'Reservations']
  ];
  const path = window.location.pathname;

  const items = links.map(([href, icon, label]) => {
    const active = path === href ? ' active' : '';
    return '<a class="nav-link d-flex align-items-center gap-2' + active + '" href="' + href + '">' +
      '<i class="bi ' + icon + '" aria-hidden="true"></i>' + label + '</a>';
  }).join('');

  document.currentScript.insertAdjacentHTML('beforebegin',
    '<nav class="navbar navbar-expand navbar-dark bg-dark px-3 flex-wrap">' +
      '<a class="navbar-brand d-flex align-items-center gap-2 me-4" href="/resident" title="Go to the home page">BarangayLink</a>' +
      '<div class="navbar-nav me-auto gap-1">' + items + '</div>' +
      '<div class="d-flex align-items-center gap-3">' +
        '<a href="/resident/notifications" id="bellBtn" class="btn btn-outline-light btn-sm position-relative" aria-label="Notifications">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901z"/></svg>' +
          '<span id="notifBadge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none"></span>' +
        '</a>' +
        '<button id="logout" class="btn btn-outline-light btn-sm">Log out</button>' +
      '</div>' +
    '</nav>'
  );

  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  fetch('/api/notifications/unread-count')
    .then(r => r.ok ? r.json() : { count: 0 })
    .then(data => {
      const badge = document.getElementById('notifBadge');
      if (badge && data.count > 0) {
        badge.textContent = data.count;
        badge.classList.remove('d-none');
      }
    })
    .catch(() => {});
})();