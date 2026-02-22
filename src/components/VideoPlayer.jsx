import { useState, useRef, useEffect } from 'react';

/**
 * VideoPlayer — Native thumbnail + streaming playback.
 * 
 * Uses browser's native <video> element with preload="metadata" + #t=0.001
 * to show the first frame as a thumbnail. No canvas needed (avoids CORS issues).
 * On play: streams directly from R2 (supports range requests).
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setPlaying(false);
    setError(false);
    setThumbnailLoaded(false);
  }, [src]);

  // Thumbnail URL: original source with #t=0.001 for first frame
  const thumbnailSrc = src ? src.split('#')[0] + '#t=0.001' : '';

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
        {/* Native video thumbnail — browser renders first frame */}
        <video
          src={thumbnailSrc}
          preload="metadata"
          playsInline
          muted
          onLoadedData={() => setThumbnailLoaded(true)}
          onError={() => setThumbnailLoaded(true)}
          className="w-full rounded-lg"
          style={{ transform: 'translateZ(0)', opacity: thumbnailLoaded ? 0.85 : 0 }}
        />
        {/* Dark fallback while thumbnail loads */}
        {!thumbnailLoaded && (
          <div className="absolute inset-0 bg-forest-700/50 flex items-center justify-center">
            <div className="animate-pulse text-earth-600 text-xs">Loading preview...</div>
          </div>
        )}
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/40 border-2 border-white/60 flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors">
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
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
