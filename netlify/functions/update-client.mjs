import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { clientId, name, code } = JSON.parse(event.body || '{}');
    if (!clientId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'clientId required' }) };
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
        return { statusCode: 409, body: JSON.stringify({ error: 'Code already in use' }) };
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
      return { statusCode: 500, body: JSON.stringify({ error: userError.message }) };
    }

    // If code changed, also update auth credentials
    if (newCode && updated.auth_user_id) {
      const newEmail = `${newCode.toLowerCase()}@remember.app`;
      const { error: authError } = await supabase.auth.admin.updateUser(
        updated.auth_user_id,
        { email: newEmail, password: newCode, email_confirm: true }
      );

      // If password too short for Supabase (min 6), use direct SQL
      if (authError && authError.message?.includes('password')) {
        // Use bcrypt via pg function
        const { error: sqlError } = await supabase.rpc('update_auth_credentials', {
          user_id: updated.auth_user_id,
          new_email: newEmail,
          new_password: newCode,
        });
        if (sqlError) {
          console.error('SQL auth update error:', sqlError.message);
          // Still return success for users table update, but warn
          return {
            statusCode: 200,
            body: JSON.stringify({
              ...updated,
              warning: 'User updated but auth credentials may need manual sync',
            }),
          };
        }
      } else if (authError) {
        console.error('Auth update error:', authError.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ id: updated.id, name: updated.name, code: updated.code }),
    };
  } catch (err) {
    console.error('Update client error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
}
