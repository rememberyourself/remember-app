const API = '/api';

/**
 * Upload media directly to Supabase Storage via a signed URL.
 * Flow: get signed URL from server → upload directly to Supabase → return storage path.
 * 
 * @param {Blob|File} file - The file/blob to upload
 * @param {string} extension - File extension (e.g. 'webm', 'mp4')
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} The storage path (filename) in Supabase
 */
export async function uploadMediaDirect(file, extension = 'webm', onProgress) {
  // Step 1: Get a signed upload URL from our server
  const res = await fetch(`${API}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: `recording.${extension}`,
      contentType: file.type || 'application/octet-stream',
    }),
  });
  if (!res.ok) throw new Error('Failed to get upload URL');
  const { url, path } = await res.json();

  // Step 2: Upload directly to Supabase using the signed URL (with progress)
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Direct upload failed: ${xhr.status} ${xhr.responseText}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Direct upload failed')));
    xhr.send(file);
  });

  return path;
}
