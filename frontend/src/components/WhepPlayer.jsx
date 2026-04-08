import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { WHEP_URL } from '../config';

/**
 * WebRTC viewer using WHEP — sub-second latency.
 * Props: streamId, className, stopped
 */
const WhepPlayer = ({ streamId, className = '', stopped = false }) => {
  const videoRef  = useRef(null);
  const pcRef     = useRef(null);
  const hideTimer = useRef(null);

  const [playing, setPlaying]           = useState(false);
  const [muted, setMuted]               = useState(true);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    if (stopped || !streamId) return;

    let cancelled = false;

    const connect = async () => {
      // Clean up previous connection
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (cancelled) return;
        const v = videoRef.current;
        if (v && event.streams[0]) {
          v.srcObject = event.streams[0];
          v.muted = true; // must set imperatively — React muted prop unreliable
          v.play().catch(() => {
            // Autoplay blocked — user needs to interact
            // The video element has autoPlay so browser will retry
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          // Retry after a short delay
          setTimeout(() => { if (!cancelled) connect(); }, 3000);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering
        await new Promise(resolve => {
          if (pc.iceGatheringState === 'complete') return resolve();
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') resolve();
          });
          setTimeout(resolve, 2000);
        });

        if (cancelled || pc.signalingState === 'closed') return;

        const res = await fetch(WHEP_URL(streamId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription.sdp,
        });

        if (!res.ok) {
          // Stream not ready yet — retry
          setTimeout(() => { if (!cancelled) connect(); }, 2000);
          return;
        }

        const answerSdp = await res.text();
        if (cancelled || pc.signalingState === 'closed') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      } catch (_) {
        if (!cancelled) setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (videoRef.current) { videoRef.current.srcObject = null; }
    };
  }, [streamId, stopped]);

  // Stop on prop change
  useEffect(() => {
    if (!stopped) return;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setPlaying(false);
  }, [stopped]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
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
    <div className={`relative w-full h-full bg-black select-none ${className}`}
      onMouseMove={resetHideTimer} onTouchStart={resetHideTimer} onClick={togglePlay}>
      <video ref={videoRef} autoPlay playsInline muted disablePictureInPicture
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        className="w-full h-full object-contain pointer-events-none" />

      <div className="absolute bottom-12 left-0 right-0 px-4 pointer-events-none">
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 w-full" />
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${showControls ? 'opacity-100' : 'opacity-0'}`}
        onClick={e => e.stopPropagation()}>
        <button onClick={togglePlay} className="text-white hover:text-indigo-400 transition-colors p-1">
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> Live
        </span>
        <div className="flex-1" />
        <button onClick={toggleMute} className="text-white hover:text-indigo-400 transition-colors p-1">
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button onClick={goFullscreen} className="text-white hover:text-indigo-400 transition-colors p-1">
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
};

export default WhepPlayer;
