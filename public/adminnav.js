(function () {
  const links = [
    ['/admin', 'Dashboard'],
    ['/admin/accounts', 'Accounts'],
    ['/admin/requests', 'Document Requests']
  ];
  const path = window.location.pathname;

  const items = links.map(([href, label]) => {
    const active = path === href ? ' active' : '';
    return '<a class="nav-link' + active + '" href="' + href + '">' + label + '</a>';
  }).join('');

  document.currentScript.insertAdjacentHTML('beforebegin',
    '<nav class="navbar navbar-expand navbar-dark bg-dark px-3 flex-wrap">' +
      '<span class="navbar-brand">BarangayLink · Administration</span>' +
      '<div class="navbar-nav me-auto">' + items + '</div>' +
      '<button id="logout" class="btn btn-outline-light btn-sm">Log out</button>' +
    '</nav>'
  );

  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });
})();