import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Data paths
const DATA_DIR = join(__dirname, 'data');
const UPLOADS_DIR = join(__dirname, 'uploads');
const USERS_FILE = join(DATA_DIR, 'users.json');
const CHECKINS_FILE = join(DATA_DIR, 'checkins.json');

// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

// Middleware
app.use(cors());
app.use(express.json());

// File upload config
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `${randomUUID()}.${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit

// Helper: read/write JSON
function readJSON(path, fallback = []) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return fallback; }
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// Initialize with default coach
function initData() {
  let users = readJSON(USERS_FILE, []);
  if (!users.find(u => u.role === 'coach')) {
    users.push({
      id: randomUUID(),
      name: 'Oliver',
      role: 'coach',
      code: 'COACH2024',
      createdAt: new Date().toISOString()
    });
    // Add a demo client
    users.push({
      id: randomUUID(),
      name: 'Demo Client',
      role: 'client',
      code: 'DEMO',
      createdAt: new Date().toISOString()
    });
    writeJSON(USERS_FILE, users);
  }
}
initData();

// ===== AI ANALYSIS (async background) =====

const COACHING_SYSTEM_PROMPT = `You are an experienced men's work coach analyzing a client's check-in. This is a context of masculine self-development — presence, vulnerability, authenticity, heart vs mind, shadow work, and personal responsibility.

Analyze the following check-in transcript/text and return a JSON object with:
- "keyPoints" (array of strings): the key things the person shared or expressed
- "patterns" (array of strings): behavioral, emotional, or relational patterns you notice
- "suggestedQuestions" (array of strings): powerful coaching questions to deepen inquiry
- "mood" (string): the overall emotional state/tone (e.g. "reflective", "anxious", "grounded", "frustrated", "hopeful")

Be direct, compassionate, and perceptive. Look beneath the surface. Notice what's said AND what might be unsaid. Frame patterns without judgment.

