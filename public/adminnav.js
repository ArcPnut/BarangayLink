document.write('<script src="/errors.js"><\/script>');
(function () {
  // icons are not loaded on every admin page, so load them here once
  if (!document.querySelector('link[href*="bootstrap-icons"]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
    document.head.appendChild(css);
  }

  // Layout by screen size:
  //  - wide screens: icon + name
  //  - tablets: icons only, so everything stays on one row
  //  - phones: a Menu button opens the links as a list
  const style = document.createElement('style');
  style.textContent =
    '@media (min-width:576px) and (max-width:1199.98px){' +
      '.bl-label{display:none}' +
      '.bl-links .nav-link{padding:.5rem .7rem}' +
    '}' +
    '@media (min-width:576px){' +
      '.bl-menu-btn{display:none!important}' +
    '}' +
    '@media (max-width:575.98px){' +
      '.bl-brand{order:1;margin-right:auto!important}' +
      '.bl-brand .badge{display:none}' +
      '.bl-right{order:2;gap:.5rem!important}' +
      '.bl-logout-label{display:none}' +
      '.navbar-expand .bl-links{display:none;order:3;width:100%;flex-direction:column;gap:0!important;' +
        'margin-top:.5rem;padding-top:.5rem;border-top:1px solid rgba(255,255,255,.15)}' +
      '.navbar-expand .bl-links.open{display:flex}' +
      '.bl-links .nav-link{padding:.6rem .25rem}' +
    '}';
  document.head.appendChild(style);

  // the Dashboard is opened from the brand name on the left
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
      '<div class="bl-links navbar-nav me-auto gap-1" id="adminLinks">' + items + '</div>' +
      '<div class="bl-right d-flex align-items-center gap-3">' +
        '<button id="logout" class="btn btn-outline-light btn-sm" aria-label="Log out">' +
          '<i class="bi bi-box-arrow-right d-sm-none" aria-hidden="true"></i><span class="bl-logout-label">Log out</span>' +
        '</button>' +
        '<button id="menuBtn" class="bl-menu-btn btn btn-outline-light btn-sm" type="button" aria-label="Menu" aria-expanded="false" aria-controls="adminLinks">' +
          '<i class="bi bi-list" aria-hidden="true"></i>' +
        '</button>' +
      '</div>' +
    '</nav>'
  );

  document.getElementById('menuBtn').addEventListener('click', () => {
    const open = document.getElementById('adminLinks').classList.toggle('open');
    document.getElementById('menuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });
})();