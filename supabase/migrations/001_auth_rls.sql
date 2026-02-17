-- Migration: Add Supabase Auth integration + Row Level Security
-- Run this AFTER creating auth users via migrate-auth.mjs

-- 1. Add auth_user_id column to link app users to Supabase Auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- 2. Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for USERS table

-- Coach can read all users
CREATE POLICY "coach_read_all_users" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'coach')
  );

-- Clients can read their own profile
CREATE POLICY "client_read_own_profile" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Coach can do everything with users
CREATE POLICY "coach_manage_users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'coach')
  );

-- Clients can update their own profile (avatar, last_seen, custom_practices)
CREATE POLICY "client_update_own_profile" ON users
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 4. RLS Policies for CHECKINS table

-- Coach can do everything with checkins
CREATE POLICY "coach_manage_checkins" ON checkins
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'coach')
  );

-- Clients can read their own checkins
CREATE POLICY "client_read_own_checkins" ON checkins
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Clients can create their own checkins
CREATE POLICY "client_create_checkins" ON checkins
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- 5. RLS Policies for REPLIES table

-- Coach can do everything with replies
CREATE POLICY "coach_manage_replies" ON replies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid() AND u.role = 'coach')
  );

-- Clients can read replies on their checkins
CREATE POLICY "client_read_own_replies" ON replies
  FOR SELECT USING (
    checkin_id IN (
      SELECT c.id FROM checkins c
      JOIN users u ON c.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Clients can create replies on their checkins
CREATE POLICY "client_create_replies" ON replies
  FOR INSERT WITH CHECK (
    checkin_id IN (
      SELECT c.id FROM checkins c
      JOIN users u ON c.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- 6. Storage policies for 'uploads' bucket
-- (These are set via Supabase dashboard or storage API, not SQL)
-- Authenticated users can upload
-- Public read access for all files

-- 7. Service role bypass note:
-- The service role key (used by Edge Functions / serverless) bypasses RLS entirely.
-- This is by design — server-side operations like AI analysis need full access.
