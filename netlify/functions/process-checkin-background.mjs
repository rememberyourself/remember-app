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

const WHISPER_MAX_SIZE = 25 * 1024 * 1024; // 25MB

async function transcribeMedia(fileBuffer, ext) {
  ext = ext || 'webm';
  const audioMimeMap = { webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/m4a', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg' };
  // Always send as audio/* MIME type — Whisper only needs the audio track
  const mime = audioMimeMap[ext] || 'audio/webm';

  console.log(`🎤 File size: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB, type: ${ext}`);

  // If file is too large, try chunking: send first 24MB
  let bufferToSend = fileBuffer;
  if (fileBuffer.length > WHISPER_MAX_SIZE) {
    console.log(`⚠️ File too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB), truncating to ${(WHISPER_MAX_SIZE / 1024 / 1024)}MB`);
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
    const errorText = await resp.text();
    // If still too large even after truncation, try with even smaller chunk
    if (resp.status === 413) {
      console.log(`⚠️ Still too large after truncation, trying with 20MB...`);
      const smallerBuffer = fileBuffer.slice(0, 20 * 1024 * 1024);
      const form2 = new FormData();
      form2.append('file', new Blob([smallerBuffer], { type: mime }), `recording.${ext}`);
      form2.append('model', 'whisper-1');
      const resp2 = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form2,
      });
      if (!resp2.ok) throw new Error(`Whisper API error ${resp2.status}: ${await resp2.text()}`);
      const text = (await resp2.json()).text;
      return text + '\n[Note: Recording was truncated due to file size — last portion may be missing]';
    }
    throw new Error(`Whisper API error ${resp.status}: ${errorText}`);
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
    const { data: clientUser } = await supabase.from('users').select('name').eq('id', checkin.user_id).single();
    const clientName = clientUser?.name || 'Unknown';

    if (token) {
      const r = checkin.ratings || {};
      const message = `🔔 New Check-in from ${clientName}\n📊 Heart: ${r.heart || '-'} | Mind: ${r.mind || '-'} | Presence: ${r.presence || '-'} | Energy: ${r.energy || '-'} | Connection: ${r.connection || '-'}\n🎥 Type: ${mediaType || 'none'}\n📅 ${checkin.date || new Date().toISOString().split('T')[0]}`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: '1379182535', text: message }),
      }).catch(() => {});
    }

    // Send push notification to all coaches
    try {
      const { data: coaches } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'coach');

      if (coaches?.length) {
        const siteUrl = process.env.URL || 'https://rememberyourself-app.netlify.app';
        const r = checkin.ratings || {};
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

    return { statusCode: 200, body: JSON.stringify({ status: 'done', checkinId }) };
  } catch (err) {
    console.error(`❌ process-checkin error:`, err.message, err.stack);
    try {
      await supabase.from('checkins')
        .update({ ai_analysis: { status: 'error', error: err.message, timestamp: new Date().toISOString() } })
        .eq('id', checkinId);
    } catch (e) {
      console.error('❌ Failed to save error state:', e.message);
    }
    return { statusCode: 200, body: JSON.stringify({ status: 'error', error: err.message }) };
  }
}
