const express = require('express');
const pool = require('../db');
const { upload, saveFile, removeFile } = require('../storage');

const router = express.Router();

function requireResident(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'resident') {
    return res.status(401).json({ error: 'Please log in as a resident.' });
  }
  next();
}

// get my profile
router.get('/', requireResident, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.email, r.first_name, r.last_name, r.birthdate, r.address, r.contact_no,
              r.verification_status, r.verification_remarks
       FROM residents r JOIN users u ON u.user_id = r.user_id
       WHERE r.user_id = ?`,
      [req.session.user.user_id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// edit my details
router.put('/', requireResident, async (req, res) => {
  const { first_name, last_name, address, contact_no } = req.body;
  const required = [first_name, last_name, address];
  if (required.some(v => typeof v !== 'string' || !v.trim())) {
    return res.status(400).json({ error: 'First name, last name and address are required.' });
  }
  try {
    await pool.execute(
      'UPDATE residents SET first_name = ?, last_name = ?, address = ?, contact_no = ? WHERE user_id = ?',
      [
        first_name.trim(),
        last_name.trim(),
        address.trim(),
        typeof contact_no === 'string' && contact_no.trim() ? contact_no.trim() : null,
        req.session.user.user_id
      ]
    );
    res.json({ message: 'Profile updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// upload my ID
router.post('/id', requireResident, (req, res) => {
  upload.single('id_file')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 4 MB).' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });

    const userId = req.session.user.user_id;
    let key = null;
    try {
      const [rows] = await pool.execute(
        'SELECT verification_status, id_file_path FROM residents WHERE user_id = ?',
        [userId]
      );
      const current = rows[0];

      if (current.verification_status === 'Verified') {
        return res.status(409).json({ error: 'Your account is already verified.' });
      }

      key = await saveFile('ids', req.file);

      await pool.execute(
        `UPDATE residents
         SET id_file_path = ?, verification_status = 'Pending', verification_remarks = NULL
         WHERE user_id = ?`,
        [key, userId]
      );
      await pool.execute(
        'INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)',
        [userId, 'Your ID was submitted and is waiting for admin review.', '/resident/profile']
      );

      if (current.id_file_path) await removeFile(current.id_file_path);
      res.json({ message: 'ID uploaded. Waiting for admin review.' });
    } catch (e) {
      console.error(e);
      if (key) await removeFile(key);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });
});

module.exports = router;