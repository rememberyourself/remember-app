import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }

  try {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const email = `${code.toLowerCase()}@remember.app`;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: code,
      email_confirm: true,
      user_metadata: { name: name.trim(), role: 'client' },
    });

    if (authError) {
      console.error('Auth create error:', authError.message);
      return res.status(500).json({ error: 'Failed to create auth user' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        role: 'client',
        code,
        auth_user_id: authData.user.id,
      })
      .select('id')
      .single();

    if (userError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error('User create error:', userError.message);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    return res.status(200).json({ code, id: user.id });
  } catch (err) {
    console.error('Invite error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
