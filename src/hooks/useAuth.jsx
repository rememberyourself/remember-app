import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../utils/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadAppUser(session.user.id);
      } else {
        // Check localStorage fallback (migration period)
        const saved = localStorage.getItem('remember_user');
        if (saved) {
          // Old format — clear it, user needs to re-login
          localStorage.removeItem('remember_user');
        }
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadAppUser(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadAppUser(authUserId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, avatar, custom_practices')
        .eq('auth_user_id', authUserId)
        .single();

      if (error || !data) {
        console.error('Failed to load app user:', error?.message);
        setUser(null);
      } else {
        setUser({
          id: data.id,
          name: data.name,
          role: data.role,
          avatar: data.avatar || null,
          customPractices: data.custom_practices || [],
        });
      }
    } catch (err) {
      console.error('loadAppUser error:', err);
      setUser(null);
    }
    setLoading(false);
  }

  const login = async (code) => {
    const email = `${code.trim().toLowerCase()}@remember.app`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: code.trim(),
    });
    if (error) throw new Error('Invalid code');
    // User will be set via onAuthStateChange
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
