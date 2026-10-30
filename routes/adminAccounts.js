const path = require('path');
const express = require('express');
const pool = require('../db');

const router = express.Router();
const idDir = path.join(__dirname, '..', 'uploads', 'ids');

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

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t && t.length <= max ? t : null;
}

async function loadResident(id) {
  const [rows] = await pool.execute(
    `SELECT r.resident_id, r.user_id, r.verification_status, u.is_active
     FROM residents r JOIN users u ON u.user_id = r.user_id
     WHERE r.resident_id = ?`,
    [id]
  );
  return rows[0];
}

// all resident accounts
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.resident_id, r.first_name, r.last_name, r.birthdate,
              TIMESTAMPDIFF(YEAR, r.birthdate, CURDATE()) AS age,
              r.address, r.contact_no, r.verification_status, r.verification_remarks,
              (r.id_file_path IS NOT NULL) AS has_id,
              u.email, u.is_active, u.termination_reason, u.date_created
       FROM residents r JOIN users u ON u.user_id = r.user_id
       ORDER BY u.date_created DESC, r.resident_id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// view a resident's submitted ID
router.get('/accounts/:id/id-file', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).send('Invalid account.');
  try {
    const [rows] = await pool.execute(
      'SELECT id_file_path FROM residents WHERE resident_id = ?',
      [id]
    );
    if (!rows[0] || !rows[0].id_file_path) return res.status(404).send('No ID uploaded.');
    const file = path.join(idDir, path.basename(rows[0].id_file_path));
    res.sendFile(file, (err) => {
      if (err && !res.headersSent) res.status(404).send('File not found.');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// approve a submitted ID
router.post('/accounts/:id/approve', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid account.' });
  try {
    const r = await loadResident(id);
    if (!r) return res.status(404).json({ error: 'Account not found.' });
    if (r.verification_status !== 'Pending') {
      return res.status(409).json({ error: 'Only accounts with a pending ID can be approved.' });
    }
    await pool.execute(
      `UPDATE residents SET verification_status = 'Verified', verification_remarks = NULL
       WHERE resident_id = ? AND verification_status = 'Pending'`,
      [id]
    );
    await pool.execute(
      'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
      [r.user_id, 'Your account is verified. You can now request documents and reserve facilities.', '/resident']
    );
    res.json({ message: 'Account approved.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// reject a submitted ID (note required)
router.post('/accounts/:id/reject', async (req, res) => {
  const id = parseId(req.params.id);
  const note = cleanText(req.body.note, 200);
  if (!id) return res.status(400).json({ error: 'Invalid account.' });
  if (!note) return res.status(400).json({ error: 'Enter a rejection note (up to 200 characters).' });
  try {
    const r = await loadResident(id);
    if (!r) return res.status(404).json({ error: 'Account not found.' });
    if (r.verification_status !== 'Pending') {
      return res.status(409).json({ error: 'Only accounts with a pending ID can be rejected.' });
    }
    await pool.execute(
      `UPDATE residents SET verification_status = 'Rejected', verification_remarks = ?
       WHERE resident_id = ? AND verification_status = 'Pending'`,
      [note, id]
    );
    await pool.execute(
      'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
      [r.user_id, `Your ID was rejected: ${note}`, '/resident/profile']
    );
    res.json({ message: 'Account rejected. The resident was notified.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// edit a resident's details
router.put('/accounts/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const first = cleanText(req.body.first_name, 100);
  const last = cleanText(req.body.last_name, 100);
  const address = cleanText(req.body.address, 255);
  const contact = cleanText(req.body.contact_no, 20);
  if (!id) return res.status(400).json({ error: 'Invalid account.' });
  if (!first || !last || !address) {
    return res.status(400).json({ error: 'First name, last name and address are required.' });
  }
  try {
    const r = await loadResident(id);
    if (!r) return res.status(404).json({ error: 'Account not found.' });
    await pool.execute(
      'UPDATE residents SET first_name = ?, last_name = ?, address = ?, contact_no = ? WHERE resident_id = ?',
      [first, last, address, contact, id]
    );
    res.json({ message: 'Account updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// terminate a verified account (reason required, records are kept)
router.post('/accounts/:id/terminate', async (req, res) => {
  const id = parseId(req.params.id);
  const reason = cleanText(req.body.reason, 255);
  if (!id) return res.status(400).json({ error: 'Invalid account.' });
  if (!reason) return res.status(400).json({ error: 'Enter a termination reason (up to 255 characters).' });
  try {
    const r = await loadResident(id);
    if (!r) return res.status(404).json({ error: 'Account not found.' });
    if (r.verification_status !== 'Verified' || !r.is_active) {
      return res.status(409).json({ error: 'Only active verified accounts can be terminated.' });
    }
    await pool.execute(
      'UPDATE users SET is_active = FALSE, termination_reason = ? WHERE user_id = ?',
      [reason, r.user_id]
    );
    res.json({ message: 'Account terminated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// reactivate a terminated account
router.post('/accounts/:id/reactivate', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid account.' });
  try {
    const r = await loadResident(id);
    if (!r) return res.status(404).json({ error: 'Account not found.' });
    if (r.is_active) return res.status(409).json({ error: 'This account is already active.' });
    await pool.execute(
      'UPDATE users SET is_active = TRUE, termination_reason = NULL WHERE user_id = ?',
      [r.user_id]
    );
    res.json({ message: 'Account reactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;