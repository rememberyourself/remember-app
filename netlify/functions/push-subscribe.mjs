import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { userId, subscription } = JSON.parse(event.body || '{}');
  if (!userId || !subscription) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId and subscription required' }) };
  }

  try {
    // Get current user
    const { data: user, error } = await supabase
      .from('users')
      .select('resources')
      .eq('id', userId)
      .single();

    if (error) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    // Store push subscriptions in resources.push_subscriptions array
    const resources = user.resources || {};
    const subs = resources.push_subscriptions || [];
    
    // Check if this subscription already exists (by endpoint)
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
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('push-subscribe error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
