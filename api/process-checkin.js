import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { checkinId } = req.body;
  if (!checkinId) return res.status(400).json({ error: 'checkinId required' });

  // Respond immediately — processing happens async
  res.status(200).json({ status: 'processing', checkinId });

  try {
    console.log(`🧠 Processing check-in ${checkinId}`);

    const { data: checkin, error } = await supabase
      .from('checkins').select('*').eq('id', checkinId).single();
    if (error || !checkin) return;

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
      return;
    }

    if (!transcript || transcript.trim().length < 5) return;

    const analysis = await analyzeText(transcript);
    const aiAnalysis = {
      ...analysis,
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
  } catch (err) {
    console.error(`❌ process-checkin error:`, err.message);
    await supabase.from('checkins')
      .update({ ai_analysis: { error: err.message, timestamp: new Date().toISOString() } })
      .eq('id', checkinId)
      .catch(() => {});
  }
}
