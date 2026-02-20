import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const { userId, subscription } = req.body || {};
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'userId and subscription required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('resources')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resources = user.resources || {};
    const subs = resources.push_subscriptions || [];
    
    const exists = subs.some(s => s.endpoint === subscription.endpoint);
    if (!exists) {
      subs.push(subscription);
    }

    resources.push_subscriptions = subs;

    await supabase
      .from('users')
      .update({ resources })
      .eq('id', userId);

    console.log(`✅ Push subscription saved for user ${userId}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('push-subscribe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
