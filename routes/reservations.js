const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const pool = require('../db');

const router = express.Router();

const docDir = path.join(__dirname, '..', 'uploads', 'docs');
fs.mkdirSync(docDir, { recursive: true });

const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

const upload = multer({
  storage: multer.diskStorage({
    destination: docDir,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + ALLOWED[file.mimetype])
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(new Error('Only JPG, PNG or PDF files are allowed.'));
    }
    cb(null, true);
  }
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayString() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function requireResident(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'resident') {
    return res.status(401).json({ error: 'Please log in as a resident.' });
  }
  next();
}

async function getResident(userId) {
  const [rows] = await pool.execute(
    'SELECT resident_id, verification_status FROM residents WHERE user_id = ?',
    [userId]
  );
  return rows[0];
}

// active facilities for the dropdown
router.get('/facilities', requireResident, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT facility_id, facility_name, description, capacity
       FROM facilities WHERE is_active = TRUE ORDER BY facility_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// approved (blocked) time slots for one facility and date
router.get('/availability', requireResident, async (req, res) => {
  const facilityId = Number(req.query.facility_id);
  const date = req.query.date;
  if (!Number.isInteger(facilityId) || !validDate(date)) {
    return res.status(400).json({ error: 'Choose a facility and a valid date.' });
  }
  try {
    const [rows] = await pool.execute(
      `SELECT start_time, end_time FROM reservations
       WHERE facility_id = ? AND reservation_date = ? AND status = 'Approved'
       ORDER BY start_time`,
      [facilityId, date]
    );
    res.json(rows.map(r => ({
      start_time: r.start_time.slice(0, 5),
      end_time: r.end_time.slice(0, 5)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// my reservations
router.get('/reservations', requireResident, async (req, res) => {
  try {
    const resident = await getResident(req.session.user.user_id);
    const [rows] = await pool.execute(
      `SELECT r.reservation_id, f.facility_name, r.reservation_date, r.start_time, r.end_time,
              r.purpose, r.status, r.admin_notes
       FROM reservations r
       JOIN facilities f ON f.facility_id = r.facility_id
       WHERE r.resident_id = ?
       ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [resident.resident_id]
    );
    res.json(rows.map(r => ({
      ...r,
      start_time: r.start_time.slice(0, 5),
      end_time: r.end_time.slice(0, 5)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// submit a reservation request
router.post('/reservations', requireResident, (req, res) => {
  upload.single('supporting_doc')(req, res, async (err) => {
    const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
    const fail = (status, message) => {
      cleanup();
      return res.status(status).json({ error: message });
    };

    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : err.message;
      return res.status(400).json({ error: msg });
    }

    const facilityId = Number(req.body.facility_id);
    const { reservation_date, start_time, end_time, purpose, equipment_needs } = req.body;

    if (!Number.isInteger(facilityId)) return fail(400, 'Choose a facility.');
    if (!validDate(reservation_date)) return fail(400, 'Choose a valid date.');
    if (reservation_date < todayString()) return fail(400, 'You cannot reserve a date in the past.');
    if (!TIME_RE.test(start_time || '') || !TIME_RE.test(end_time || '')) {
      return fail(400, 'Choose a start time and an end time.');
    }
    if (start_time >= end_time) return fail(400, 'The end time must be after the start time.');
    if (typeof purpose !== 'string' || !purpose.trim()) return fail(400, 'Enter the purpose.');
    if (purpose.trim().length > 255) return fail(400, 'Purpose is too long (max 255 characters).');
    if (typeof equipment_needs === 'string' && equipment_needs.trim().length > 255) {
      return fail(400, 'Equipment needs is too long (max 255 characters).');
    }

    try {
      const resident = await getResident(req.session.user.user_id);

      if (resident.verification_status === 'Pending') {
        return fail(403, 'Your ID is still waiting for admin review.');
      }
      if (resident.verification_status !== 'Verified') {
        return fail(403, 'Your account is not yet verified. Upload your ID in your Profile tab.');
      }

      const [facilities] = await pool.execute(
        'SELECT facility_name FROM facilities WHERE facility_id = ? AND is_active = TRUE',
        [facilityId]
      );
      if (!facilities[0]) return fail(400, 'That facility is not available.');

      // overlap rule: new.start < existing.end AND new.end > existing.start
      const [overlap] = await pool.execute(
        `SELECT reservation_id FROM reservations
         WHERE facility_id = ? AND reservation_date = ? AND status = 'Approved'
           AND start_time < ? AND end_time > ?
         LIMIT 1`,
        [facilityId, reservation_date, `${end_time}:00`, `${start_time}:00`]
      );
      if (overlap[0]) return fail(409, 'This time slot is unavailable.');

      await pool.execute(
        `INSERT INTO reservations
           (resident_id, facility_id, reservation_date, start_time, end_time,
            purpose, equipment_needs, supporting_doc_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resident.resident_id,
          facilityId,
          reservation_date,
          `${start_time}:00`,
          `${end_time}:00`,
          purpose.trim(),
          typeof equipment_needs === 'string' && equipment_needs.trim() ? equipment_needs.trim() : null,
          req.file ? req.file.filename : null
        ]
      );
        await pool.execute(
        'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
        [
          req.session.user.user_id,
          `Your reservation request for ${facilities[0].facility_name} on ${reservation_date} was submitted.`,
          '/resident/reservations'
        ]
      );

      res.status(201).json({ message: 'Reservation request submitted. Check notifications for updates.' });
    } catch (e) {
      console.error(e);
      fail(500, 'Something went wrong. Please try again.');
    }
  });
});

// cancel my pending reservation
router.post('/reservations/:id/cancel', requireResident, async (req, res) => {
  const reservationId = Number(req.params.id);
  if (!Number.isInteger(reservationId)) {
    return res.status(400).json({ error: 'Invalid reservation.' });
  }
  try {
    const resident = await getResident(req.session.user.user_id);
    const [result] = await pool.execute(
      `UPDATE reservations SET status = 'Cancelled'
       WHERE reservation_id = ? AND resident_id = ? AND status = 'Pending'`,
      [reservationId, resident.resident_id]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Only your own pending reservations can be cancelled.' });
    }
    await pool.execute(
      'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
      [req.session.user.user_id, 'Your reservation request was cancelled.', '/resident/reservations']
    );
    res.json({ message: 'Reservation cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;