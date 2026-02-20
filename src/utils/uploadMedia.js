import { supabase } from './supabase';

/**
 * Upload media directly to Supabase Storage.
 * 
 * Note: Progress tracking doesn't work on iOS Safari for cross-origin uploads.
 * We use a chunked approach: track upload start/complete as 0%/100%.
 * For detailed progress, we'd need TUS protocol (future improvement).
 *
 * @param {Blob|File} file - The file/blob to upload
 * @param {string} extension - File extension (e.g. 'webm', 'mp4')
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} The storage path (filename) in Supabase
 */
export async function uploadMediaDirect(file, extension = 'webm', onProgress) {
  if (onProgress) onProgress(0);

  const filename = `${crypto.randomUUID()}.${extension}`;

  // Determine content type
  const mimeMap = {
    webm: 'video/webm', mp4: 'video/mp4', m4a: 'audio/m4a',
    ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  };
  const contentType = mimeMap[extension] || file.type || 'application/octet-stream';

  // Simulate progress since iOS Safari doesn't fire cross-origin progress events.
  // Estimate upload time based on file size (~500KB/s on cellular, faster on wifi)
  let fakeProgress = 5;
  let fakeInterval = null;
  if (onProgress) {
    onProgress(5);
    const estimatedMs = Math.max(3000, Math.min(60000, (file.size / 500000) * 1000));
    const stepMs = 500;
    const steps = estimatedMs / stepMs;
    const increment = 85 / steps; // Go from 5% to 90%
    fakeInterval = setInterval(() => {
      fakeProgress = Math.min(90, fakeProgress + increment);
      onProgress(Math.round(fakeProgress));
    }, stepMs);
  }

  try {
    const { error } = await supabase.storage
      .from('uploads')
      .upload(filename, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  } finally {
    if (fakeInterval) clearInterval(fakeInterval);
  }

  if (onProgress) onProgress(100);
  return filename;
}
