import { useState, useRef } from 'react';

/**
 * VideoPlayer — Simple, reliable video player.
 * 
 * Skips canvas-based poster generation (breaks on iOS due to CORS with R2).
 * Shows a dark placeholder with play button immediately.
 * Streams directly from R2 on play (supports range requests).
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const handlePlay = () => {
    setPlaying(true);
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
      <div className={`relative rounded-lg overflow-hidden bg-forest-800 cursor-pointer ${className}`} onClick={handlePlay}>
        <div className="w-full aspect-video bg-forest-700/50 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-black/40 border-2 border-white/60 flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
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
        onError={() => setError(true)}
        className="w-full rounded-lg"
        style={{ transform: 'translateZ(0)' }}
        {...props}
      />
    </div>
  );
}
