import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COACHING_SYSTEM_PROMPT = `You are an experienced men's work coach analyzing a client's check-in. This is a context of masculine self-development — presence, vulnerability, authenticity, heart vs mind, shadow work, and personal responsibility.

Analyze the following check-in transcript/text and return a JSON object with:
- "keyPoints" (array of strings): the key things the person shared or expressed
- "patterns" (array of strings): behavioral, emotional, or relational patterns you notice
- "suggestedQuestions" (array of strings): powerful coaching questions to deepen inquiry
- "mood" (string): the overall emotional state/tone (e.g. "reflective", "anxious", "grounded", "frustrated", "hopeful")

Be direct, compassionate, and perceptive. Look beneath the surface. Notice what's said AND what might be unsaid. Frame patterns without judgment.

Return ONLY valid JSON, no markdown fences.`;

const WHISPER_MAX_SIZE = 25 * 1024 * 1024;

async function transcribeMedia(fileBuffer, ext) {
  ext = ext || 'webm';
  const audioMimeMap = { webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/m4a', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg' };
  const mime = audioMimeMap[ext] || 'audio/webm';
  console.log(`🎤 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB, type: ${ext}`);

  let bufferToSend = fileBuffer;
  if (fileBuffer.length > WHISPER_MAX_SIZE) {
    console.log(`⚠️ File too large, truncating to 25MB`);
    bufferToSend = fileBuffer.slice(0, WHISPER_MAX_SIZE);
  }

  const form = new FormData();
  form.append('file', new Blob([bufferToSend], { type: mime }), `recording.${ext}`);
  form.append('model', 'whisper-1');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    if (resp.status === 413) {
      console.log(`⚠️ Still too large, trying 20MB...`);
      const smallerBuffer = fileBuffer.slice(0, 20 * 1024 * 1024);
      const form2 = new FormData();
      form2.append('file', new Blob([smallerBuffer], { type: mime }), `recording.${ext}`);
      form2.append('model', 'whisper-1');
      const resp2 = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form2,
      });
      if (!resp2.ok) throw new Error(`Whisper API error ${resp2.status}`);
      return (await resp2.json()).text + '\n[Note: Recording truncated]';
    }
    throw new Error(`Whisper API error ${resp.status}: ${await resp.text()}`);
  }
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
  if (!resp.ok) throw new Error(`Anthropic API error ${resp.status}`);
  const data = await resp.json();
  const content = data.content?.[0]?.text || '';
  const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned);
}

async function sendNotifications(checkin, clientName, mediaType) {
  const r = checkin.ratings || {};

  // Telegram
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    const message = `🔔 New Check-in from ${clientName}\n📊 Heart: ${r.heart || '-'} | Mind: ${r.mind || '-'} | Presence: ${r.presence || '-'} | Energy: ${r.energy || '-'} | Connection: ${r.connection || '-'}\n🎥 Type: ${mediaType || 'none'}\n📅 ${checkin.date || new Date().toISOString().split('T')[0]}`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '1379182535', text: message }),
    }).catch(() => {});
  }

  // Push to coaches
  try {
    const { data: coaches } = await supabase.from('users').select('id').eq('role', 'coach');
    if (coaches?.length) {
      const siteUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.URL || 'https://rememberyourself-app.vercel.app');
      const pushBody = `📊 Heart: ${r.heart || '-'} | Mind: ${r.mind || '-'} | Presence: ${r.presence || '-'}\n🎥 ${mediaType || 'text'}`;
      for (const coach of coaches) {
        await fetch(`${siteUrl}/api/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: coach.id,
            title: `🔔 New check-in from ${clientName}`,
            body: pushBody,
            url: '/coach',
          }),
        }).catch(e => console.error(`⚠️ Coach push failed:`, e.message));
      }
      console.log(`📱 Coach push sent to ${coaches.length} coach(es)`);
    }
  } catch (e) {
    console.error(`⚠️ Coach push error:`, e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { checkinId, notifyOnly } = req.body || {};
  if (!checkinId) {
    return res.status(400).json({ error: 'checkinId required' });
  }

  try {
    console.log(`🧠 Processing check-in ${checkinId}${notifyOnly ? ' (notify only)' : ''}`);

    const { data: checkin } = await supabase.from('checkins').select('*').eq('id', checkinId).single();
    if (!checkin) return res.status(200).json({ status: 'no checkin' });

    const { data: clientUser } = await supabase.from('users').select('name').eq('id', checkin.user_id).single();
    const clientName = clientUser?.name || 'Unknown';
    const mediaType = checkin.media_type;

    // Notify only mode — send notifications and return
    if (notifyOnly) {
      await sendNotifications(checkin, clientName, mediaType);
      return res.status(200).json({ status: 'notified', checkinId });
    }

    // Full AI analysis
    await supabase.from('checkins')
      .update({ ai_analysis: { status: 'processing', timestamp: new Date().toISOString() } })
      .eq('id', checkinId);

    let transcript = '';
    const mediaPath = checkin.media_path;

    if ((mediaType === 'video' || mediaType === 'audio') && mediaPath) {
      const { data: fileData, error: dlErr } = await supabase.storage.from('uploads').download(mediaPath);
      if (dlErr) throw new Error(`Download error: ${dlErr.message}`);
      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      transcript = await transcribeMedia(fileBuffer, mediaPath.split('.').pop() || 'webm');
    } else if (mediaType === 'text' && checkin.text_note) {
      transcript = checkin.text_note;
    } else {
      return res.status(200).json({ status: 'nothing to process' });
    }

    if (!transcript || transcript.trim().length < 5) {
      await supabase.from('checkins')
        .update({ ai_analysis: { status: 'skipped', reason: 'transcript too short', timestamp: new Date().toISOString() } })
        .eq('id', checkinId);
      return res.status(200).json({ status: 'transcript too short' });
    }

    const analysis = await analyzeText(transcript);
    const aiAnalysis = {
      ...analysis,
      status: 'complete',
      transcript: (mediaType === 'video' || mediaType === 'audio') ? transcript : undefined,
      timestamp: new Date().toISOString(),
    };

    await supabase.from('checkins').update({ ai_analysis: aiAnalysis }).eq('id', checkinId);
    console.log(`✅ AI analysis saved for ${checkinId}`);

    await sendNotifications(checkin, clientName, mediaType);

    return res.status(200).json({ status: 'done', checkinId });
  } catch (err) {
    console.error(`❌ process-checkin error:`, err.message);
    try {
      await supabase.from('checkins')
        .update({ ai_analysis: { status: 'error', error: err.message, timestamp: new Date().toISOString() } })
        .eq('id', checkinId);
    } catch (e) {}
    return res.status(200).json({ status: 'error', error: err.message });
  }
}

export const config = {
  maxDuration: 60, // 60 seconds for AI analysis
};
