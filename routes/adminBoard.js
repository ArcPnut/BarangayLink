const express = require('express');
const pool = require('../db');

const router = express.Router();

// every route in this file is admin only
router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ error: 'Admin access only.' });
  }
  next();
});

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function clean(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ---------------- announcements ----------------

function checkAnnouncement(body) {
  const title = clean(body.title);
  const message = clean(body.message);
  const active = body.is_active !== false;
  const pinned = body.is_pinned === true;

  if (!title || title.length > 100) return { error: 'Enter a title (up to 100 characters).' };
  if (!message || message.length > 500) return { error: 'Enter a message (up to 500 characters).' };
  if (pinned && !active) return { error: 'Only an active announcement can be pinned.' };
  return { title, message, active, pinned };
}

router.get('/announcements', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT announcement_id, title, message, is_pinned, is_active, date_posted
       FROM announcements
       ORDER BY is_pinned DESC, date_posted DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/announcements', async (req, res) => {
  const a = checkAnnouncement(req.body);
  if (a.error) return res.status(400).json({ error: a.error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // only one announcement can be pinned at a time
    if (a.pinned) await conn.execute('UPDATE announcements SET is_pinned = false WHERE is_pinned = true');
    await conn.execute(
      'INSERT INTO announcements (title, message, is_pinned, is_active) VALUES (?, ?, ?, ?)',
      [a.title, a.message, a.pinned, a.active]
    );
    await conn.commit();
    res.status(201).json({ message: 'Announcement posted.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  } finally {
    conn.release();
  }
});

router.put('/announcements/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid announcement.' });
  const a = checkAnnouncement(req.body);
  if (a.error) return res.status(400).json({ error: a.error });

  const conn = await pool.getConnection();
  try {
    const [found] = await conn.execute('SELECT announcement_id FROM announcements WHERE announcement_id = ?', [id]);
    if (!found[0]) return res.status(404).json({ error: 'Announcement not found.' });

    await conn.beginTransaction();
    if (a.pinned) {
      await conn.execute('UPDATE announcements SET is_pinned = false WHERE is_pinned = true AND announcement_id <> ?', [id]);
    }
    await conn.execute(
      'UPDATE announcements SET title = ?, message = ?, is_pinned = ?, is_active = ? WHERE announcement_id = ?',
      [a.title, a.message, a.pinned, a.active, id]
    );
    await conn.commit();
    res.json({ message: 'Announcement updated.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  } finally {
    conn.release();
  }
});

router.post('/announcements/:id/active', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid announcement.' });
  if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'Invalid status.' });

  try {
    // an inactive announcement cannot stay pinned
    const sql = req.body.is_active
      ? 'UPDATE announcements SET is_active = true WHERE announcement_id = ?'
      : 'UPDATE announcements SET is_active = false, is_pinned = false WHERE announcement_id = ?';
    const [result] = await pool.execute(sql, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Announcement not found.' });
    res.json({ message: req.body.is_active ? 'Announcement activated.' : 'Announcement deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ---------------- events ----------------

function checkEvent(body) {
  const title = clean(body.title);
  const description = clean(body.description);
  const venue = clean(body.venue);
  const audience = clean(body.audience) || 'Everyone';
  const startTime = clean(body.start_time);
  const eventDate = typeof body.event_date === 'string' ? body.event_date.trim() : '';
  const active = body.is_active !== false;

  if (!title || title.length > 100) return { error: 'Enter a title (up to 100 characters).' };
  if (!validDate(eventDate)) return { error: 'Choose a valid event date.' };
  if (startTime && !validTime(startTime)) return { error: 'Enter a valid start time.' };
  if (venue && venue.length > 100) return { error: 'The venue is too long (max 100 characters).' };
  if (audience.length > 50) return { error: 'The audience is too long (max 50 characters).' };
  if (description && description.length > 255) return { error: 'The description is too long (max 255 characters).' };
  return { title, description, venue, audience, startTime, eventDate, active };
}

router.get('/events', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT event_id, title, description, event_date, start_time, venue, audience, is_active
       FROM events
       ORDER BY event_date, start_time`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/events', async (req, res) => {
  const e = checkEvent(req.body);
  if (e.error) return res.status(400).json({ error: e.error });
  try {
    await pool.execute(
      `INSERT INTO events (title, description, event_date, start_time, venue, audience, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [e.title, e.description, e.eventDate, e.startTime, e.venue, e.audience, e.active]
    );
    res.status(201).json({ message: 'Event added.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.put('/events/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid event.' });
  const e = checkEvent(req.body);
  if (e.error) return res.status(400).json({ error: e.error });
  if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'Choose a status.' });
  try {
    const [result] = await pool.execute(
      `UPDATE events
       SET title = ?, description = ?, event_date = ?, start_time = ?, venue = ?, audience = ?, is_active = ?
       WHERE event_id = ?`,
      [e.title, e.description, e.eventDate, e.startTime, e.venue, e.audience, e.active, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/events/:id/active', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid event.' });
  if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'Invalid status.' });
  try {
    const [result] = await pool.execute('UPDATE events SET is_active = ? WHERE event_id = ?', [req.body.is_active, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: req.body.is_active ? 'Event activated.' : 'Event deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;