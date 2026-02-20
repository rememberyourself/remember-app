import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CONVERSATION_ANALYSIS_PROMPT = `You are an experienced men's work coach analyzing a coaching conversation thread. This includes the original check-in and follow-up replies between coach and client.

Analyze the FULL conversation and return a JSON object with:
- "keyPoints" (array of strings): key themes and developments across the conversation
- "patterns" (array of strings): patterns emerging through the dialogue (shifts, resistance, openings, breakthroughs)
- "suggestedQuestions" (array of strings): next coaching questions based on how the conversation evolved
- "mood" (string): the client's evolving emotional state through the conversation
- "conversationDynamic" (string): a brief assessment of the coaching dynamic (e.g. "deepening trust", "surface-level", "breakthrough moment", "resistance softening")

Look at how the client responds to coaching input. Notice shifts between replies. Frame patterns without judgment.

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
  if (!resp.ok) throw new Error(`Whisper error ${resp.status}`);
  return (await resp.json()).text;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { checkinId, replyFrom, replyType, replyText } = JSON.parse(event.body || '{}');
  if (!checkinId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'checkinId required' }) };
  }

  try {
    // 1. Telegram + Push notification when client replies
    if (replyFrom === 'client') {
      const { data: checkin } = await supabase.from('checkins').select('user_id').eq('id', checkinId).single();
      const { data: user } = await supabase.from('users').select('name').eq('id', checkin?.user_id).single();
      const clientName = user?.name || 'Unknown';
      const preview = replyType === 'text' ? (replyText?.substring(0, 100) || '(empty)') : `🎥 ${replyType} message`;

      // Telegram notification
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        const message = `💬 Reply from ${clientName}\n${preview}\n📎 Check-in: ${checkinId.substring(0, 8)}...`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: '1379182535', text: message }),
        }).catch(() => {});
      }

      // Push notification to coaches
      try {
        const { data: coaches } = await supabase.from('users').select('id').eq('role', 'coach');
        if (coaches?.length) {
          const siteUrl = process.env.URL || 'https://rememberyourself-app.netlify.app';
          for (const coach of coaches) {
            await fetch(`${siteUrl}/api/send-push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: coach.id,
                title: `💬 Reply from ${clientName}`,
                body: preview,
                url: '/coach',
              }),
            }).catch(e => console.error(`⚠️ Coach push failed:`, e.message));
          }
        }
      } catch (e) {
        console.error(`⚠️ Coach push error:`, e.message);
      }
    }

    // 2. Conversation analysis
    const { data: checkin } = await supabase.from('checkins').select('*').eq('id', checkinId).single();
    if (!checkin) return { statusCode: 200, body: JSON.stringify({ status: 'no checkin' }) };

    const { data: replies } = await supabase
      .from('replies').select('*').eq('checkin_id', checkinId).order('timestamp', { ascending: true });
    if (!replies || replies.length < 1) return { statusCode: 200, body: JSON.stringify({ status: 'no replies' }) };

    // Build conversation text
    let conversationText = '';

    const existingAnalysis = checkin.ai_analysis || {};
    const originalTranscript = existingAnalysis.transcript || checkin.text_note || '(no text)';
    conversationText += `[CLIENT CHECK-IN]\n${originalTranscript}\n\n`;

    if (checkin.coach_response) {
      const cr = typeof checkin.coach_response === 'string' ? JSON.parse(checkin.coach_response) : checkin.coach_response;
      if (cr.text) conversationText += `[COACH RESPONSE]\n${cr.text}\n\n`;
    }

    for (const reply of replies) {
      const role = reply.from === 'client' ? 'CLIENT REPLY' : 'COACH REPLY';
      let text = reply.text || '';

      if ((reply.type === 'video' || reply.type === 'audio') && reply.media_path && !text) {
        try {
          const { data: fileData } = await supabase.storage.from('uploads').download(reply.media_path);
          if (fileData) {
            const buf = Buffer.from(await fileData.arrayBuffer());
            text = await transcribeMedia(buf, reply.media_path.split('.').pop() || 'webm');
          }
        } catch (e) {
          text = `(${reply.type} — transcription failed)`;
        }
      }

      conversationText += `[${role}]\n${text || '(no text)'}\n\n`;
    }

    if (conversationText.trim().length < 20) return { statusCode: 200, body: JSON.stringify({ status: 'too short' }) };

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
        system: CONVERSATION_ANALYSIS_PROMPT,
        messages: [{ role: 'user', content: `Coaching conversation:\n\n${conversationText}` }],
        temperature: 0.7,
      }),
    });

    if (!resp.ok) throw new Error(`Anthropic error ${resp.status}`);
    const data = await resp.json();
    const content = data.content?.[0]?.text || '';
    const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    const analysis = JSON.parse(cleaned);

    const convAnalysis = { ...analysis, replyCount: replies.length, timestamp: new Date().toISOString() };
    await supabase.from('checkins')
      .update({ conversation_analysis: convAnalysis })
      .eq('id', checkinId);

    console.log(`✅ Conversation analysis saved for ${checkinId}`);

    // Send push notification to client if coach replied
    if (replyFrom === 'coach') {
      try {
        const clientUserId = checkin.user_id;
        const siteUrl = process.env.URL || 'https://rememberyourself-app.netlify.app';
        await fetch(`${siteUrl}/api/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: clientUserId,
            title: 'New message from your coach',
            body: replyText?.substring(0, 100) || 'Your coach sent you a response',
            url: '/dashboard',
          }),
        });
        console.log(`📱 Push notification triggered for client ${clientUserId}`);
      } catch (e) {
        console.error(`⚠️ Push notification failed:`, e.message);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'done', checkinId }) };
  } catch (err) {
    console.error(`❌ process-reply error:`, err.message);
    return { statusCode: 200, body: JSON.stringify({ status: 'error', error: err.message }) };
  }
}
