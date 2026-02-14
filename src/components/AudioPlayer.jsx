import { useState, useRef, useEffect, useCallback } from 'react';

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ src, className = '' }) {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDuration(audio.duration);
    const onTime = () => { if (!dragging) setCurrentTime(audio.currentTime); };
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [dragging]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setPlaying(!playing);
  }, [playing]);

  const seek = useCallback((e) => {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const onPointerDown = useCallback((e) => {
    setDragging(true);
    seek(e);
    const onMove = (ev) => seek(ev);
    const onUp = (ev) => {
      seek(ev);
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [seek]);

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`bg-forest-800/80 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
        style={{ backgroundColor: '#C9A96E' }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="#1a2e1a" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="#1a2e1a" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 2.5v11l10-5.5L4 2.5z" fill="#1a2e1a" />
          </svg>
        )}
      </button>

      {/* Time + Progress */}
      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div
          ref={progressRef}
          onPointerDown={onPointerDown}
          className="relative w-full h-6 flex items-center cursor-pointer touch-none"
        >
          {/* Track */}
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-forest-600/50" />
          {/* Filled */}
          <div
            className="absolute left-0 h-1.5 rounded-full transition-[width] duration-75"
            style={{ width: `${progress}%`, backgroundColor: '#C9A96E' }}
          />
          {/* Thumb */}
          <div
            className="absolute w-3 h-3 rounded-full shadow-md transition-[left] duration-75"
            style={{
              left: `calc(${progress}% - 6px)`,
              backgroundColor: '#C9A96E',
              opacity: dragging || playing ? 1 : 0,
            }}
          />
        </div>

        {/* Times */}
        <div className="flex justify-between text-xs text-earth-500 mt-0.5 select-none">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
