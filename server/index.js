import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ===== DATABASE =====
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.osyhjclkinguhmqcawbs:KypjZQPgcyTi6tUY@aws-1-eu-central-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('🔴 Pool error:', err.message));

// ===== SUPABASE STORAGE =====
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://osyhjclkinguhmqcawbs.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zeWhqY2xraW5ndWhtcWNhd2JzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAzNTc5OCwiZXhwIjoyMDg2NjExNzk4fQ.RoFZIi2f7Y3lFy8LJVmy1Wj41C9WexzRkdmwdD3Y3-Y'
);

async function uploadToSupabase(file) {
  const ext = file.originalname.split('.').pop();
  const filename = `${randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('uploads').upload(filename, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  return filename;
}

function getPublicUrl(filename) {
  if (!filename) return null;
  const { data } = supabase.storage.from('uploads').getPublicUrl(filename);
  return data.publicUrl;
}

// Middleware
app.use(cors());
app.use(express.json());

// File upload config (memory storage for Supabase)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ===== AI ANALYSIS (async background) =====

const COACHING_SYSTEM_PROMPT = `You are an experienced men's work coach analyzing a client's check-in. This is a context of masculine self-development — presence, vulnerability, authenticity, heart vs mind, shadow work, and personal responsibility.

Analyze the following check-in transcript/text and return a JSON object with:
- "keyPoints" (array of strings): the key things the person shared or expressed
- "patterns" (array of strings): behavioral, emotional, or relational patterns you notice
- "suggestedQuestions" (array of strings): powerful coaching questions to deepen inquiry
- "mood" (string): the overall emotional state/tone (e.g. "reflective", "anxious", "grounded", "frustrated", "hopeful")

Be direct, compassionate, and perceptive. Look beneath the surface. Notice what's said AND what might be unsaid. Frame patterns without judgment.

Return ONLY valid JSON, no markdown fences.`;

async function transcribeMedia(fileBuffer, ext) {
  ext = ext || 'webm';
  const mimeMap = { webm: 'video/webm', mp4: 'video/mp4', m4a: 'audio/m4a', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg' };
  const mime = mimeMap[ext] || 'application/octet-stream';

  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: mime }), `recording.${ext}`);
  form.append('model', 'whisper-1');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Whisper API error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  return data.text;
}

async function analyzeText(text) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COACHING_SYSTEM_PROMPT },
        { role: 'user', content: `Check-in transcript:\n\n${text}` },
      ],
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Chat API error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned);
}

async function processCheckinAnalysis(checkinId, mediaType, mediaPath, textNote) {
  try {
    console.log(`🧠 Starting AI analysis for check-in ${checkinId} (${mediaType})`);
    let transcript = '';

    if ((mediaType === 'video' || mediaType === 'audio') && mediaPath) {
      const { data, error } = await supabase.storage.from('uploads').download(mediaPath);
      if (error) throw new Error(`Download error: ${error.message}`);
      const fileBuffer = Buffer.from(await data.arrayBuffer());
      const ext = mediaPath.split('.').pop() || 'webm';
      transcript = await transcribeMedia(fileBuffer, ext);
      console.log(`📝 Transcribed ${mediaType}: ${transcript.substring(0, 100)}...`);
    } else if (mediaType === 'text' && textNote) {
      transcript = textNote;
    } else {
      console.log(`⏭️ Skipping analysis for check-in ${checkinId} — no analyzable content`);
      return;
    }

    if (!transcript || transcript.trim().length < 5) {
      console.log(`⏭️ Skipping analysis — transcript too short`);
      return;
    }

    const analysis = await analyzeText(transcript);

    const aiAnalysis = {
      ...analysis,
      transcript: (mediaType === 'video' || mediaType === 'audio') ? transcript : undefined,
      timestamp: new Date().toISOString(),
    };

    await pool.query('UPDATE checkins SET ai_analysis = $1 WHERE id = $2', [JSON.stringify(aiAnalysis), checkinId]);
    console.log(`✅ AI analysis saved for check-in ${checkinId}`);

  } catch (err) {
    console.error(`❌ AI analysis failed for check-in ${checkinId}:`, err.message);
    try {
      const errorAnalysis = { error: err.message, timestamp: new Date().toISOString() };
      await pool.query('UPDATE checkins SET ai_analysis = $1 WHERE id = $2', [JSON.stringify(errorAnalysis), checkinId]);
    } catch (saveErr) {
      console.error(`❌ Failed to save error state:`, saveErr.message);
    }
  }
}

// ===== HELPER: format checkin row for API response =====
function formatCheckin(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    ratings: row.ratings || {},
    practices: row.practices || {},
    mediaType: row.media_type || 'none',
    textNote: row.text_note || '',
    mediaPath: row.media_path,
    aiAnalysis: row.ai_analysis || null,
    coachResponse: row.coach_response || null,
    replies: row.replies || undefined,
    createdAt: row.created_at,
  };
}

// ===== AUTH ROUTES =====

app.post('/api/auth/login', async (req, res) => {
  try {
    const { code } = req.body;
    const { rows } = await pool.query('SELECT id, name, role, avatar, custom_practices FROM users WHERE UPPER(code) = UPPER($1)', [code]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid code' });
    const user = rows[0];
    res.json({ id: user.id, name: user.name, role: user.role, avatar: user.avatar || null, customPractices: user.custom_practices || [] });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/invite', async (req, res) => {
  try {
    const { name } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { rows } = await pool.query(
      'INSERT INTO users (name, role, code) VALUES ($1, $2, $3) RETURNING id',
      [name, 'client', code]
    );
    res.json({ code, id: rows[0].id });
  } catch (err) {
    console.error('Invite error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== AVATAR ROUTE =====

app.post('/api/clients/:id/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarPath = await uploadToSupabase(req.file);
    const { rowCount } = await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarPath, req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ avatar: avatarPath });
  } catch (err) {
    console.error('Avatar error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== CUSTOM PRACTICES ROUTES =====

app.post('/api/clients/:id/practices', async (req, res) => {
  try {
    const { practice } = req.body;
    if (!practice || !practice.trim()) return res.status(400).json({ error: 'Practice name required' });
    const trimmed = practice.trim();

    const { rows } = await pool.query('SELECT custom_practices FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const practices = rows[0].custom_practices || [];
    if (!practices.includes(trimmed)) {
      practices.push(trimmed);
      await pool.query('UPDATE users SET custom_practices = $1 WHERE id = $2', [JSON.stringify(practices), req.params.id]);
    }
    res.json({ customPractices: practices });
  } catch (err) {
    console.error('Add practice error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/clients/:id/practices', async (req, res) => {
  try {
    const { practice } = req.body;
    const { rows } = await pool.query('SELECT custom_practices FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const practices = (rows[0].custom_practices || []).filter(p => p !== practice);
    await pool.query('UPDATE users SET custom_practices = $1 WHERE id = $2', [JSON.stringify(practices), req.params.id]);
    res.json({ customPractices: practices });
  } catch (err) {
    console.error('Delete practice error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile
app.get('/api/clients/:id/profile', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, role, avatar, custom_practices FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const user = rows[0];
    res.json({
      id: user.id, name: user.name, role: user.role,
      avatar: user.avatar || null, customPractices: user.custom_practices || [],
    });
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== CHECKIN ROUTES =====

// Latest coach response
app.get('/api/checkins/latest-response/:clientId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM checkins WHERE user_id = $1 AND coach_response IS NOT NULL 
       ORDER BY (coach_response->>'timestamp') DESC NULLS LAST, created_at DESC LIMIT 1`,
      [req.params.clientId]
    );
    if (rows.length === 0) return res.json(null);

    const checkin = formatCheckin(rows[0]);
    // Also fetch replies
    const { rows: replies } = await pool.query(
      'SELECT * FROM replies WHERE checkin_id = $1 ORDER BY timestamp ASC', [checkin.id]
    );
    checkin.replies = replies.map(r => ({
      id: r.id, from: r.from, type: r.type, mediaPath: r.media_path, text: r.text, timestamp: r.timestamp,
    }));
    res.json(checkin);
  } catch (err) {
    console.error('Latest response error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/checkins', upload.single('media'), async (req, res) => {
  try {
    const { userId, date, ratings, practices, mediaType, textNote } = req.body;
    const parsedRatings = ratings ? JSON.parse(ratings) : {};
    const parsedPractices = practices ? JSON.parse(practices) : {};

    const mediaFilename = req.file ? await uploadToSupabase(req.file) : null;
    const { rows } = await pool.query(
      `INSERT INTO checkins (user_id, date, ratings, practices, media_type, text_note, media_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, date, JSON.stringify(parsedRatings), JSON.stringify(parsedPractices),
       mediaType || 'none', textNote || '', mediaFilename]
    );

    const checkin = formatCheckin(rows[0]);
    res.status(201).json(checkin);

    // Fire-and-forget async AI analysis
    if (checkin.mediaType === 'video' || checkin.mediaType === 'audio' || checkin.mediaType === 'text') {
      processCheckinAnalysis(checkin.id, checkin.mediaType, checkin.mediaPath, checkin.textNote);
    }
  } catch (err) {
    console.error('Create checkin error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/checkins/:userId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM checkins WHERE user_id = $1 ORDER BY date DESC', [req.params.userId]
    );

    // Fetch replies for all checkins
    const checkinIds = rows.map(r => r.id);
    let repliesMap = {};
    if (checkinIds.length > 0) {
      const { rows: allReplies } = await pool.query(
        'SELECT * FROM replies WHERE checkin_id = ANY($1) ORDER BY timestamp ASC', [checkinIds]
      );
      for (const r of allReplies) {
        if (!repliesMap[r.checkin_id]) repliesMap[r.checkin_id] = [];
        repliesMap[r.checkin_id].push({
          id: r.id, from: r.from, type: r.type, mediaPath: r.media_path, text: r.text, timestamp: r.timestamp,
        });
      }
    }

    const checkins = rows.map(row => {
      const c = formatCheckin(row);
      if (repliesMap[c.id]) c.replies = repliesMap[c.id];
      return c;
    });

    res.json(checkins);
  } catch (err) {
    console.error('Get checkins error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== CLIENT ROUTES (for coach) =====

app.get('/api/clients', async (req, res) => {
  try {
    const { rows: users } = await pool.query("SELECT * FROM users WHERE role = 'client'");
    const clients = [];

    for (const u of users) {
      const { rows: userCheckins } = await pool.query(
        'SELECT date FROM checkins WHERE user_id = $1 ORDER BY date DESC', [u.id]
      );

      // Calculate streak
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        if (userCheckins.some(c => c.date === dateStr)) {
          streak++;
        } else if (i > 0) break;
      }

      clients.push({
        id: u.id, name: u.name, avatar: u.avatar || null,
        lastCheckin: userCheckins[0]?.date || null,
        totalCheckins: userCheckins.length, streak,
        code: u.code, createdAt: u.created_at || null,
      });
    }

    res.json(clients);
  } catch (err) {
    console.error('Get clients error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { name, code } = req.body;

    if (code) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM users WHERE UPPER(code) = UPPER($1) AND id != $2', [code, req.params.id]
      );
      if (existing.length > 0) return res.status(409).json({ error: 'Code already in use' });
    }

    const updates = [];
    const values = [];
    let idx = 1;
    if (name) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
    if (code) { updates.push(`code = $${idx++}`); values.push(code.toUpperCase()); }
    values.push(req.params.id);

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} AND role = 'client' RETURNING id, name, code`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update client error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1 AND role = 'client'", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    // Checkins cascade-deleted via FK
    res.json({ success: true });
  } catch (err) {
    console.error('Delete client error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (userRows.length === 0) return res.status(404).json({ error: 'Not found' });
    const user = userRows[0];

    const { rows: checkinRows } = await pool.query(
      'SELECT * FROM checkins WHERE user_id = $1 ORDER BY date DESC', [user.id]
    );

    // Fetch replies
    const checkinIds = checkinRows.map(r => r.id);
    let repliesMap = {};
    if (checkinIds.length > 0) {
      const { rows: allReplies } = await pool.query(
        'SELECT * FROM replies WHERE checkin_id = ANY($1) ORDER BY timestamp ASC', [checkinIds]
      );
      for (const r of allReplies) {
        if (!repliesMap[r.checkin_id]) repliesMap[r.checkin_id] = [];
        repliesMap[r.checkin_id].push({
          id: r.id, from: r.from, type: r.type, mediaPath: r.media_path, text: r.text, timestamp: r.timestamp,
        });
      }
    }

    // Calculate streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (checkinRows.some(c => c.date === dateStr)) {
        streak++;
      } else if (i > 0) break;
    }

    const checkins = checkinRows.map(row => {
      const c = formatCheckin(row);
      if (repliesMap[c.id]) c.replies = repliesMap[c.id];
      return c;
    });

    res.json({
      id: user.id, name: user.name, avatar: user.avatar || null,
      customPractices: user.custom_practices || [], streak, checkins,
    });
  } catch (err) {
    console.error('Get client error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== MEDIA / UPLOADS ROUTES (Supabase redirect) =====

app.get('/api/uploads/:filename', (req, res) => {
  const url = getPublicUrl(req.params.filename);
  if (!url) return res.status(404).send('Not found');
  res.redirect(url);
});

app.get('/api/media/:filename', (req, res) => {
  const url = getPublicUrl(req.params.filename);
  if (!url) return res.status(404).send('Not found');
  res.redirect(url);
});

// ===== COACH RESPONSE ROUTE =====

app.post('/api/checkins/:checkinId/response', upload.single('media'), async (req, res) => {
  try {
    const { checkinId } = req.params;
    const { type, text } = req.body;

    const mediaFilename = req.file ? await uploadToSupabase(req.file) : null;
    const coachResponse = {
      type: type || 'text',
      mediaPath: mediaFilename,
      text: text || '',
      timestamp: new Date().toISOString(),
    };

    const { rows } = await pool.query(
      'UPDATE checkins SET coach_response = $1 WHERE id = $2 RETURNING *', [JSON.stringify(coachResponse), checkinId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Check-in not found' });

    const checkin = formatCheckin(rows[0]);
    // Fetch replies
    const { rows: replies } = await pool.query(
      'SELECT * FROM replies WHERE checkin_id = $1 ORDER BY timestamp ASC', [checkinId]
    );
    checkin.replies = replies.map(r => ({
      id: r.id, from: r.from, type: r.type, mediaPath: r.media_path, text: r.text, timestamp: r.timestamp,
    }));

    res.json(checkin);
  } catch (err) {
    console.error('Coach response error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== REPLY (PING-PONG THREAD) ROUTE =====

app.post('/api/checkins/:checkinId/reply', upload.single('media'), async (req, res) => {
  try {
    const { checkinId } = req.params;
    const { from, type, text } = req.body;
    if (!from || !['client', 'coach'].includes(from)) {
      return res.status(400).json({ error: 'from must be client or coach' });
    }

    // Verify checkin exists
    const { rows: checkinRows } = await pool.query('SELECT * FROM checkins WHERE id = $1', [checkinId]);
    if (checkinRows.length === 0) return res.status(404).json({ error: 'Check-in not found' });

    // Insert reply
    const replyMediaFilename = req.file ? await uploadToSupabase(req.file) : null;
    await pool.query(
      `INSERT INTO replies (checkin_id, "from", type, media_path, text)
       VALUES ($1, $2, $3, $4, $5)`,
      [checkinId, from, type || 'text', replyMediaFilename, text || '']
    );

    // Return full checkin with all replies
    const checkin = formatCheckin(checkinRows[0]);
    const { rows: replies } = await pool.query(
      'SELECT * FROM replies WHERE checkin_id = $1 ORDER BY timestamp ASC', [checkinId]
    );
    checkin.replies = replies.map(r => ({
      id: r.id, from: r.from, type: r.type, mediaPath: r.media_path, text: r.text, timestamp: r.timestamp,
    }));

    res.json(checkin);
  } catch (err) {
    console.error('Reply error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== RESOURCES ROUTES =====

app.post('/api/clients/:id/resources', upload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'File required' });

    const { rows } = await pool.query('SELECT resources FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const resources = rows[0].resources || [];
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const fileType = ['pdf'].includes(ext) ? 'pdf' : imageExts.includes(ext) ? 'image' : 'video';

    const resourceFilename = await uploadToSupabase(req.file);
    const resource = {
      id: randomUUID(),
      title: title.trim(),
      description: (description || '').trim(),
      type: fileType,
      filePath: resourceFilename,
      originalName: req.file.originalname,
      timestamp: new Date().toISOString(),
    };

    resources.push(resource);
    await pool.query('UPDATE users SET resources = $1 WHERE id = $2', [JSON.stringify(resources), req.params.id]);
    res.json(resource);
  } catch (err) {
    console.error('Add resource error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/clients/:id/resources', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT resources FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const resources = (rows[0].resources || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json(resources);
  } catch (err) {
    console.error('Get resources error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/clients/:id/resources/:resourceId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT resources FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const resources = (rows[0].resources || []).filter(r => r.id !== req.params.resourceId);
    await pool.query('UPDATE users SET resources = $1 WHERE id = $2', [JSON.stringify(resources), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete resource error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== AI ANALYSIS ROUTE =====

app.post('/api/checkins/:checkinId/analysis', async (req, res) => {
  try {
    const { checkinId } = req.params;
    const { keyPoints, mood, patterns, suggestedQuestions } = req.body;

    const aiAnalysis = {
      keyPoints: keyPoints || [], mood: mood || '',
      patterns: patterns || [], suggestedQuestions: suggestedQuestions || [],
      timestamp: new Date().toISOString(),
    };

    const { rows } = await pool.query(
      'UPDATE checkins SET ai_analysis = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(aiAnalysis), checkinId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Check-in not found' });
    res.json(formatCheckin(rows[0]));
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== SERVE FRONTEND =====

const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

app.listen(PORT, () => {
  console.log(`🌲 Remember API running on http://localhost:${PORT} (PostgreSQL mode)`);
});
