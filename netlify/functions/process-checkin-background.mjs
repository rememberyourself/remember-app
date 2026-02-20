import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

  if (!resp.ok) throw new Error(`Whisper API error ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).text;
}

async function analyzeText(text) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Check-in transcript:\n\n${text}` }],
      temperature: 0.7,
    }),
  });

  if (!resp.ok) throw new Error(`Anthropic API error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const content = data.content?.[0]?.text || '';
  const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { checkinId } = JSON.parse(event.body || '{}');
  if (!checkinId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'checkinId required' }) };
  }

  try {
    console.log(`🧠 Processing check-in ${checkinId}`);
    console.log(`📋 Config: SUPABASE_URL=${SUPABASE_URL ? 'SET' : 'MISSING'}, ANTHROPIC_KEY=${process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'}, OPENAI_KEY=${process.env.OPENAI_API_KEY ? 'SET' : 'MISSING'}`);

    // Mark as processing
    await supabase.from('checkins')
      .update({ ai_analysis: { status: 'processing', timestamp: new Date().toISOString() } })
      .eq('id', checkinId);

    const { data: checkin, error } = await supabase
      .from('checkins').select('*').eq('id', checkinId).single();
    if (error) {
      console.error(`❌ Supabase fetch error:`, error.message);
      return { statusCode: 200, body: JSON.stringify({ status: 'db error', error: error.message }) };
    }
    if (!checkin) {
      console.error(`❌ No checkin found for ${checkinId}`);
      return { statusCode: 200, body: JSON.stringify({ status: 'no checkin found' }) };
    }
    console.log(`📦 Check-in found: type=${checkin.media_type}, path=${checkin.media_path}, text=${checkin.text_note?.substring(0, 50)}`);

    let transcript = '';
    const mediaType = checkin.media_type;
    const mediaPath = checkin.media_path;

    if ((mediaType === 'video' || mediaType === 'audio') && mediaPath) {
      const { data: fileData, error: dlErr } = await supabase.storage.from('uploads').download(mediaPath);
      if (dlErr) throw new Error(`Download error: ${dlErr.message}`);
      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      const ext = mediaPath.split('.').pop() || 'webm';
      transcript = await transcribeMedia(fileBuffer, ext);
    } else if (mediaType === 'text' && checkin.text_note) {
      transcript = checkin.text_note;
    } else {
      return { statusCode: 200, body: JSON.stringify({ status: 'nothing to process' }) };
    }

    if (!transcript || transcript.trim().length < 5) {
      console.log(`⚠️ Transcript too short: "${transcript}"`);
      await supabase.from('checkins')
        .update({ ai_analysis: { status: 'skipped', reason: 'transcript too short', timestamp: new Date().toISOString() } })
        .eq('id', checkinId);
      return { statusCode: 200, body: JSON.stringify({ status: 'transcript too short' }) };
    }

    console.log(`📝 Transcript (${transcript.length} chars): ${transcript.substring(0, 100)}...`);
    console.log(`🤖 Calling Anthropic API...`);
    const analysis = await analyzeText(transcript);
    console.log(`✅ Analysis received: mood=${analysis.mood}, keyPoints=${analysis.keyPoints?.length}`);
    const aiAnalysis = {
      ...analysis,
      status: 'complete',
      transcript: (mediaType === 'video' || mediaType === 'audio') ? transcript : undefined,
      timestamp: new Date().toISOString(),
    };

    await supabase.from('checkins')
      .update({ ai_analysis: aiAnalysis })
      .eq('id', checkinId);

    console.log(`✅ AI analysis saved for ${checkinId}`);

    // Send Telegram notification
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      const { data: user } = await supabase.from('users').select('name').eq('id', checkin.user_id).single();
      const clientName = user?.name || 'Unknown';
      const r = checkin.ratings || {};
      const message = `🔔 New Check-in from ${clientName}\n📊 Heart: ${r.heart || '-'} | Mind: ${r.mind || '-'} | Presence: ${r.presence || '-'} | Energy: ${r.energy || '-'} | Connection: ${r.connection || '-'}\n🎥 Type: ${mediaType || 'none'}\n📅 ${checkin.date || new Date().toISOString().split('T')[0]}`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '1379182535', text: message }),
      }).catch(() => {});
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'done', checkinId }) };
  } catch (err) {
    console.error(`❌ process-checkin error:`, err.message, err.stack);
    await supabase.from('checkins')
      .update({ ai_analysis: { status: 'error', error: err.message, timestamp: new Date().toISOString() } })
      .eq('id', checkinId)
      .catch((e) => console.error('❌ Failed to save error state:', e.message));
    return { statusCode: 200, body: JSON.stringify({ status: 'error', error: err.message }) };
  }
}
