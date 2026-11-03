require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// the host puts a proxy in front of the app, needed for secure cookies
if (isProd) app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
  name: 'bl_session',
  keys: [process.env.SESSION_SECRET],
  maxAge: 1000 * 60 * 60 * 2,
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd
}));

// end the session of anyone whose account has been terminated
app.use(async (req, res, next) => {
  if (!req.session || !req.session.user) return next();
  try {
    const [rows] = await pool.execute(
      'SELECT is_active FROM users WHERE user_id = ?',
      [req.session.user.user_id]
    );
    if (!rows[0] || !rows[0].is_active) {
      req.session = null;
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Your session has ended.' });
      }
      return res.redirect('/');
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ---------- access control ----------
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  next();
}

function pageRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) return res.redirect('/');
    if (req.session.user.role !== role) return res.status(403).send('Access denied.');
    next();
  };
}

// ---------- register ----------
app.post('/api/register', async (req, res) => {
  const { email, password, first_name, last_name, birthdate, address, contact_no } = req.body;

  const required = [email, password, first_name, last_name, birthdate, address];
  if (required.some(v => typeof v !== 'string' || !v.trim())) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime()) || birth > new Date()) {
    return res.status(400).json({ error: 'Enter a valid birthdate.' });
  }

  const conn = await pool.getConnection();
  try {
    const hash = await bcrypt.hash(password, 10);
    await conn.beginTransaction();

    const [result] = await conn.execute(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email.trim().toLowerCase(), hash, 'resident']
    );
    await conn.execute(
      `INSERT INTO residents (user_id, last_name, first_name, birthdate, address, contact_no)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        last_name.trim(),
        first_name.trim(),
        birthdate,
        address.trim(),
        typeof contact_no === 'string' && contact_no.trim() ? contact_no.trim() : null
      ]
    );

    await conn.commit();
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That email is already registered.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } finally {
    conn.release();
  }
});

// ---------- login ----------
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Enter your email and password.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT user_id, password_hash, role, is_active, termination_reason FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    const user = rows[0];
    const ok = user && await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ error: 'Incorrect email or password. Try again.' });
    }
    if (!user.is_active) {
      return res.status(403).json({
        error: 'This account has been terminated.' +
          (user.termination_reason ? '\nReason: ' + user.termination_reason : '')
      });
    }

    req.session = { user: { user_id: user.user_id, role: user.role } };
    res.json({ redirect: user.role === 'admin' ? '/admin' : '/resident' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---------- logout ----------
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ---------- who am I ----------
app.get('/api/me', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.email, u.role, r.first_name, r.last_name, r.verification_status
       FROM users u
       LEFT JOIN residents r ON r.user_id = u.user_id
       WHERE u.user_id = ?`,
      [req.session.user.user_id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ---------- resident routes ----------
app.use('/api/profile', require('./routes/profile'));
app.use('/api', require('./routes/requests'));
app.use('/api/resident', require('./routes/reservations'));
app.use('/api', require('./routes/notifications'));

// ---------- admin routes ----------
app.use('/api/admin', require('./routes/adminAccounts'));
app.use('/api/admin', require('./routes/adminRequests'));
app.use('/api/admin', require('./routes/adminReservations'));
app.use('/api/admin', require('./routes/adminCatalog'));
app.use('/api/admin', require('./routes/adminDashboard'));

// ---------- protected pages ----------
app.get('/resident', pageRole('resident'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'resident.html'));
});
app.get('/resident/profile', pageRole('resident'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'profile.html'));
});
app.get('/resident/requests', pageRole('resident'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'requests.html'));
});
app.get('/resident/reservations', pageRole('resident'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'reservations.html'));
});
app.get('/resident/notifications', pageRole('resident'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'notifications.html'));
});

app.get('/admin', pageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});
app.get('/admin/accounts', pageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-accounts.html'));
});
app.get('/admin/requests', pageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-requests.html'));
});
app.get('/admin/reservations', pageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-reservations.html'));
});
app.get(['/admin/document-types', '/admin/facilities'], pageRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-catalog.html'));
});

// ---------- last resort error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// run normally on your computer, and export the app for Vercel
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`BarangayLink running at http://localhost:${PORT}`));
}

module.exports = app;