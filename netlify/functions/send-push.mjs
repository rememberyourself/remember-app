import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

webpush.setVapidDetails(
  'mailto:jackbotty79@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { userId, title, body, url } = JSON.parse(event.body || '{}');
  if (!userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId required' }) };
  }

  try {
    // Get push subscriptions from user's resources
    const { data: user, error } = await supabase
      .from('users')
      .select('resources')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'user not found' }) };
    }

    const subscriptions = user.resources?.push_subscriptions || [];
    if (!subscriptions.length) {
      console.log(`No push subscriptions for user ${userId}`);
      return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no subscriptions' }) };
    }

    const payload = JSON.stringify({
      title: title || 'Remember',
      body: body || 'You have a new message from your coach',
      url: url || '/dashboard',
    });

    let sent = 0;
    const validSubs = [];
    
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        validSubs.push(sub);
        sent++;
        console.log(`✅ Push sent`);
      } catch (e) {
        console.error(`❌ Push failed:`, e.statusCode || e.message);
        // Keep subscription unless it's definitely expired
        if (e.statusCode !== 410 && e.statusCode !== 404) {
          validSubs.push(sub);
        }
      }
    }

    // Clean up invalid subscriptions
    if (validSubs.length !== subscriptions.length) {
      const resources = user.resources || {};
      resources.push_subscriptions = validSubs;
      await supabase.from('users').update({ resources }).eq('id', userId);
    }

    return { statusCode: 200, body: JSON.stringify({ sent }) };
  } catch (err) {
    console.error('send-push error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
