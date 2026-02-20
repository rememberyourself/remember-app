import { useState, useRef, useEffect } from 'react';

/**
 * VideoPlayer with preload buffering for iOS Safari.
 * Shows a loading spinner until the video has buffered enough to play smoothly.
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setReady(false);
    setError(false);
  }, [src]);

  const handleCanPlay = () => {
    setReady(true);
  };

  const handleError = () => {
    setError(true);
    setReady(true); // Show whatever we have
  };

  return (
    <div className={`relative ${className}`}>
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-forest-800/80 rounded-lg z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
            <span className="text-earth-400 text-xs">Loading video...</span>
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
        src={src}
        controls
        preload="auto"
        playsInline
        onCanPlayThrough={handleCanPlay}
        onCanPlay={handleCanPlay}
        onError={handleError}
        className={`w-full rounded-lg ${ready ? 'opacity-100' : 'opacity-30'} transition-opacity duration-300`}
        {...props}
      />
    </div>
  );
}
