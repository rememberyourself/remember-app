import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * VideoPlayer — Lazy loading with blob download for smooth iOS playback.
 * 
 * Shows a play button overlay. Only downloads when user taps play.
 * Downloads full video → blob URL → plays from local memory.
 * This avoids loading all videos on page load.
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | downloading | ready | error
  const [blobUrl, setBlobUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(null);
  const cancelRef = useRef(false);

  // Clean up blob URL on src change or unmount
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
    setDuration(null);
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

  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
  };

  const formatDuration = (secs) => {
    if (!secs || !isFinite(secs)) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`relative rounded-lg overflow-hidden bg-forest-800 ${className}`}>
      {/* Idle state: play button overlay */}
      {state === 'idle' && (
        <button
          onClick={handlePlay}
          className="w-full aspect-video flex flex-col items-center justify-center gap-2 bg-forest-800 hover:bg-forest-700 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-gold-500/20 border-2 border-gold-500/50 flex items-center justify-center">
            <svg className="w-7 h-7 text-gold-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-earth-400 text-xs">Tap to load video</span>
        </button>
      )}

      {/* Downloading state: progress */}
      {state === 'downloading' && (
        <div className="w-full aspect-video flex flex-col items-center justify-center gap-3 bg-forest-800">
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
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="w-full aspect-video flex items-center justify-center bg-forest-800">
          <span className="text-red-400/80 text-xs">Failed to load video</span>
        </div>
      )}

      {/* Video element — only rendered when ready */}
      {(state === 'ready') && (
        <video
          ref={videoRef}
          src={blobUrl || undefined}
          controls
          playsInline
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onError={() => setState('error')}
          className="w-full rounded-lg"
          style={{ transform: 'translateZ(0)' }}
          {...props}
        />
      )}
    </div>
  );
}
