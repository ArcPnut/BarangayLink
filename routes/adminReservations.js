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

// allowed status changes
const NEXT = {
  'Pending': ['Approved', 'Rejected']
};

function cleanNote(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

// all reservations
router.get('/reservations', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT q.reservation_id, q.reservation_date, q.start_time, q.end_time, 
              q.purpose, q.equipment_needs, q.supporting_doc_path, q.status, q.admin_notes, 
              q.requested_at, q.updated_at,
              f.facility_name,
              r.first_name, r.last_name, r.verification_status,
              u.email
       FROM reservations q
       JOIN facilities f ON f.facility_id = q.facility_id
       JOIN residents r ON r.resident_id = q.resident_id
       JOIN users u ON u.user_id = r.user_id
       ORDER BY q.requested_at DESC, q.reservation_id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// change a reservation's status
router.post('/reservations/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const next = req.body.status;
  const note = cleanNote(req.body.note);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid reservation request.' });
  }
  if (note && note.length > 200) {
    return res.status(400).json({ error: 'The note is too long (max 200 characters).' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get current reservation details
    const [rows] = await connection.execute(
      `SELECT q.status, q.facility_id, q.reservation_date, q.start_time, q.end_time, 
              f.facility_name, r.user_id
       FROM reservations q
       JOIN facilities f ON f.facility_id = q.facility_id
       JOIN residents r ON r.resident_id = q.resident_id
       WHERE q.reservation_id = ?`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      connection.release();
      return res.status(404).json({ error: 'Reservation not found.' });
    }

    const allowed = NEXT[row.status] || [];
    if (!allowed.includes(next)) {
      connection.release();
      return res.status(409).json({
        error: `A ${row.status} reservation cannot be changed to ${next}. Reload the page and try again.`
      });
    }
    if (next === 'Rejected' && !note) {
      connection.release();
      return res.status(400).json({ error: 'Enter a note explaining the rejection.' });
    }

    // Update target reservation status
    const [result] = await connection.execute(
      `UPDATE reservations
       SET status = ?, admin_notes = COALESCE(?, admin_notes), processed_by = ?
       WHERE reservation_id = ? AND status = ?`,
      [next, note, req.session.user.user_id, id, row.status]
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      connection.release();
      return res.status(409).json({ error: 'This reservation was just changed. Reload the page and try again.' });
    }

    // If approved, handle overlapping pending reservations for the same facility/date/time
    if (next === 'Approved') {
      const [conflicts] = await connection.execute(
        `SELECT q.reservation_id, r.user_id, q.start_time, q.end_time
         FROM reservations q
         JOIN residents r ON r.resident_id = q.resident_id
         WHERE q.facility_id = ? 
           AND q.reservation_date = ? 
           AND q.status = 'Pending'
           AND q.reservation_id != ?
           AND q.start_time < ? 
           AND q.end_time > ?`,
        [row.facility_id, row.reservation_date, id, row.end_time, row.start_time]
      );

      for (const conflict of conflicts) {
        const conflictNote = `Auto-rejected due to schedule overlap with an approved reservation for ${row.facility_name}.`;
        await connection.execute(
          `UPDATE reservations 
           SET status = 'Rejected', admin_notes = ?, processed_by = ? 
           WHERE reservation_id = ?`,
          [conflictNote, req.session.user.user_id, conflict.reservation_id]
        );
        await connection.execute(
          'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
          [conflict.user_id, `Your reservation for ${row.facility_name} was rejected: ${conflictNote}`.slice(0, 255), '/resident/reservations']
        );
      }
    }

    // Notify primary user
    const facility = row.facility_name;
    const messages = {
      'Approved': `Your reservation for ${facility} has been approved.`,
      'Rejected': `Your reservation for ${facility} was rejected: ${note}`
    };
    await connection.execute(
      'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
      [row.user_id, messages[next].slice(0, 255), '/resident/reservations']
    );

    await connection.commit();
    connection.release();

    res.json({ message: `Reservation updated to ${next}. The resident was notified.` });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;