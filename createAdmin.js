require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.log('Usage: node createAdmin.js <email> <password, 8+ characters>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.execute(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
    [email.trim().toLowerCase(), hash]
  );
  console.log('Admin account created for', email.trim().toLowerCase());
  await pool.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });