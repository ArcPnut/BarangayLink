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

function parseCapacity(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10000) return { ok: false };
  return { ok: true, value: n };
}

// ---------------- document types ----------------

router.get('/document-types', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.document_type_id, t.document_name, t.description, t.is_active,
              COUNT(q.request_id) AS usage_count
       FROM document_types t
       LEFT JOIN document_requests q ON q.document_type_id = t.document_type_id
       GROUP BY t.document_type_id, t.document_name, t.description, t.is_active
       ORDER BY t.document_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/document-types', async (req, res) => {
  const name = clean(req.body.document_name);
  const description = clean(req.body.description);
  const active = req.body.is_active !== false;

  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Enter a document name (up to 100 characters).' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ error: 'The description is too long (max 255 characters).' });
  }
  try {
    const [dupes] = await pool.execute(
      'SELECT document_type_id FROM document_types WHERE LOWER(document_name) = LOWER(?)',
      [name]
    );
    if (dupes[0]) return res.status(409).json({ error: 'A document type with that name already exists.' });

    await pool.execute(
      'INSERT INTO document_types (document_name, description, is_active) VALUES (?, ?, ?)',
      [name, description, active]
    );
    res.status(201).json({ message: 'Document type added.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.put('/document-types/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const name = clean(req.body.document_name);
  const description = clean(req.body.description);

  if (!id) return res.status(400).json({ error: 'Invalid document type.' });
  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Enter a document name (up to 100 characters).' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ error: 'The description is too long (max 255 characters).' });
  }
  if (typeof req.body.is_active !== 'boolean') {
    return res.status(400).json({ error: 'Choose a catalog status.' });
  }
  try {
    const [found] = await pool.execute(
      'SELECT document_type_id FROM document_types WHERE document_type_id = ?',
      [id]
    );
    if (!found[0]) return res.status(404).json({ error: 'Document type not found.' });

    const [dupes] = await pool.execute(
      'SELECT document_type_id FROM document_types WHERE LOWER(document_name) = LOWER(?) AND document_type_id <> ?',
      [name, id]
    );
    if (dupes[0]) return res.status(409).json({ error: 'A document type with that name already exists.' });

    await pool.execute(
      'UPDATE document_types SET document_name = ?, description = ?, is_active = ? WHERE document_type_id = ?',
      [name, description, req.body.is_active, id]
    );
    res.json({ message: 'Document type updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/document-types/:id/active', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid document type.' });
  if (typeof req.body.is_active !== 'boolean') {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    const [result] = await pool.execute(
      'UPDATE document_types SET is_active = ? WHERE document_type_id = ?',
      [req.body.is_active, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Document type not found.' });
    res.json({ message: req.body.is_active ? 'Document type activated.' : 'Document type deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ---------------- facilities ----------------

router.get('/facilities', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT f.facility_id, f.facility_name, f.description, f.capacity, f.is_active,
              COUNT(r.reservation_id) AS usage_count
       FROM facilities f
       LEFT JOIN reservations r ON r.facility_id = f.facility_id
       GROUP BY f.facility_id, f.facility_name, f.description, f.capacity, f.is_active
       ORDER BY f.facility_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/facilities', async (req, res) => {
  const name = clean(req.body.facility_name);
  const description = clean(req.body.description);
  const capacity = parseCapacity(req.body.capacity);
  const active = req.body.is_active !== false;

  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Enter a facility name (up to 100 characters).' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ error: 'The description is too long (max 255 characters).' });
  }
  if (!capacity.ok) {
    return res.status(400).json({ error: 'Capacity must be a whole number from 1 to 10000, or left empty.' });
  }
  try {
    const [dupes] = await pool.execute(
      'SELECT facility_id FROM facilities WHERE LOWER(facility_name) = LOWER(?)',
      [name]
    );
    if (dupes[0]) return res.status(409).json({ error: 'A facility with that name already exists.' });

    await pool.execute(
      'INSERT INTO facilities (facility_name, description, capacity, is_active) VALUES (?, ?, ?, ?)',
      [name, description, capacity.value, active]
    );
    res.status(201).json({ message: 'Facility added.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.put('/facilities/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const name = clean(req.body.facility_name);
  const description = clean(req.body.description);
  const capacity = parseCapacity(req.body.capacity);

  if (!id) return res.status(400).json({ error: 'Invalid facility.' });
  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Enter a facility name (up to 100 characters).' });
  }
  if (description && description.length > 255) {
    return res.status(400).json({ error: 'The description is too long (max 255 characters).' });
  }
  if (!capacity.ok) {
    return res.status(400).json({ error: 'Capacity must be a whole number from 1 to 10000, or left empty.' });
  }
  if (typeof req.body.is_active !== 'boolean') {
    return res.status(400).json({ error: 'Choose a catalog status.' });
  }
  try {
    const [found] = await pool.execute('SELECT facility_id FROM facilities WHERE facility_id = ?', [id]);
    if (!found[0]) return res.status(404).json({ error: 'Facility not found.' });

    const [dupes] = await pool.execute(
      'SELECT facility_id FROM facilities WHERE LOWER(facility_name) = LOWER(?) AND facility_id <> ?',
      [name, id]
    );
    if (dupes[0]) return res.status(409).json({ error: 'A facility with that name already exists.' });

    await pool.execute(
      'UPDATE facilities SET facility_name = ?, description = ?, capacity = ?, is_active = ? WHERE facility_id = ?',
      [name, description, capacity.value, req.body.is_active, id]
    );
    res.json({ message: 'Facility updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/facilities/:id/active', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid facility.' });
  if (typeof req.body.is_active !== 'boolean') {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    const [result] = await pool.execute(
      'UPDATE facilities SET is_active = ? WHERE facility_id = ?',
      [req.body.is_active, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Facility not found.' });
    res.json({ message: req.body.is_active ? 'Facility activated.' : 'Facility deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;