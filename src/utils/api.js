import { supabase, getPublicUrl } from './supabase';

// ===== AUTH =====

export async function login(code) {
  const email = `${code.trim().toLowerCase()}@remember.app`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: code.trim(),
  });
  if (error) throw new Error('Invalid code');

  // Fetch app user profile
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, role, avatar, custom_practices')
    .eq('auth_user_id', data.user.id)
    .single();
  if (userError) throw new Error('User not found');

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    avatar: user.avatar || null,
    customPractices: user.custom_practices || [],
  };
}

// ===== CHECKINS =====

export async function getCheckins(userId) {
  const { data: checkins, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  // Fetch replies for all checkins
  const checkinIds = checkins.map(c => c.id);
  let repliesMap = {};
  if (checkinIds.length > 0) {
    const { data: allReplies } = await supabase
      .from('replies')
      .select('*')
      .in('checkin_id', checkinIds)
      .order('timestamp', { ascending: true });

    for (const r of (allReplies || [])) {
      if (!repliesMap[r.checkin_id]) repliesMap[r.checkin_id] = [];
      repliesMap[r.checkin_id].push(formatReply(r));
    }
  }

  return checkins.map(row => {
    const c = formatCheckin(row);
    if (repliesMap[c.id]) c.replies = repliesMap[c.id];
    return c;
  });
}

export async function createCheckin({ userId, date, ratings, practices, mediaType, textNote, mediaPath }) {
  const { data, error } = await supabase
    .from('checkins')
    .insert({
      user_id: userId,
      date,
      ratings: typeof ratings === 'string' ? JSON.parse(ratings) : (ratings || {}),
      practices: typeof practices === 'string' ? JSON.parse(practices) : (practices || {}),
      media_type: mediaType || 'none',
      text_note: textNote || '',
      media_path: mediaPath,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const checkin = formatCheckin(data);

  // AI analysis is triggered manually by coach via button
  // But we still need to send notifications (Telegram + Coach Push)
  fetch('/api/process-checkin-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkinId: checkin.id, notifyOnly: true }),
  }).catch(() => {});

  return checkin;
}

// ===== CLIENTS (Coach) =====

export async function getClients() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'client');
  if (error) throw new Error(error.message);

  const clients = [];
  for (const u of users) {
    const { data: userCheckins } = await supabase
      .from('checkins')
      .select('date, coach_response')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false });

    const unrespondedCount = (userCheckins || []).filter(c => !c.coach_response).length;

    // Calculate streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if ((userCheckins || []).some(c => c.date === dateStr)) {
        streak++;
      } else if (i > 0) break;
    }

    clients.push({
      id: u.id, name: u.name, avatar: u.avatar || null,
      lastCheckin: userCheckins?.[0]?.date || null,
      totalCheckins: (userCheckins || []).length, streak,
      code: u.code, createdAt: u.created_at || null,
      hasNewCheckins: unrespondedCount > 0,
      unrespondedCount,
    });
  }

  return clients;
}

export async function getClientDetail(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw new Error('Not found');

  const { data: checkinRows } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Fetch replies
  const checkinIds = (checkinRows || []).map(r => r.id);
  let repliesMap = {};
  if (checkinIds.length > 0) {
    const { data: allReplies } = await supabase
      .from('replies')
      .select('*')
      .in('checkin_id', checkinIds)
      .order('timestamp', { ascending: true });

    for (const r of (allReplies || [])) {
      if (!repliesMap[r.checkin_id]) repliesMap[r.checkin_id] = [];
      repliesMap[r.checkin_id].push(formatReply(r));
    }
  }

  // Calculate streak
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if ((checkinRows || []).some(c => c.date === dateStr)) {
      streak++;
    } else if (i > 0) break;
  }

  const checkins = (checkinRows || []).map(row => {
    const c = formatCheckin(row);
    if (repliesMap[c.id]) c.replies = repliesMap[c.id];
    return c;
  });

  return {
    id: user.id, name: user.name, avatar: user.avatar || null,
    customPractices: user.custom_practices || [], streak, checkins,
  };
}

export async function createInvite(name) {
  // This needs server-side (service role key) to create auth user
  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create invite');
  return res.json();
}

export async function updateClient(clientId, data) {
  // Use serverless function to update both users table AND auth credentials
  const res = await fetch('/api/update-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      name: data.name,
      code: data.code,
    }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Failed to update client');
  return result;
}

export async function deleteClient(clientId) {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', clientId)
    .eq('role', 'client');
  if (error) throw new Error(error.message);
  return { success: true };
}

// ===== PROFILE =====

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, avatar, custom_practices')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id, name: data.name, role: data.role,
    avatar: data.avatar || null, customPractices: data.custom_practices || [],
  };
}

// ===== AVATAR =====

