import { useState, useRef, useEffect } from 'react';

/**
 * VideoPlayer — simplified for iOS Safari compatibility.
 * Shows loading spinner, waits for sufficient buffer, then reveals.
 * Falls back after timeout to avoid infinite spinner on iOS.
 */
export default function VideoPlayer({ src, className = '', ...props }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setReady(false);
    setError(false);

    // Fallback: show video after 4s even if canplaythrough hasn't fired
    // iOS Safari sometimes never fires canplaythrough for streaming sources
    const timeout = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(timeout);
  }, [src]);

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
        preload="metadata"
        playsInline
        onCanPlayThrough={() => setReady(true)}
        onError={() => { setError(true); setReady(true); }}
        className={`w-full rounded-lg ${ready ? 'opacity-100' : 'opacity-30'}`}
        style={{ transform: 'translateZ(0)' }}
        {...props}
      />
    </div>
  );
}
