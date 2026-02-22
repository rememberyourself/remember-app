import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://osyhjclkinguhmqcawbs.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zeWhqY2xraW5ndWhtcWNhd2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzU3OTgsImV4cCI6MjA4NjYxMTc5OH0.5Gvu-EDFZJ6gduXCiNoraytEpHZOThAWYSJ4MXHrB38';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Get public URL for a media file.
 * Supports both old Supabase URLs (legacy) and new R2 URLs.
 */
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL;

export function getPublicUrl(path) {
  if (!path) return null;
  // If already a full URL, return as-is (covers legacy Supabase URLs too)
  if (path.startsWith('http')) return path;
  // New R2 path: just a filename like "uuid.webm"
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${path}`;
  }
  // Fallback to Supabase (shouldn't happen once R2 is configured)
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return data.publicUrl;
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
