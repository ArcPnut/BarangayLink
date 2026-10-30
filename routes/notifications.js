const express = require('express');
const pool = require('../db');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

// my notifications, newest first
router.get('/notifications', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT notification_id, message, link, is_read, date_created
       FROM notifications WHERE user_id = ?
       ORDER BY date_created DESC, notification_id DESC LIMIT 100`,
      [req.session.user.user_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// how many are unread
router.get('/notifications/unread-count', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.session.user.user_id]
    );
    res.json({ count: Number(rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// mark all as read
router.post('/notifications/read-all', requireLogin, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [req.session.user.user_id]
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// mark one as read
router.post('/notifications/:id/read', requireLogin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid notification.' });
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
      [id, req.session.user.user_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;