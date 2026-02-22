/**
 * Upload media to Cloudflare R2 via presigned URL.
 * 
 * Flow:
 * 1. Request presigned upload URL from our API
 * 2. PUT file directly to R2 (bypasses Vercel's 4.5MB limit)
 * 3. Return the filename (used as key in DB)
 *
 * @param {Blob|File} file - The file/blob to upload
 * @param {string} extension - File extension (e.g. 'webm', 'mp4')
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} The filename (key) in R2
 */
export async function uploadMediaDirect(file, extension = 'webm', onProgress) {
  if (onProgress) onProgress(0);

  // Determine content type
  const mimeMap = {
    webm: 'video/webm', mp4: 'video/mp4', m4a: 'audio/m4a',
    ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  };
  const contentType = mimeMap[extension] || file.type || 'application/octet-stream';

  // Step 1: Get presigned URL from our API
  if (onProgress) onProgress(5);
  
  const presignRes = await fetch('/api/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extension, contentType }),
  });

  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error(`Failed to get upload URL: ${err.error || presignRes.statusText}`);
  }

  const { presignedUrl, filename } = await presignRes.json();

  // Step 2: Upload directly to R2 via presigned URL
  // Simulate progress since we can't track cross-origin XHR progress on iOS Safari
  let fakeProgress = 10;
  let fakeInterval = null;
  if (onProgress) {
    onProgress(10);
    const estimatedMs = Math.max(3000, Math.min(60000, (file.size / 500000) * 1000));
    const stepMs = 500;
    const steps = estimatedMs / stepMs;
    const increment = 80 / steps; // Go from 10% to 90%
    fakeInterval = setInterval(() => {
      fakeProgress = Math.min(90, fakeProgress + increment);
      onProgress(Math.round(fakeProgress));
    }, stepMs);
  }

  try {
    const uploadRes = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload to R2 failed: ${uploadRes.statusText}`);
    }
  } finally {
    if (fakeInterval) clearInterval(fakeInterval);
  }

  if (onProgress) onProgress(100);
  return filename;
}
