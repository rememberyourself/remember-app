import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * VideoPlayer — Lazy loading with thumbnail preview + blob download.
 * 
 * Idle: Shows video thumbnail (preload=metadata + #t=0.001) with play button overlay.
 * On tap: Downloads full video → blob URL → smooth playback from memory.
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | downloading | ready | error
  const [blobUrl, setBlobUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Reset on src change
  useEffect(() => {
    setState('idle');
    setProgress(0);
    cancelRef.current = false;
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
    setBlobUrl(null);
  }, [src]);

  const handlePlay = useCallback(async () => {
    if (state === 'downloading' || state === 'ready') return;
    if (!src) return;

    setState('downloading');
    setProgress(0);
    cancelRef.current = false;

    try {
      const fetchUrl = src.split('#')[0];
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelRef.current) break;
        chunks.push(value);
        loaded += value.length;
        if (total > 0) {
          setProgress(Math.round((loaded / total) * 100));
        } else {
          setProgress(Math.min(95, Math.round(loaded / 1024 / 10)));
        }
      }

      if (cancelRef.current) return;

      const contentType = response.headers.get('content-type') || 'video/mp4';
      const blob = new Blob(chunks, { type: contentType });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setState('ready');

      // Auto-play after download
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (e) {
      if (!cancelRef.current) {
        console.error('[VideoPlayer] Download failed:', e.message);
        // Fallback: use streaming URL directly
        setBlobUrl(src);
        setState('ready');
      }
    }
  }, [src, state]);

  // Thumbnail URL: original source with #t=0.001 for first frame
  const thumbnailSrc = src ? src.split('#')[0] + '#t=0.001' : '';

  return (
    <div className={`relative rounded-lg overflow-hidden bg-forest-800 ${className}`}>
      {/* Idle state: thumbnail with play button overlay */}
      {state === 'idle' && (
        <div className="relative">
          <video
            src={thumbnailSrc}
            preload="metadata"
            playsInline
            muted
            className="w-full rounded-lg opacity-70"
            style={{ transform: 'translateZ(0)' }}
          />
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          >
            <div className="w-14 h-14 rounded-full bg-black/40 border-2 border-white/60 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        </div>
      )}

      {/* Downloading state: progress overlay on thumbnail */}
      {state === 'downloading' && (
        <div className="relative">
          <video
            src={thumbnailSrc}
            preload="metadata"
            playsInline
            muted
            className="w-full rounded-lg opacity-30"
            style={{ transform: 'translateZ(0)' }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-earth-300 text-xs">{progress}%</span>
              <div className="w-24 h-1 bg-forest-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gold-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="w-full aspect-video flex items-center justify-center bg-forest-800">
          <span className="text-red-400/80 text-xs">Failed to load video</span>
        </div>
      )}

      {/* Video element — only rendered when ready */}
      {state === 'ready' && (
        <video
          ref={videoRef}
          src={blobUrl || undefined}
          controls
          playsInline
          preload="auto"
          onError={() => setState('error')}
          className="w-full rounded-lg"
          style={{ transform: 'translateZ(0)' }}
          {...props}
        />
      )}
    </div>
  );
}
