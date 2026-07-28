require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

const migrate = async () => {
  const client = await pool.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationDir = path.join(__dirname);
    const files = fs.readdirSync(migrationDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1', [file]
      );
      if (rows.length > 0) {
        console.log(`  Skipping ${file} (already run)`);
        continue;
      }
      console.log(`  Running ${file}...`);
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations(filename) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ ${file} completed`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${file} failed:`, err.message);
        throw err;
      }
    }
    console.log('\nAll migrations completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
};

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
