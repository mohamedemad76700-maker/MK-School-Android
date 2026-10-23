#!/usr/bin/env node
'use strict';

const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const argon2 = require('argon2');

async function main() {
  if (!process.argv.includes('--confirm-reset-admin')) {
    throw new Error('This changes the live administrator password. Re-run with --confirm-reset-admin after reviewing the target database.');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Start this script from the project root with --env-file=.env.');
  const password = randomBytes(32).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await pool.query('ALTER TABLE video_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1');
    const result = await pool.query("UPDATE video_users SET password=$1,session_version=session_version+1 WHERE id='admin' AND role='admin' RETURNING id");
    if (!result.rowCount) throw new Error('The administrator account was not found; no password was changed.');
  } finally {
    await pool.end();
  }
  console.log('Admin password reset. Copy this once, sign in, then set a new private password in the admin panel:');
  console.log(password);
}

main().catch(error => {
  console.error(`[ERROR] ${error instanceof Error ? error.message : 'Admin password reset failed.'}`);
  process.exitCode = 1;
});
