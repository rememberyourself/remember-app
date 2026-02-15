const API = '/api';

/**
 * Upload media via the server (which forwards to Supabase Storage).
 * Uses XHR for reliable progress tracking on iOS Safari.
 * Server-side upload is more reliable than cross-origin signed URLs on mobile browsers.
 *
 * @param {Blob|File} file - The file/blob to upload
 * @param {string} extension - File extension (e.g. 'webm', 'mp4')
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} The storage path (filename) in Supabase
 */
export async function uploadMediaDirect(file, extension = 'webm', onProgress) {
  if (onProgress) onProgress(0);

  const formData = new FormData();
  formData.append('media', file, `recording.${extension}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/upload-media`);

    xhr.upload.addEventListener('progress', (e) => {
      if (onProgress) {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        } else if (file.size > 0) {
          onProgress(Math.round((e.loaded / file.size) * 100));
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (onProgress) onProgress(100);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.path);
        } catch {
          reject(new Error('Invalid response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.send(formData);
  });
}
