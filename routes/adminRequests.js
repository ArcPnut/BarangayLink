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
  'Pending': ['Processing', 'Denied'],
  'Processing': ['Ready for Pickup', 'Denied'],
  'Ready for Pickup': ['Completed']
};

function cleanNote(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

// all document requests
router.get('/requests', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT q.request_id, q.purpose, q.status, q.admin_notes, q.requested_at, q.updated_at,
              t.document_name,
              r.first_name, r.last_name, r.verification_status,
              u.email
       FROM document_requests q
       JOIN document_types t ON t.document_type_id = q.document_type_id
       JOIN residents r ON r.resident_id = q.resident_id
       JOIN users u ON u.user_id = r.user_id
       ORDER BY q.requested_at DESC, q.request_id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// change a request's status
router.post('/requests/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const next = req.body.status;
  const note = cleanNote(req.body.note);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  if (note && note.length > 200) {
    return res.status(400).json({ error: 'The note is too long (max 200 characters).' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT q.status, t.document_name, r.user_id
       FROM document_requests q
       JOIN document_types t ON t.document_type_id = q.document_type_id
       JOIN residents r ON r.resident_id = q.resident_id
       WHERE q.request_id = ?`,
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Request not found.' });

    const allowed = NEXT[row.status] || [];
    if (!allowed.includes(next)) {
      return res.status(409).json({
        error: `A ${row.status} request cannot be changed to ${next}. Reload the page and try again.`
      });
    }
    if (next === 'Denied' && !note) {
      return res.status(400).json({ error: 'Enter a note explaining the denial.' });
    }

    const [result] = await pool.execute(
      `UPDATE document_requests
       SET status = ?, admin_notes = COALESCE(?, admin_notes), processed_by = ?
       WHERE request_id = ? AND status = ?`,
      [next, note, req.session.user.user_id, id, row.status]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'This request was just changed. Reload the page and try again.' });
    }

    const doc = row.document_name;
    const messages = {
      'Processing': `Your ${doc} request is now being processed.`,
      'Ready for Pickup': `Your ${doc} is ready for pickup.`,
      'Completed': `Your ${doc} request is completed.`,
      'Denied': `Your ${doc} request was denied: ${note}`
    };
    await pool.execute(
      'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
      [row.user_id, messages[next].slice(0, 255), '/resident/requests']
    );

    res.json({ message: `Request updated to ${next}. The resident was notified.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;