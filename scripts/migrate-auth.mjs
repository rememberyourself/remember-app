#!/usr/bin/env node
/**
 * migrate-auth.mjs
 * 
 * Creates Supabase Auth users for all existing app users,
 * linking them via the auth_user_id column.
 * 
 * Each user gets: email = {code}@remember.app, password = {code}
 * The login UX stays the same — clients enter their code.
 * 
 * Run once: node scripts/migrate-auth.mjs
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://osyhjclkinguhmqcawbs.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zeWhqY2xraW5ndWhtcWNhd2JzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAzNTc5OCwiZXhwIjoyMDg2NjExNzk4fQ.RoFZIi2f7Y3lFy8LJVmy1Wj41C9WexzRkdmwdD3Y3-Y';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.osyhjclkinguhmqcawbs:KypjZQPgcyTi6tUY@aws-1-eu-central-2.pooler.supabase.com:5432/postgres';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('🔧 Starting auth migration...\n');

  // 1. Ensure auth_user_id column exists
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID;
    CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
  `);
  console.log('✅ auth_user_id column ready\n');

  // 2. Get all users
  const { rows: users } = await pool.query('SELECT id, name, role, code, auth_user_id FROM users');
  console.log(`📋 Found ${users.length} users:\n`);

  for (const user of users) {
    console.log(`  Processing: ${user.name} (${user.role}, code: ${user.code})`);

    // Skip if already migrated
    if (user.auth_user_id) {
      console.log(`    ⏭️  Already has auth_user_id: ${user.auth_user_id}`);
      continue;
    }

    const email = `${user.code.toLowerCase()}@remember.app`;
    const password = user.code; // Code IS the password

    try {
      // Create Supabase Auth user
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm (no verification email)
        user_metadata: {
          name: user.name,
          role: user.role,
          app_user_id: user.id,
        },
      });

      if (error) {
        // If user already exists with this email, try to find them
        if (error.message?.includes('already been registered')) {
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existing = existingUsers?.users?.find(u => u.email === email);
          if (existing) {
            await pool.query('UPDATE users SET auth_user_id = $1 WHERE id = $2', [existing.id, user.id]);
            console.log(`    🔗 Linked to existing auth user: ${existing.id}`);
            continue;
          }
        }
        console.error(`    ❌ Error: ${error.message}`);
        continue;
      }

      // Link auth user to app user
      await pool.query('UPDATE users SET auth_user_id = $1 WHERE id = $2', [data.user.id, user.id]);
      console.log(`    ✅ Created auth user: ${data.user.id} (${email})`);

    } catch (err) {
      console.error(`    ❌ Exception: ${err.message}`);
    }
  }

  // 3. Verify
  console.log('\n📊 Verification:');
  const { rows: verified } = await pool.query('SELECT name, role, code, auth_user_id FROM users ORDER BY role, name');
  for (const u of verified) {
    const status = u.auth_user_id ? '✅' : '❌';
    console.log(`  ${status} ${u.name} (${u.role}) → ${u.auth_user_id || 'NO AUTH USER'}`);
  }

  const unlinked = verified.filter(u => !u.auth_user_id);
  if (unlinked.length > 0) {
    console.log(`\n⚠️  ${unlinked.length} users without auth link!`);
  } else {
    console.log('\n🎉 All users linked to Supabase Auth!');
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
