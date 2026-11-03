require('dotenv').config();
const { Pool, types } = require('pg');

// return dates, times and counts in the same shape the app already expects
types.setTypeParser(1082, v => v);                // DATE      -> 'YYYY-MM-DD'
types.setTypeParser(1114, v => v.slice(0, 19));   // TIMESTAMP -> 'YYYY-MM-DD HH:MM:SS'
types.setTypeParser(20, v => Number(v));          // BIGINT (COUNT) -> number

// primary key of each table, used to give back the id of a new row
const PK = {
  users: 'user_id',
  residents: 'resident_id',
  document_types: 'document_type_id',
  document_requests: 'request_id',
  facilities: 'facility_id',
  reservations: 'reservation_id',
  notifications: 'notification_id'
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});
pool.on('error', err => console.error('Database pool error:', err.message));

// turns "?" placeholders into $1, $2, ...
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

// runs one query and returns the same shapes the rest of the app already uses
async function run(executor, sql, params = []) {
  let text = toPg(sql);
  const insert = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(sql);
  if (insert && PK[insert[1]] && !/RETURNING/i.test(text)) {
    text += ' RETURNING ' + PK[insert[1]];
  }

  let result;
  try {
    result = await executor.query(text, params);
  } catch (err) {
    if (err.code === '23505') err.code = 'ER_DUP_ENTRY';   // duplicate value
    throw err;
  }

  if (result.command === 'SELECT') return [result.rows, result.fields];
  if (result.command === 'INSERT') {
    const row = result.rows[0];
    const insertId = row && insert && PK[insert[1]] ? row[PK[insert[1]]] : 0;
    return [{ insertId, affectedRows: result.rowCount }];
  }
  return [{ affectedRows: result.rowCount }];
}

module.exports = {
  execute: (sql, params) => run(pool, sql, params),
  query: (sql, params) => run(pool, sql, params),
  async getConnection() {
    const client = await pool.connect();
    return {
      execute: (sql, params) => run(client, sql, params),
      query: (sql, params) => run(client, sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release()
    };
  },
  end: () => pool.end()
};