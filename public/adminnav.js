document.write('<script src="/errors.js"><\/script>');
(function () {
  // icons are not loaded on every admin page, so load them here once
  if (!document.querySelector('link[href*="bootstrap-icons"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
    document.head.appendChild(css);
  }

  // the Dashboard is opened from the brand name on the left
  // Layout by screen size:
  //  - wide screens: icon + name
  //  - tablets: icons only, so everything stays on one row
  //  - phones: links on a second row that scrolls sideways
  const style = document.createElement('style');
  style.textContent =
    '@media (min-width:576px) and (max-width:1199.98px){' +
      '.bl-label{display:none}' +
      '.bl-links .nav-link{padding:.5rem .7rem}' +
    '}' +
    '@media (max-width:575.98px){' +
      '.bl-brand{order:1;margin-right:auto!important}' +
      '.bl-right{order:2}' +
      '.bl-links{order:3;width:100%;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-top:.25rem}' +
      '.bl-links::-webkit-scrollbar{display:none}' +
      '.bl-links .nav-link{white-space:nowrap}' +
    '}';
  document.head.appendChild(style);

  const links = [
    ['/admin/accounts', 'bi-people', 'Accounts'],
    ['/admin/requests', 'bi-file-earmark-text', 'Document Requests'],
    ['/admin/reservations', 'bi-calendar-check', 'Reservations'],
    ['/admin/document-types', 'bi-folder2', 'Document Types'],
    ['/admin/facilities', 'bi-building', 'Facilities'],
    ['/admin/board', 'bi-megaphone', 'Announcements']
  ];
  const path = window.location.pathname;

  const items = links.map(([href, icon, label]) => {
    const active = path === href ? ' active' : '';
    return '<a class="nav-link d-flex align-items-center gap-2' + active + '" href="' + href + '" title="' + label + '" aria-label="' + label + '">' +
      '<i class="bi ' + icon + '" aria-hidden="true"></i><span class="bl-label">' + label + '</span></a>';
  }).join('');

  document.currentScript.insertAdjacentHTML('beforebegin',
    '<nav class="navbar navbar-expand navbar-dark bg-dark px-3 flex-wrap">' +
      '<a class="bl-brand navbar-brand d-flex align-items-center gap-2 me-4" href="/admin" title="Go to the dashboard">' +
        'BarangayLink<span class="badge text-bg-secondary fw-normal">Admin</span>' +
      '</a>' +
      '<div class="bl-links navbar-nav me-auto gap-1">' + items + '</div>' +
      '<div class="bl-right d-flex align-items-center gap-3">' +
        '<button id="logout" class="btn btn-outline-light btn-sm">Log out</button>' +
      '</div>' +
    '</nav>'
  );

  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });
})();