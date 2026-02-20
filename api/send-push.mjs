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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const { userId, title, body, url } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('resources')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(200).json({ sent: 0, reason: 'user not found' });
    }

    const subscriptions = user.resources?.push_subscriptions || [];
    if (!subscriptions.length) {
      console.log(`No push subscriptions for user ${userId}`);
      return res.status(200).json({ sent: 0, reason: 'no subscriptions' });
    }

    const payload = JSON.stringify({
      title: title || 'Remember',
      body: body || 'You have a new notification',
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
        if (e.statusCode !== 410 && e.statusCode !== 404) {
          validSubs.push(sub);
        }
      }
    }

    if (validSubs.length !== subscriptions.length) {
      const resources = user.resources || {};
      resources.push_subscriptions = validSubs;
      await supabase.from('users').update({ resources }).eq('id', userId);
    }

    return res.status(200).json({ sent });
  } catch (err) {
    console.error('send-push error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