Return ONLY valid JSON, no markdown fences.`;

async function transcribeMedia(filePath) {
  const fileBuffer = readFileSync(filePath);
  const ext = filePath.split('.').pop() || 'webm';
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
  // Strip markdown fences if present
  const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned);
}

async function processCheckinAnalysis(checkinId, mediaType, mediaPath, textNote) {
  try {
    console.log(`🧠 Starting AI analysis for check-in ${checkinId} (${mediaType})`);
    let transcript = '';

    if ((mediaType === 'video' || mediaType === 'audio') && mediaPath) {
      const fullPath = join(UPLOADS_DIR, mediaPath);
      if (!existsSync(fullPath)) {
        throw new Error(`Media file not found: ${fullPath}`);
      }
      transcript = await transcribeMedia(fullPath);
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

    // Save back to checkins.json
    const checkins = readJSON(CHECKINS_FILE);
    const idx = checkins.findIndex(c => c.id === checkinId);
    if (idx === -1) {
      console.error(`❌ Check-in ${checkinId} not found when saving analysis`);
      return;
    }

    checkins[idx].aiAnalysis = {
      ...analysis,
      transcript: (mediaType === 'video' || mediaType === 'audio') ? transcript : undefined,
      timestamp: new Date().toISOString(),
    };
    writeJSON(CHECKINS_FILE, checkins);
    console.log(`✅ AI analysis saved for check-in ${checkinId}`);

  } catch (err) {
    console.error(`❌ AI analysis failed for check-in ${checkinId}:`, err.message);
    // Save error state so coach knows analysis was attempted
    try {
      const checkins = readJSON(CHECKINS_FILE);
      const idx = checkins.findIndex(c => c.id === checkinId);
      if (idx !== -1) {
        checkins[idx].aiAnalysis = {
          error: err.message,
          timestamp: new Date().toISOString(),
        };
        writeJSON(CHECKINS_FILE, checkins);
      }
    } catch (saveErr) {
      console.error(`❌ Failed to save error state:`, saveErr.message);
    }
  }
}

// ===== AUTH ROUTES =====

app.post('/api/auth/login', (req, res) => {
  const { code } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.code?.toUpperCase() === code?.toUpperCase());
  if (!user) return res.status(401).json({ error: 'Invalid code' });
  res.json({ id: user.id, name: user.name, role: user.role, avatar: user.avatar || null, customPractices: user.customPractices || [] });
});

app.post('/api/auth/invite', (req, res) => {
  const { name } = req.body;
  const users = readJSON(USERS_FILE);
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newUser = {
    id: randomUUID(),
    name,
    role: 'client',
    code,
    customPractices: [],
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeJSON(USERS_FILE, users);
  res.json({ code, id: newUser.id });
});

// ===== AVATAR ROUTE =====

app.post('/api/clients/:id/avatar', upload.single('avatar'), (req, res) => {
  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const avatarPath = req.file.filename;
  users[userIndex].avatar = avatarPath;
  writeJSON(USERS_FILE, users);
  res.json({ avatar: avatarPath });
});

// ===== CUSTOM PRACTICES ROUTE =====

app.post('/api/clients/:id/practices', (req, res) => {
  const { practice } = req.body;
  if (!practice || !practice.trim()) return res.status(400).json({ error: 'Practice name required' });

  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  if (!users[userIndex].customPractices) users[userIndex].customPractices = [];
  
  // Don't add duplicates
  const trimmed = practice.trim();
  if (users[userIndex].customPractices.includes(trimmed)) {
    return res.json({ customPractices: users[userIndex].customPractices });
  }

  users[userIndex].customPractices.push(trimmed);
  writeJSON(USERS_FILE, users);
  res.json({ customPractices: users[userIndex].customPractices });
});

app.delete('/api/clients/:id/practices', (req, res) => {
  const { practice } = req.body;
  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  if (!users[userIndex].customPractices) users[userIndex].customPractices = [];
  users[userIndex].customPractices = users[userIndex].customPractices.filter(p => p !== practice);
  writeJSON(USERS_FILE, users);
  res.json({ customPractices: users[userIndex].customPractices });
});

// Get user profile (for client-side profile page)
app.get('/api/clients/:id/profile', (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    avatar: user.avatar || null,
    customPractices: user.customPractices || [],
  });
});

// ===== CHECKIN ROUTES =====

// Latest coach response (must be before :userId param route)
app.get('/api/checkins/latest-response/:clientId', (req, res) => {
  const checkins = readJSON(CHECKINS_FILE);
  const userCheckins = checkins
    .filter(c => c.userId === req.params.clientId && c.coachResponse)
    .sort((a, b) => (b.coachResponse.timestamp || b.createdAt).localeCompare(a.coachResponse.timestamp || a.createdAt));
  
  if (userCheckins.length === 0) return res.json(null);
  res.json(userCheckins[0]);
});

app.post('/api/checkins', upload.single('media'), (req, res) => {
  const { userId, date, ratings, practices, mediaType, textNote } = req.body;
  const checkins = readJSON(CHECKINS_FILE);
  
  const checkin = {
    id: randomUUID(),
    userId,
    date,
    ratings: JSON.parse(ratings || '{}'),
    practices: JSON.parse(practices || '{}'),
    mediaType: mediaType || 'none',
    textNote: textNote || '',
    mediaPath: req.file ? req.file.filename : null,
    createdAt: new Date().toISOString()
  };

  checkins.push(checkin);
  writeJSON(CHECKINS_FILE, checkins);
  res.status(201).json(checkin);

  // Fire-and-forget async AI analysis
  if (checkin.mediaType === 'video' || checkin.mediaType === 'audio' || checkin.mediaType === 'text') {
    processCheckinAnalysis(checkin.id, checkin.mediaType, checkin.mediaPath, checkin.textNote);
  }
});

app.get('/api/checkins/:userId', (req, res) => {
  const checkins = readJSON(CHECKINS_FILE);
  const userCheckins = checkins
    .filter(c => c.userId === req.params.userId)
    .sort((a, b) => b.date?.localeCompare(a.date));
  res.json(userCheckins);
});

// ===== CLIENT ROUTES (for coach) =====

app.get('/api/clients', (req, res) => {
  const users = readJSON(USERS_FILE);
  const checkins = readJSON(CHECKINS_FILE);
  
  const clients = users
    .filter(u => u.role === 'client')
    .map(u => {
      const userCheckins = checkins
        .filter(c => c.userId === u.id)
        .sort((a, b) => b.date?.localeCompare(a.date));
      
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

      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar || null,
        lastCheckin: userCheckins[0]?.date || null,
        totalCheckins: userCheckins.length,
        streak,
        code: u.code,
        createdAt: u.createdAt || null
      };
    });

  res.json(clients);
});

// Update client (name and/or code)
app.put('/api/clients/:id', (req, res) => {
  const { name, code } = req.body;
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === req.params.id && u.role === 'client');
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  // If changing code, ensure it's not already taken
  if (code) {
    const existing = users.find(u => u.code?.toUpperCase() === code.toUpperCase() && u.id !== req.params.id);
    if (existing) return res.status(409).json({ error: 'Code already in use' });
    users[idx].code = code.toUpperCase();
  }
  if (name) users[idx].name = name.trim();

  writeJSON(USERS_FILE, users);
  res.json({ id: users[idx].id, name: users[idx].name, code: users[idx].code });
});

// Delete client
app.delete('/api/clients/:id', (req, res) => {
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === req.params.id && u.role === 'client');
  if (idx === -1) return res.status(404).json({ error: 'Client not found' });

  users.splice(idx, 1);
  writeJSON(USERS_FILE, users);

  // Also clean up their checkins
  const checkins = readJSON(CHECKINS_FILE);
  const filtered = checkins.filter(c => c.userId !== req.params.id);
  writeJSON(CHECKINS_FILE, filtered);

  res.json({ success: true });
});

app.get('/api/clients/:id', (req, res) => {
  const users = readJSON(USERS_FILE);
  const checkins = readJSON(CHECKINS_FILE);
  
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const userCheckins = checkins
    .filter(c => c.userId === user.id)
    .sort((a, b) => b.date?.localeCompare(a.date));

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

  res.json({
    id: user.id,
    name: user.name,
    avatar: user.avatar || null,
    customPractices: user.customPractices || [],
    streak,
    checkins: userCheckins
  });
});

// ===== MEDIA / UPLOADS ROUTES =====

// Serve uploads as static files with proper headers
app.use('/api/uploads', express.static(UPLOADS_DIR, {
  setHeaders(res, filePath) {
    // Ensure proper MIME types and allow range requests for media playback
    if (filePath.endsWith('.webm')) {
      // Check if this file is audio-only by looking up checkin data
      // Default to video/webm which browsers handle for both
      res.setHeader('Content-Type', 'video/webm');
    }
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

app.get('/api/media/:filename', (req, res) => {
  const filePath = join(UPLOADS_DIR, req.params.filename);
  if (!existsSync(filePath)) return res.status(404).send('Not found');
  // Set proper headers for media streaming
  const ext = req.params.filename.split('.').pop()?.toLowerCase();
  if (ext === 'webm') {
    res.setHeader('Content-Type', 'video/webm');
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.sendFile(filePath);
});

// ===== COACH RESPONSE ROUTE =====

app.post('/api/checkins/:checkinId/response', upload.single('media'), (req, res) => {
  const { checkinId } = req.params;
  const { type, text } = req.body;
  const checkins = readJSON(CHECKINS_FILE);
  const idx = checkins.findIndex(c => c.id === checkinId);
  if (idx === -1) return res.status(404).json({ error: 'Check-in not found' });

  checkins[idx].coachResponse = {
    type: type || 'text',
    mediaPath: req.file ? req.file.filename : null,
    text: text || '',
    timestamp: new Date().toISOString()
  };

  writeJSON(CHECKINS_FILE, checkins);
  res.json(checkins[idx]);
});

// ===== REPLY (PING-PONG THREAD) ROUTE =====

app.post('/api/checkins/:checkinId/reply', upload.single('media'), (req, res) => {
  const { checkinId } = req.params;
  const { from, type, text } = req.body;
  if (!from || !['client', 'coach'].includes(from)) {
    return res.status(400).json({ error: 'from must be client or coach' });
  }
  const checkins = readJSON(CHECKINS_FILE);
  const idx = checkins.findIndex(c => c.id === checkinId);
  if (idx === -1) return res.status(404).json({ error: 'Check-in not found' });

  if (!checkins[idx].replies) checkins[idx].replies = [];

  checkins[idx].replies.push({
    id: randomUUID(),
    from,
    type: type || 'text',
    mediaPath: req.file ? req.file.filename : null,
    text: text || '',
    timestamp: new Date().toISOString()
  });

  writeJSON(CHECKINS_FILE, checkins);
  res.json(checkins[idx]);
});

// ===== RESOURCES ROUTES =====

app.post('/api/clients/:id/resources', upload.single('file'), (req, res) => {
  const { title, description } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  if (!req.file) return res.status(400).json({ error: 'File required' });

  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  if (!users[userIndex].resources) users[userIndex].resources = [];

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const fileType = ['pdf'].includes(ext) ? 'pdf' : imageExts.includes(ext) ? 'image' : 'video';

  const resource = {
    id: randomUUID(),
    title: title.trim(),
    description: (description || '').trim(),
    type: fileType,
    filePath: req.file.filename,
    originalName: req.file.originalname,
    timestamp: new Date().toISOString()
  };

  users[userIndex].resources.push(resource);
  writeJSON(USERS_FILE, users);
  res.json(resource);
});

app.get('/api/clients/:id/resources', (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const resources = (user.resources || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json(resources);
});

app.delete('/api/clients/:id/resources/:resourceId', (req, res) => {
  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  if (!users[userIndex].resources) users[userIndex].resources = [];
  users[userIndex].resources = users[userIndex].resources.filter(r => r.id !== req.params.resourceId);
  writeJSON(USERS_FILE, users);
  res.json({ success: true });
});

// ===== AI ANALYSIS ROUTE =====

app.post('/api/checkins/:checkinId/analysis', (req, res) => {
  const { checkinId } = req.params;
  const { keyPoints, mood, patterns, suggestedQuestions } = req.body;
  const checkins = readJSON(CHECKINS_FILE);
  const idx = checkins.findIndex(c => c.id === checkinId);
  if (idx === -1) return res.status(404).json({ error: 'Check-in not found' });

  checkins[idx].aiAnalysis = {
    keyPoints: keyPoints || [],
    mood: mood || '',
    patterns: patterns || [],
    suggestedQuestions: suggestedQuestions || [],
    timestamp: new Date().toISOString()
  };

  writeJSON(CHECKINS_FILE, checkins);
  res.json(checkins[idx]);
});

// Serve built frontend in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(join(distPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`🌲 Remember API running on http://localhost:${PORT}`);
});
