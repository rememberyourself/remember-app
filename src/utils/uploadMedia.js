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

  // Show indeterminate progress
  if (onProgress) onProgress(10);

  const { error } = await supabase.storage
    .from('uploads')
    .upload(filename, file, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  if (onProgress) onProgress(100);
  return filename;
}
