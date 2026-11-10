// Draws the announcements feed and the events agenda.
// It looks for #announcementsBox, #eventsBox and, optionally, #pinnedBar on the page.
(function () {
  const style = document.createElement('style');
  style.textContent =
    '.board-row{padding:.6rem 0;border-bottom:1px solid var(--bs-border-color)}' +
    '.board-row:last-child{border-bottom:0}' +
    '.date-tile{width:46px;flex:none;text-align:center;border-radius:.5rem;padding:.3rem 0;background:var(--bs-tertiary-bg)}' +
    '.date-tile.soon{background:var(--bs-primary-bg-subtle);color:var(--bs-primary-text-emphasis)}' +
    '.date-tile .day{font-size:1.15rem;font-weight:600;line-height:1.1}' +
    '.date-tile .mon{font-size:.75rem}';
  document.head.appendChild(style);

  function el(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseDate(s) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function shortDate(s) {
    return parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtTime(t) {
    const [h, m] = t.split(':').map(Number);
    return (h % 12 === 0 ? 12 : h % 12) + ':' + pad(m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function note(container, text) {
    const p = document.createElement('p');
    p.className = 'text-body-secondary mb-0 py-2';
    p.textContent = text;
    container.appendChild(p);
  }

  async function getJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function renderAnnouncements(rows) {
    const box = el('announcementsBox');
    const bar = el('pinnedBar');
    box.innerHTML = '';
    if (bar) bar.classList.add('d-none');

    if (rows === null) return note(box, "Couldn't load announcements. Try refreshing the page.");
    if (rows.length === 0) return note(box, 'No announcements right now.');

    const pinned = rows.find(r => r.is_pinned);

    if (pinned && bar) {
      // slim bar across the top of the page
      const text = el('pinnedText');
      text.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = 'Pinned: ' + pinned.title + '. ';
      text.append(strong, pinned.message);
      bar.classList.remove('d-none');
    } else if (pinned) {
      // inside the feed (resident home page)
      const alertBox = document.createElement('div');
      alertBox.className = 'alert alert-warning mb-2';

      const label = document.createElement('div');
      label.className = 'small';
      const icon = document.createElement('i');
      icon.className = 'bi bi-pin-angle me-1';
      label.append(icon, 'Pinned');

      const title = document.createElement('div');
      title.className = 'fw-semibold';
      title.textContent = pinned.title;

      const text = document.createElement('div');
      text.textContent = pinned.message;

      alertBox.append(label, title, text);
      box.appendChild(alertBox);
    }

    const feed = rows.filter(r => r !== pinned);
    if (feed.length === 0 && bar && pinned) return note(box, 'No other announcements right now.');

    feed.forEach(r => {
      const row = document.createElement('div');
      row.className = 'board-row';

      const title = document.createElement('div');
      title.className = 'fw-medium';
      title.textContent = r.title;

      const text = document.createElement('div');
      text.className = 'small';
      text.textContent = r.message;

      const meta = document.createElement('div');
      meta.className = 'small text-body-secondary';
      meta.textContent = 'Posted ' + shortDate(r.date_posted);

      row.append(title, text, meta);
      box.appendChild(row);
    });
  }

  function eventRow(ev, isSoonest) {
    const row = document.createElement('div');
    row.className = 'board-row d-flex gap-3';

    const d = parseDate(ev.event_date);
    const tile = document.createElement('div');
    tile.className = 'date-tile' + (isSoonest ? ' soon' : '');
    const day = document.createElement('div');
    day.className = 'day';
    day.textContent = d.getDate();
    const mon = document.createElement('div');
    mon.className = 'mon';
    mon.textContent = d.toLocaleDateString('en-US', { month: 'short' });
    tile.append(day, mon);

    const body = document.createElement('div');
    body.style.minWidth = '0';

    const title = document.createElement('div');
    title.className = 'fw-medium';
    title.textContent = ev.title;

    const today = dateStr(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const parts = [];
    if (ev.event_date === today) parts.push('Today');
    else if (ev.event_date === dateStr(tomorrowDate)) parts.push('Tomorrow');
    if (ev.start_time) parts.push(fmtTime(ev.start_time));
    if (ev.venue) parts.push(ev.venue);

    body.appendChild(title);
    if (parts.length) {
      const meta = document.createElement('div');
      meta.className = 'small text-body-secondary';
      meta.textContent = parts.join(', ');
      body.appendChild(meta);
    }
    if (ev.description) {
      const desc = document.createElement('div');
      desc.className = 'small text-body-secondary';
      desc.textContent = ev.description;
      body.appendChild(desc);
    }
    if (ev.audience) {
      const chip = document.createElement('span');
      chip.className = 'badge bg-body-secondary text-body-secondary border fw-normal mt-1';
      chip.textContent = ev.audience;
      body.appendChild(chip);
    }

    row.append(tile, body);
    return row;
  }

  function renderEvents(rows) {
    const box = el('eventsBox');
    box.innerHTML = '';
    if (rows === null) return note(box, "Couldn't load events. Try refreshing the page.");
    if (rows.length === 0) return note(box, 'No upcoming events.');

    const today = parseDate(dateStr(new Date()));
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 6);

    const thisWeek = rows.filter(r => parseDate(r.event_date) <= weekEnd);
    const later = rows.filter(r => parseDate(r.event_date) > weekEnd);
    let first = true;

    function group(label, list) {
      if (list.length === 0) return;
      const heading = document.createElement('div');
      heading.className = 'small text-body-secondary mt-2';
      heading.textContent = label;
      box.appendChild(heading);
      list.forEach(ev => {
        box.appendChild(eventRow(ev, first));
        first = false;
      });
    }

    group('This week', thisWeek);
    group('Later', later);
  }

  function start() {
    if (el('announcementsBox')) getJson('/api/public/announcements').then(renderAnnouncements);
    if (el('eventsBox')) getJson('/api/public/events').then(renderEvents);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();