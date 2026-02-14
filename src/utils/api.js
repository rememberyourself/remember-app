const API = '/api';

export async function login(code) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  if (!res.ok) throw new Error('Invalid code');
  return res.json();
}

export async function getCheckins(userId) {
  const res = await fetch(`${API}/checkins/${userId}`);
  return res.json();
}

export async function createCheckin(formData) {
  const res = await fetch(`${API}/checkins`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to create check-in');
  return res.json();
}

export async function getClients() {
  const res = await fetch(`${API}/clients`);
  return res.json();
}

export async function getClientDetail(userId) {
  const res = await fetch(`${API}/clients/${userId}`);
  return res.json();
}

export async function createInvite(name) {
  const res = await fetch(`${API}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return res.json();
}

export async function uploadAvatar(userId, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API}/clients/${userId}/avatar`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to upload avatar');
  return res.json();
}

export async function getProfile(userId) {
  const res = await fetch(`${API}/clients/${userId}/profile`);
  if (!res.ok) throw new Error('Failed to get profile');
  return res.json();
}

export async function addCustomPractice(userId, practice) {
  const res = await fetch(`${API}/clients/${userId}/practices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ practice })
  });
  if (!res.ok) throw new Error('Failed to add practice');
  return res.json();
}

export async function removeCustomPractice(userId, practice) {
  const res = await fetch(`${API}/clients/${userId}/practices`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ practice })
  });
  if (!res.ok) throw new Error('Failed to remove practice');
  return res.json();
}

export async function submitCoachResponse(checkinId, formData) {
  const res = await fetch(`${API}/checkins/${checkinId}/response`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to submit response');
  return res.json();
}

export async function submitAnalysis(checkinId, analysis) {
  const res = await fetch(`${API}/checkins/${checkinId}/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(analysis)
  });
  if (!res.ok) throw new Error('Failed to submit analysis');
  return res.json();
}

export async function getLatestCoachResponse(clientId) {
  const res = await fetch(`${API}/checkins/latest-response/${clientId}`);
  return res.json();
}

export async function submitReply(checkinId, formData) {
  const res = await fetch(`${API}/checkins/${checkinId}/reply`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to submit reply');
  return res.json();
}

export async function getResources(clientId) {
  const res = await fetch(`${API}/clients/${clientId}/resources`);
  if (!res.ok) throw new Error('Failed to get resources');
  return res.json();
}

export async function uploadResource(clientId, formData) {
  const res = await fetch(`${API}/clients/${clientId}/resources`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to upload resource');
  return res.json();
}

export async function deleteResource(clientId, resourceId) {
  const res = await fetch(`${API}/clients/${clientId}/resources/${resourceId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete resource');
  return res.json();
}

export async function updateClient(clientId, data) {
  const res = await fetch(`${API}/clients/${clientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update client');
  }
  return res.json();
}

export async function deleteClient(clientId) {
  const res = await fetch(`${API}/clients/${clientId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete client');
  return res.json();
}

export function avatarUrl(avatarPath) {
  if (!avatarPath) return null;
  return `${API}/uploads/${avatarPath}`;
}
