import pg from 'pg';
import { createDb } from '../src/db.js';

/**
 * Baza za testove: u memoriji (pg-mem), ili pravi PostgreSQL kad je postavljen
 * TEST_DATABASE_URL – tada se njegova shema prije testa briše, pa nikad ne koristi bazu s podacima.
 */
export async function createTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createDb(null);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await client.end();
  return createDb(url);
}
