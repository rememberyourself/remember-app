import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { clientId, name, code } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: 'clientId required' });
    }

    const newCode = code ? code.trim().toUpperCase() : null;

    // If code is changing, check uniqueness
    if (newCode) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('code', newCode)
        .neq('id', clientId);
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'Code already in use' });
      }
    }

    // Update users table
    const updates = {};
    if (name) updates.name = name.trim();
    if (newCode) updates.code = newCode;

    const { data: updated, error: userError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', clientId)
      .eq('role', 'client')
      .select('id, name, code, auth_user_id')
      .single();

    if (userError) {
      return res.status(500).json({ error: userError.message });
    }

    // If code changed, also update auth credentials via SQL function
    if (newCode && updated.auth_user_id) {
      const newEmail = `${newCode.toLowerCase()}@remember.app`;
      const { error: rpcError } = await supabase.rpc('update_auth_credentials', {
        user_id: updated.auth_user_id,
        new_email: newEmail,
        new_password: newCode,
      });
      if (rpcError) {
        console.error('Auth credentials update error:', rpcError.message);
        return res.status(200).json({
          ...updated,
          warning: 'User updated but auth credentials may need manual sync',
        });
      }
    }

    return res.status(200).json({ id: updated.id, name: updated.name, code: updated.code });
  } catch (err) {
    console.error('Update client error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
}
