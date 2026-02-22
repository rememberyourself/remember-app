import { useState, useRef, useEffect } from 'react';

/**
 * VideoPlayer — Stream-first with poster frame generation.
 * 
 * iOS Safari quirks handled:
 * - Uses #t=0.001 to trigger first frame render for poster
 * - Falls back to canvas-generated poster if video metadata loads
 * - Streams directly from R2 (supports range requests)
 * - No blob download needed — browser buffers natively
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [posterUrl, setPosterUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  // Generate poster from video first frame
  useEffect(() => {
    if (!src) return;
    setPosterUrl(null);
    setPlaying(false);
    setError(false);

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
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadeddata', onLoaded);
      video.src = '';
      video.load();
    };

    const generatePoster = () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
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
      } catch {}
      cleanup();
    };

    const onSeeked = () => generatePoster();
    const onLoaded = () => {
      if (video.readyState >= 2) {
        video.currentTime = 0.001;
      }
    };
    const onError = () => cleanup();

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.load();

    // Timeout: don't wait forever for poster
    timeout = setTimeout(cleanup, 5000);

    return cleanup;
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
              <div className="animate-pulse text-earth-600 text-xs">Loading preview...</div>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/40 border-2 border-white/60 flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors">
              <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
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
