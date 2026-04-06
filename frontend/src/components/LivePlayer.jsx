import React, { useRef, useState, useEffect } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';

const LivePlayer = ({ src, className = '', stopped = false }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimer = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;

    const startPlay = () => {
      v.muted = true;
      v.play()
        .then(() => { setPlaying(true); setReady(true); })
        .catch(() => setReady(true));
    };

    // Keep playing state in sync with actual video state
    const onPlay      = () => { setPlaying(true); setReady(true); };
    const onPause     = () => setPlaying(false);
    const onCanPlay   = () => setReady(true);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('canplay', onCanPlay);

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, startPlay);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          hls.destroy();
          hlsRef.current = null;
        }
      });
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
      v.addEventListener('loadedmetadata', startPlay, { once: true });
    }

    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('canplay', onCanPlay);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  // Stop playback when host ends the stream
  useEffect(() => {
    if (!stopped) return;
    const v = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (v) {
      v.pause();
      v.src = '';
      v.load();
    }
    setPlaying(false);
  }, [stopped]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !ready) return;
    if (v.paused) {
      v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const goFullscreen = (e) => {
    e.stopPropagation();
    videoRef.current?.requestFullscreen?.();
  };

  const resetHideTimer = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, []);

  return (
    <div
      className={`relative w-full h-full bg-black select-none ${className}`}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        playsInline
        disablePictureInPicture
        className="w-full h-full object-contain pointer-events-none"
      />

      {/* Red live progress bar */}
      <div className="absolute bottom-12 left-0 right-0 px-4 pointer-events-none">
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 w-full" />
        </div>
      </div>

      {/* Controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${showControls ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={togglePlay}
          className="text-white hover:text-indigo-400 transition-colors p-1"
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>

        <span className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          Live
        </span>

        <div className="flex-1" />

        <button
          onClick={toggleMute}
          className="text-white hover:text-indigo-400 transition-colors p-1"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        <button
          onClick={goFullscreen}
          className="text-white hover:text-indigo-400 transition-colors p-1"
        >
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
};

export default LivePlayer;