export async function uploadAvatar(userId, file) {
  // Upload to R2 via presigned URL
  const ext = file.name?.split('.').pop() || 'jpg';
  const contentType = file.type || 'image/jpeg';

  const presignRes = await fetch('/api/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extension: ext, contentType }),
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { presignedUrl, filename } = await presignRes.json();

  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('Avatar upload failed');

  // Update user record in DB
  const { error } = await supabase
    .from('users')
    .update({ avatar: filename })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return { avatar: filename };
}

// ===== SEEN =====

export async function markSeen(clientId) {
  const { error } = await supabase
    .from('users')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', clientId);
  if (error) throw new Error(error.message);
  return { success: true };
}

// ===== PRACTICES =====

export async function addCustomPractice(userId, practice) {
  const trimmed = practice.trim();
  const { data: user } = await supabase
    .from('users')
    .select('custom_practices')
    .eq('id', userId)
    .single();

  const practices = user?.custom_practices || [];
  if (!practices.includes(trimmed)) {
    practices.push(trimmed);
    await supabase.from('users')
      .update({ custom_practices: practices })
      .eq('id', userId);
  }
  return { customPractices: practices };
}

export async function removeCustomPractice(userId, practice) {
  const { data: user } = await supabase
    .from('users')
    .select('custom_practices')
    .eq('id', userId)
    .single();

  const practices = (user?.custom_practices || []).filter(p => p !== practice);
  await supabase.from('users')
    .update({ custom_practices: practices })
    .eq('id', userId);
  return { customPractices: practices };
}

// ===== COACH RESPONSE =====

export async function submitCoachResponse(checkinId, { type, text, mediaPath }) {
  const coachResponse = {
    type: type || 'text',
    mediaPath: mediaPath || null,
    text: text || '',
    timestamp: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('checkins')
    .update({ coach_response: coachResponse })
    .eq('id', checkinId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const checkin = formatCheckin(data);
  // Fetch replies
  const { data: replies } = await supabase
    .from('replies')
    .select('*')
    .eq('checkin_id', checkinId)
    .order('timestamp', { ascending: true });
  checkin.replies = (replies || []).map(formatReply);
  return checkin;
}

// ===== REPLIES =====

export async function submitReply(checkinId, { from, type, text, mediaPath }) {
  const { error: insertError } = await supabase
    .from('replies')
    .insert({
      checkin_id: checkinId,
      from,
      type: type || 'text',
      media_path: mediaPath || null,
      text: text || '',
    });
  if (insertError) throw new Error(insertError.message);

  // Fire-and-forget: trigger async processing
  fetch('/api/process-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkinId, replyFrom: from, replyType: type, replyText: text }),
  }).catch(() => {});

  // Return updated checkin with all replies
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .single();

  const { data: replies } = await supabase
    .from('replies')
    .select('*')
    .eq('checkin_id', checkinId)
    .order('timestamp', { ascending: true });

  const result = formatCheckin(checkin);
  result.replies = (replies || []).map(formatReply);
  return result;
}

// ===== LATEST COACH RESPONSE (for client dashboard) =====

export async function getLatestCoachResponse(clientId) {
  const { data: checkins } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', clientId)
    .not('coach_response', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!checkins || checkins.length === 0) return null;

  const checkin = formatCheckin(checkins[0]);

  // Fetch replies
  const { data: replies } = await supabase
    .from('replies')
    .select('*')
    .eq('checkin_id', checkin.id)
    .order('timestamp', { ascending: true });
  checkin.replies = (replies || []).map(formatReply);

  // Check if there's a new response
  const { data: userData } = await supabase
    .from('users')
    .select('last_seen')
    .eq('id', clientId)
    .single();
  const lastSeen = userData?.last_seen;
  const responseTimestamp = checkin.coachResponse?.timestamp;
  checkin.hasNewResponse = !!(responseTimestamp && (!lastSeen || new Date(responseTimestamp) > new Date(lastSeen)));

  return checkin;
}

// ===== BADGE / UNREAD COUNT =====

export async function getUnreadResponseCount(clientId) {
  // Get last_seen from server (survives cache clears, unlike localStorage)
  const { data: userData } = await supabase
    .from('users')
    .select('last_seen')
    .eq('id', clientId)
    .single();
  const lastSeen = userData?.last_seen || '1970-01-01T00:00:00Z';

  // Count check-ins with coach responses newer than lastSeen
  const { data: checkins, error } = await supabase
    .from('checkins')
    .select('id, coach_response')
    .eq('user_id', clientId)
    .not('coach_response', 'is', null);

  if (error || !checkins) return 0;

  return checkins.filter(c => {
    const cr = c.coach_response;
    if (!cr || !cr.timestamp) return false;
    return new Date(cr.timestamp) > new Date(lastSeen);
  }).length;
}

export async function markResponsesSeen(clientId) {
  // Update server-side last_seen (survives cache clears)
  const now = new Date().toISOString();
  await supabase.from('users').update({ last_seen: now }).eq('id', clientId).catch(() => {});
  // Clear badge
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
}

// Get count of check-ins without coach response (for coach badge)
export async function getUnreviewedCheckinCount() {
  // Get coach's last_seen timestamp from users table
  const { data: coaches } = await supabase
    .from('users')
    .select('last_seen')
    .eq('role', 'coach')
    .limit(1);
  const lastSeen = coaches?.[0]?.last_seen || '1970-01-01T00:00:00Z';

  // Count check-ins created AFTER coach last viewed
  const { data: checkins, error } = await supabase
    .from('checkins')
    .select('id, created_at')
    .gt('created_at', lastSeen);

  if (error || !checkins) return 0;
  return checkins.length;
}

export async function markCoachCheckinsSeen() {
  const now = new Date().toISOString();
  await supabase.from('users').update({ last_seen: now }).eq('role', 'coach');
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
}

// ===== PUSH NOTIFICATIONS =====

export async function subscribeToPush(userId, subscription) {
  await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, subscription }),
  });
}

