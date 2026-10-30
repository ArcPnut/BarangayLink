const express = require('express');
const pool = require('../db');

const router = express.Router();

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

// active document types for the dropdown
router.get('/document-types', requireResident, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT document_type_id, document_name, description
       FROM document_types WHERE is_active = TRUE ORDER BY document_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// my requests
router.get('/requests', requireResident, async (req, res) => {
  try {
    const resident = await getResident(req.session.user.user_id);
    const [rows] = await pool.execute(
      `SELECT r.request_id, t.document_name, r.purpose, r.status, r.admin_notes, r.requested_at
       FROM document_requests r
       JOIN document_types t ON t.document_type_id = r.document_type_id
       WHERE r.resident_id = ?
       ORDER BY r.requested_at DESC, r.request_id DESC`,
      [resident.resident_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// submit a request
router.post('/requests', requireResident, async (req, res) => {
  const typeId = Number(req.body.document_type_id);
  const purpose = req.body.purpose;

  if (!Number.isInteger(typeId) || typeof purpose !== 'string' || !purpose.trim()) {
    return res.status(400).json({ error: 'Choose a document type and enter the purpose.' });
  }
  if (purpose.trim().length > 255) {
    return res.status(400).json({ error: 'Purpose is too long (max 255 characters).' });
  }

  try {
    const resident = await getResident(req.session.user.user_id);

    if (resident.verification_status === 'Pending') {
      return res.status(403).json({ error: 'Your ID is still waiting for admin review.' });
    }
    if (resident.verification_status !== 'Verified') {
      return res.status(403).json({ error: 'Your account is not yet verified. Upload your ID in your Profile tab.' });
    }

    const [types] = await pool.execute(
      'SELECT document_name FROM document_types WHERE document_type_id = ? AND is_active = TRUE',
      [typeId]
    );
    if (!types[0]) {
      return res.status(400).json({ error: 'That document type is not available.' });
    }

    await pool.execute(
      'INSERT INTO document_requests (resident_id, document_type_id, purpose) VALUES (?, ?, ?)',
      [resident.resident_id, typeId, purpose.trim()]
    );
    await pool.execute(
      'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
      [req.session.user.user_id, `Your request for ${types[0].document_name} was submitted.`]
    );

    res.status(201).json({ message: 'Request submitted. Check notifications for updates.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// cancel my pending request
router.post('/requests/:id/cancel', requireResident, async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  try {
    const resident = await getResident(req.session.user.user_id);
    const [result] = await pool.execute(
      `UPDATE document_requests SET status = 'Cancelled'
       WHERE request_id = ? AND resident_id = ? AND status = 'Pending'`,
      [requestId, resident.resident_id]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Only your own pending requests can be cancelled.' });
    }
    await pool.execute(
      'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
      [req.session.user.user_id, 'Your document request was cancelled.']
    );
    res.json({ message: 'Request cancelled.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;