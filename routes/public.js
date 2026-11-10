const express = require('express');
const pool = require('../db');

const router = express.Router();

// these routes are public: no login needed, so they return only what the pages show
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/announcements', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT announcement_id, title, message, is_pinned, date_posted
       FROM announcements
       WHERE is_active = TRUE
       ORDER BY is_pinned DESC, date_posted DESC, announcement_id DESC
       LIMIT 8`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.get('/events', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT event_id, title, description, event_date, start_time, venue, audience
       FROM events
       WHERE is_active = TRUE
         AND event_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date
       ORDER BY event_date, start_time NULLS LAST, event_id
       LIMIT 10`
    );
    res.json(rows.map(r => ({
      ...r,
      start_time: r.start_time ? r.start_time.slice(0, 5) : null
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;