// ===== AI ANALYSIS (Manual Trigger) =====

export async function triggerAIAnalysis(checkinId) {
  const response = await fetch('/api/process-checkin-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkinId }),
  });
  return response.ok;
}

export async function triggerConversationAnalysis(checkinId) {
  const response = await fetch('/api/process-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkinId, reAnalyze: true }),
  });
  return response.ok;
}

// ===== ANALYSIS =====

export async function submitAnalysis(checkinId, analysis) {
  if (analysis.retrigger) {
    // Re-trigger AI analysis via serverless function
    await fetch('/api/process-checkin-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkinId }),
    });
    return { status: 'analysis re-triggered', checkinId };
  }

  const aiAnalysis = {
    keyPoints: analysis.keyPoints || [],
    mood: analysis.mood || '',
    patterns: analysis.patterns || [],
    suggestedQuestions: analysis.suggestedQuestions || [],
    timestamp: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('checkins')
    .update({ ai_analysis: aiAnalysis })
    .eq('id', checkinId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return formatCheckin(data);
}

// ===== RESOURCES =====

export async function getResources(clientId) {
  const { data, error } = await supabase
    .from('users')
    .select('resources')
    .eq('id', clientId)
    .single();
  if (error) throw new Error(error.message);
  return (data?.resources || []).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function uploadResource(clientId, { title, description, file }) {
  // Upload file to R2 via presigned URL
  const ext = file.name?.split('.').pop()?.toLowerCase() || 'bin';
  const contentType = file.type || 'application/octet-stream';

  const presignRes = await fetch('/api/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extension: ext, contentType }),
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { presignedUrl, filename } = await presignRes.json();

  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('Resource upload failed');

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const audioExts = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'webm'];
  const fileType = ext === 'pdf' ? 'pdf' : imageExts.includes(ext) ? 'image' : audioExts.includes(ext) ? 'audio' : 'video';

  const resource = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: (description || '').trim(),
    type: fileType,
    filePath: filename,
    originalName: file.name,
    timestamp: new Date().toISOString(),
  };

  // Get current resources and append
  const { data: user } = await supabase
    .from('users')
    .select('resources')
    .eq('id', clientId)
    .single();

  const resources = user?.resources || [];
  resources.push(resource);

  await supabase.from('users')
    .update({ resources })
    .eq('id', clientId);

  return resource;
}

export async function deleteResource(clientId, resourceId) {
  const { data: user } = await supabase
    .from('users')
    .select('resources')
    .eq('id', clientId)
    .single();

  const resources = (user?.resources || []).filter(r => r.id !== resourceId);
  await supabase.from('users')
    .update({ resources })
    .eq('id', clientId);
  return { success: true };
}

// ===== MEDIA URL =====

export function avatarUrl(avatarPath) {
  return getPublicUrl(avatarPath);
}

export function mediaUrl(mediaPath) {
  return getPublicUrl(mediaPath);
}

// ===== HELPERS =====

function formatCheckin(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    ratings: row.ratings || {},
    practices: row.practices || {},
    mediaType: row.media_type || 'none',
    textNote: row.text_note || '',
    mediaPath: row.media_path,
    aiAnalysis: row.ai_analysis || null,
    conversationAnalysis: row.conversation_analysis || null,
    coachResponse: row.coach_response || null,
    replies: row.replies || undefined,
    createdAt: row.created_at,
  };
}

function formatReply(r) {
  return {
    id: r.id,
    from: r.from,
    type: r.type,
    mediaPath: r.media_path,
    text: r.text,
    timestamp: r.timestamp,
  };
}

// Upload with progress tracking via XMLHttpRequest (for non-Supabase endpoints)
export function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.send(formData);
  });
}
