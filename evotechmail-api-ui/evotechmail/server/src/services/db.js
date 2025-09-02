// server/src/services/db.js
import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'evomail',
  client_encoding: 'UTF8',
  options: process.env.PGOPTIONS || '-c search_path=public,evomail'
});