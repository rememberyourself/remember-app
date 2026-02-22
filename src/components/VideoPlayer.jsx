import { useState, useRef, useEffect } from 'react';

/**
 * VideoPlayer — Stream-first with poster frame generation.
 * 
 * iOS Safari quirks handled:
 * - Uses #t=0.001 to trigger first frame render for poster
 * - Falls back to canvas-generated poster if video metadata loads
 * - Streams directly from R2 (supports range requests)
 * - No blob download needed — browser buffers natively
 * - Shows play button after 3s even if poster generation fails (CORS)
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [posterUrl, setPosterUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [posterReady, setPosterReady] = useState(false);

  // Generate poster from video first frame
  useEffect(() => {
    if (!src) return;
    setPosterUrl(null);
    setPlaying(false);
    setError(false);
    setPosterReady(false);

    // Fallback timer: show play button after 3s even if poster fails
    const fallbackTimer = setTimeout(() => {
      setPosterReady(true);
    }, 3000);

    // Try to generate a canvas poster from the video
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    // iOS needs #t=0.001 to seek to first frame
    video.src = src.split('#')[0] + '#t=0.001';

    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(fallbackTimer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadeddata', onLoaded);
      video.src = '';
      video.load();
    };

    const generatePoster = () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          setPosterReady(true);
          cleanup();
          return;
        }
        const canvas = document.createElement('canvas');
        // Use smaller size for poster to save memory
        const scale = Math.min(1, 320 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        if (dataUrl && dataUrl.length > 100) {
          setPosterUrl(dataUrl);
        }
      } catch (e) {
        console.log('[VideoPlayer] Poster generation failed (likely CORS):', e.message);
      }
      setPosterReady(true);
      cleanup();
    };

    const onSeeked = () => generatePoster();
    const onLoaded = () => {
      if (video.readyState >= 2) {
        video.currentTime = 0.001;
      }
    };
    const onError = () => {
      setPosterReady(true);
      cleanup();
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.load();

    // Timeout: don't wait forever for poster
    timeout = setTimeout(() => {
      setPosterReady(true);
      cleanup();
    }, 5000);

    return () => {
      clearTimeout(fallbackTimer);
      cleanup();
    };
  }, [src]);

  const handlePlay = () => {
    setPlaying(true);
    // Small delay to let React render the video element
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }, 50);
  };

  if (error) {
    return (
      <div className={`relative rounded-lg overflow-hidden bg-forest-800 ${className}`}>
        <div className="w-full aspect-video flex items-center justify-center">
          <span className="text-red-400/80 text-xs">Failed to load video</span>
        </div>
      </div>
    );
  }

  if (!playing) {
    return (
      <div className={`relative rounded-lg overflow-hidden bg-forest-800 ${className}`}>
        <div className="relative cursor-pointer" onClick={handlePlay}>
          {posterUrl ? (
            <img src={posterUrl} alt="" className="w-full rounded-lg" />
          ) : (
            <div className="w-full aspect-video bg-forest-700/50 flex items-center justify-center">
              {!posterReady ? (
                <div className="animate-pulse text-earth-600 text-xs">Loading preview...</div>
              ) : (
                <svg className="w-12 h-12 text-earth-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
            </div>
          )}
          {/* Always show play button once poster is ready (or after timeout) */}
          {(posterUrl || posterReady) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-black/40 border-2 border-white/60 flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors">
                <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg overflow-hidden bg-forest-800 ${className}`}>
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="auto"
        poster={posterUrl || undefined}
        onError={() => setError(true)}
        className="w-full rounded-lg"
        style={{ transform: 'translateZ(0)' }}
        {...props}
      />
    </div>
  );
}
