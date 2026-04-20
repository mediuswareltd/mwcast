import { useRef, useState, useEffect } from 'react';
import { Volume2, VolumeX, Maximize } from 'lucide-react';
import { WHEP_URL } from '../config';

/**
 * WebRTC viewer using WHEP — sub-second latency.
 * Props: streamId, className, stopped, controls
 */
const WhepPlayer = ({ streamId, className = '', stopped = false, controls = true }) => {
  const videoRef  = useRef(null);
  const pcRef     = useRef(null);
  const hideTimer = useRef(null);

  const [muted, setMuted]               = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    if (stopped || !streamId) return;

    let cancelled = false;
    let retryTimer = null;

    const connect = async () => {
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
        if (!v || !event.streams[0]) return;
        v.srcObject = event.streams[0];
        // Try unmuted first; browsers may block — fall back to muted
        v.muted = false;
        v.play().catch(() => {
          v.muted = true;
          setMuted(true);
          v.play().catch(() => {});
        });
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          retryTimer = setTimeout(() => { if (!cancelled) connect(); }, 3000);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

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
          retryTimer = setTimeout(() => { if (!cancelled) connect(); }, 2000);
          return;
        }

        const answerSdp = await res.text();
        if (cancelled || pc.signalingState === 'closed') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      } catch (_) {
        if (!cancelled) retryTimer = setTimeout(connect, 2000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (videoRef.current) { videoRef.current.srcObject = null; }
    };
  }, [streamId, stopped]);

  useEffect(() => {
    if (!stopped) return;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
  }, [stopped]);

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
      onMouseMove={resetHideTimer} onTouchStart={resetHideTimer}>
      <video ref={videoRef} autoPlay playsInline disablePictureInPicture
        className="w-full h-full object-contain pointer-events-none" />

      {controls && (
        <>
          <div className={`absolute bottom-0 left-0 right-0 px-4 py-4 flex items-center gap-3 bg-gradient-to-t from-black/40 to-transparent transition-opacity duration-300 z-30 pointer-events-auto ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex-1" />
            <button onClick={toggleMute} className="text-white hover:text-indigo-400 transition-colors p-1">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button onClick={goFullscreen} className="text-white hover:text-indigo-400 transition-colors p-1">
              <Maximize size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default WhepPlayer;
