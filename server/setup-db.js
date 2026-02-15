import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres.osyhjclkinguhmqcawbs:KypjZQPgcyTi6tUY@aws-1-eu-central-2.pooler.supabase.com:5432/postgres';

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach', 'client')),
  code TEXT UNIQUE NOT NULL,
  avatar TEXT,
  custom_practices JSONB DEFAULT '[]'::jsonb,
  resources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Checkins table
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ratings JSONB DEFAULT '{}'::jsonb,
  practices JSONB DEFAULT '{}'::jsonb,
  media_type TEXT DEFAULT 'none',
  text_note TEXT DEFAULT '',
  media_path TEXT,
  ai_analysis JSONB,
  coach_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Replies table (ping-pong thread on checkins)
CREATE TABLE IF NOT EXISTS replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
  "from" TEXT NOT NULL CHECK ("from" IN ('client', 'coach')),
  type TEXT DEFAULT 'text',
  media_path TEXT,
  text TEXT DEFAULT '',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast checkin lookups
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date DESC);
CREATE INDEX IF NOT EXISTS idx_replies_checkin_id ON replies(checkin_id);

-- Insert default coach if not exists
INSERT INTO users (name, role, code) 
VALUES ('Oliver', 'coach', 'COACH2024')
ON CONFLICT (code) DO NOTHING;

-- Insert demo client if not exists
INSERT INTO users (name, role, code)
VALUES ('Demo Client', 'client', 'DEMO')
ON CONFLICT (code) DO NOTHING;
`;

async function setup() {
  console.log('🔧 Setting up database schema...');
  try {
    await pool.query(schema);
    console.log('✅ Database schema created successfully!');
    
    const { rows } = await pool.query('SELECT id, name, role, code FROM users');
    console.log('📋 Users:', rows);
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
  } finally {
    await pool.end();
  }
}

setup();
