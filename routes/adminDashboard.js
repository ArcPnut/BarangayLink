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

const pad = n => String(n).padStart(2, '0');

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function fullName(r) {
  return `${r.first_name} ${r.last_name}`;
}

router.get('/dashboard', async (req, res) => {
  const month = typeof req.query.month === 'string' ? req.query.month : currentMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month.' });
  }
  const [y, m] = month.split('-').map(Number);
  if (y < 2000 || y > 2100) return res.status(400).json({ error: 'Invalid month.' });

  const first = `${y}-${pad(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;

  try {
    const [
      [countRows],
      [perType],
      [perFacility],
      [pendingAccounts],
      [pendingDocs],
      [pendingReservations]
    ] = await Promise.all([
      pool.execute(
        `SELECT
           (SELECT COUNT(*) FROM residents WHERE verification_status = 'Pending') AS pending_accounts,
           (SELECT COUNT(*) FROM document_requests WHERE status = 'Pending') AS pending_documents,
           (SELECT COUNT(*) FROM reservations WHERE status = 'Pending') AS pending_reservations,
           (SELECT COUNT(*) FROM document_requests WHERE status = 'Ready for Pickup') AS ready_for_pickup`
      ),
      pool.execute(
        `SELECT t.document_name AS label, COUNT(q.request_id) AS total
         FROM document_types t
         LEFT JOIN document_requests q
           ON q.document_type_id = t.document_type_id
          AND q.status <> 'Cancelled'
          AND q.requested_at >= ? AND q.requested_at < ?
         GROUP BY t.document_type_id, t.document_name
         ORDER BY t.document_name`,
        [first, next]
      ),
      pool.execute(
        `SELECT f.facility_name AS label, COUNT(r.reservation_id) AS total
         FROM facilities f
         LEFT JOIN reservations r
           ON r.facility_id = f.facility_id
          AND r.status = 'Approved'
          AND r.reservation_date >= ? AND r.reservation_date < ?
         GROUP BY f.facility_id, f.facility_name
         ORDER BY f.facility_name`,
        [first, next]
      ),
      pool.execute(
        `SELECT resident_id, first_name, last_name FROM residents
         WHERE verification_status = 'Pending'
         ORDER BY resident_id ASC LIMIT 5`
      ),
      pool.execute(
        `SELECT q.request_id, r.first_name, r.last_name
         FROM document_requests q JOIN residents r ON r.resident_id = q.resident_id
         WHERE q.status = 'Pending'
         ORDER BY q.requested_at ASC, q.request_id ASC LIMIT 5`
      ),
      pool.execute(
        `SELECT s.reservation_id, r.first_name, r.last_name
         FROM reservations s JOIN residents r ON r.resident_id = s.resident_id
         WHERE s.status = 'Pending'
         ORDER BY s.requested_at ASC, s.reservation_id ASC LIMIT 5`
      )
    ]);

    const c = countRows[0];
    const counts = {
      pending_accounts: Number(c.pending_accounts),
      pending_documents: Number(c.pending_documents),
      pending_reservations: Number(c.pending_reservations),
      ready_for_pickup: Number(c.ready_for_pickup)
    };

    res.json({
      month,
      counts,
      requestsPerType: perType.map(r => ({ label: r.label, total: Number(r.total) })),
      facilityUsage: perFacility.map(r => ({ label: r.label, total: Number(r.total) })),
      queues: {
        accounts: {
          total: counts.pending_accounts,
          items: pendingAccounts.map(r => `A-${pad(r.resident_id)} ${fullName(r)}`)
        },
        documents: {
          total: counts.pending_documents,
          items: pendingDocs.map(r => `D-${String(r.request_id).padStart(3, '0')} ${fullName(r)}`)
        },
        reservations: {
          total: counts.pending_reservations,
          items: pendingReservations.map(r => `R-${String(r.reservation_id).padStart(3, '0')} ${fullName(r)}`)
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;