import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper function to calculate badge count for user
async function getBadgeCount(userId) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('role, last_seen')
      .eq('id', userId)
      .single();
    
    if (!user) return 0;
    
    if (user.role === 'client') {
      // Count coach responses newer than client's last_seen
      const lastSeen = user.last_seen || '1970-01-01T00:00:00Z';
      const { data: checkins } = await supabase
        .from('checkins')
        .select('coach_response')
        .eq('user_id', userId)
        .not('coach_response', 'is', null);
      
      if (!checkins) return 0;
      
      return checkins.filter(c => {
        const cr = c.coach_response;
        if (!cr || !cr.timestamp) return false;
        return new Date(cr.timestamp) > new Date(lastSeen);
      }).length;
    } else if (user.role === 'coach') {
      // Count check-ins that don't have a coach_response (consistent with in-app display)
      const { data: checkins } = await supabase
        .from('checkins')
        .select('id')
        .is('coach_response', null);
      
      return checkins?.length || 0;
    }
    
    return 0;
  } catch (e) {
    console.error('Badge count calculation error:', e.message);
    return 0;
  }
}

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

    // Calculate badge count for this user
    const badgeCount = await getBadgeCount(userId);
    
    const payload = JSON.stringify({
      title: title || 'Remember',
      body: body || 'You have a new notification',
      url: url || '/dashboard',
      badge: badgeCount,
    });

    let sent = 0;
    const validSubs = [];
    
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        validSubs.push(sub);
        sent++;
        console.log(`✅ Push sent (badge: ${badgeCount})`);
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
