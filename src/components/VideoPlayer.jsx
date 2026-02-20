import { useState, useRef, useEffect } from 'react';

/**
 * VideoPlayer — downloads full video before playing for smooth iOS playback.
 * Supabase Storage is in the US; streaming causes stuttering on slower connections.
 * Solution: fetch entire file → blob URL → play from local memory.
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(true);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    setDownloading(true);
    setProgress(0);
    setError(false);
    setBlobUrl(null);

    const download = async () => {
      try {
        // Strip the #t=0.001 fragment for fetch (it's only for video element)
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
          if (done) break;
          if (cancelled) return;
          chunks.push(value);
          loaded += value.length;
          if (total > 0) {
            setProgress(Math.round((loaded / total) * 100));
          } else {
            // No content-length: show indeterminate progress
            setProgress(Math.min(95, Math.round(loaded / 1024 / 10)));
          }
        }

        if (cancelled) return;

        const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setDownloading(false);
      } catch (e) {
        if (!cancelled) {
          console.error('[VideoPlayer] Download failed:', e.message);
          // Fallback: use streaming URL directly
          setBlobUrl(src);
          setDownloading(false);
        }
      }
    };

    download();

    return () => {
      cancelled = true;
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [src]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return (
    <div className={`relative ${className}`}>
      {downloading && (
        <div className="absolute inset-0 flex items-center justify-center bg-forest-800/90 rounded-lg z-10">
          <div className="flex flex-col items-center gap-3">
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
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-forest-800/80 rounded-lg z-10">
          <span className="text-red-400/80 text-xs">Failed to load video</span>
        </div>
      )}
      <video
        ref={videoRef}
        src={blobUrl || undefined}
        controls
        playsInline
        preload="auto"
        onError={() => setError(true)}
        className="w-full rounded-lg"
        style={{ transform: 'translateZ(0)' }}
        {...props}
      />
    </div>
  );
}
