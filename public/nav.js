(function () {
  const links = [
    ['/resident', 'Home'],
    ['/resident/profile', 'Profile'],
    ['/resident/requests', 'Requests'],
    ['/resident/reservations', 'Reservations'],
    ['/resident/notifications', 'Notifications']
  ];
  const path = window.location.pathname;

  const items = links.map(([href, label]) => {
    const active = path === href ? ' active' : '';
    const badge = href === '/resident/notifications'
      ? ' <span id="notifBadge" class="badge bg-danger d-none"></span>'
      : '';
    return '<a class="nav-link' + active + '" href="' + href + '">' + label + badge + '</a>';
  }).join('');

  document.currentScript.insertAdjacentHTML('beforebegin',
    '<nav class="navbar navbar-expand navbar-dark bg-dark px-3 flex-wrap">' +
      '<span class="navbar-brand">BarangayLink</span>' +
      '<div class="navbar-nav me-auto">' + items + '</div>' +
      '<button id="logout" class="btn btn-outline-light btn-sm">Log out</button>' +
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