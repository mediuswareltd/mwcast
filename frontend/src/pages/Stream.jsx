import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { MessageCircle, Send, Heart, Shield, Copy, Check, Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff, Square, Radio, Minimize2 } from 'lucide-react';
import JoinStreamModal from '../components/JoinStreamModal';
import WhepPlayer from '../components/WhepPlayer';
import { API_BASE_URL, WS_CHAT_URL, HLS_URL } from '../config';
import { useWhipPublisher } from '../hooks/useWhipPublisher';

// Helper: "Subal Roy" → "SR"
const getInitials = (name = '') =>
  name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// Silent black canvas stream — keeps WHIP/HLS alive when cam is off
function buildSilentStream(audioTrack = null) {
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2, 2);
  const vt = canvas.captureStream(1).getVideoTracks()[0];
  const tracks = [vt, ...(audioTrack ? [audioTrack] : [])];
  return new MediaStream(tracks);
}

const Stream = () => {
  const { username: streamerName } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isHost = searchParams.get('host') === 'true';
  const streamId = searchParams.get('id');
  const initialTitle = searchParams.get('title') || 'Live Stream';

  const [guestName, setGuestName] = useState(() =>
    isHost ? streamerName : sessionStorage.getItem('mwcast_nickname')
  );
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(!isHost && !sessionStorage.getItem('mwcast_nickname'));
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedServer, setCopiedServer] = useState(false);
  const [streamData, setStreamData] = useState(null);
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [publishState, setPublishState] = useState('idle');

  // Host state
  const [micOn, setMicOn]           = useState(true);
  const [camOn, setCamOn]           = useState(true);
  const [hasCam, setHasCam]         = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Keep refs in sync so async callbacks always have fresh values
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);
  useEffect(() => { camOnRef.current = camOn; }, [camOn]);
  useEffect(() => { screenSharingRef.current = screenSharing; }, [screenSharing]);

  // Viewer: host state received over WS
  // Default hostCamOn to false — show avatar until host confirms cam is on.
  // This prevents the "waiting for stream" flash on initial load.
  const [hostCamOn, setHostCamOn]               = useState(false);
  const [hostScreenSharing, setHostScreenSharing] = useState(false);
  const [hostName, setHostName]                 = useState('');

  // Viewer PiP drag state
  const [viewerPipStyle, setViewerPipStyle]         = useState({ bottom: 16, right: 16 });
  const [viewerPipMinimized, setViewerPipMinimized] = useState(false);
  const viewerPipDragOffset = useRef({ x: 0, y: 0 });

  const { publish, stop: stopPublisher } = useWhipPublisher();
  const { publish: publishCam, stop: stopCamPublisher } = useWhipPublisher(); // camera PiP during screen share
  const localMedia     = useRef(null);
  const localVideoRef  = useRef(null);
  const screenVideoRef = useRef(null); // host screen share preview
  const pipRef         = useRef(null);
  const screenTrackRef = useRef(null);
  const republishRef   = useRef(null); // stable ref to republish fn (avoids stale closure in init)
  const pipDragOffset  = useRef({ x: 0, y: 0 });
  // Stable refs for current host state — used in WS/async callbacks to avoid stale closures
  const micOnRef         = useRef(true);
  const camOnRef         = useRef(true);
  const screenSharingRef = useRef(false);
  const [pipStyle, setPipStyle]         = useState({ bottom: 12, right: 12 });
  const [pipMinimized, setPipMinimized] = useState(false);
  const wsRef      = useRef(null);
  const chatEndRef = useRef(null);
  const hlsPollRef = useRef(null);

  const hostDisplayName = window.__mwcast_username || streamerName;

  // Load chat history
  useEffect(() => {
    if (streamId) {
      const saved = sessionStorage.getItem(`mwcast_chat_${streamId}`);
      if (saved) setMessages(JSON.parse(saved));
    }
  }, [streamId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── HOST: init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const init = async () => {
      if (window.__mwcast_stream) {
        // Normal flow — came from GoLiveModal
        localMedia.current = window.__mwcast_stream;
        const audioEnabled = localMedia.current.getAudioTracks()[0]?.enabled ?? true;
        const videoEnabled = localMedia.current.getVideoTracks()[0]?.enabled ?? true;
        const camAvailable = window.__mwcast_has_cam ?? true;
        setMicOn(audioEnabled);
        setCamOn(camAvailable ? videoEnabled : false);
        setHasCam(camAvailable);
        micOnRef.current = audioEnabled;
        camOnRef.current = camAvailable ? videoEnabled : false;
        if (localVideoRef.current) localVideoRef.current.srcObject = localMedia.current;
        // Republish from Stream.jsx's own WHIP instance — GoLiveModal's connection
        // is about to die when the modal unmounts/closes.
        await republishRef.current({ cam: camAvailable ? videoEnabled : false, screen: false });
      } else {
        // Page was refreshed — re-acquire media and republish
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          localMedia.current = s;
          window.__mwcast_stream = s;
          window.__mwcast_has_cam = true;
          window.__mwcast_username = window.__mwcast_username || streamerName;
          if (localVideoRef.current) localVideoRef.current.srcObject = s;
          setHasCam(true); setCamOn(true); setMicOn(true);
          await republishRef.current({ cam: true, screen: false });
        } catch (_) {
          // No camera — try audio only
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            localMedia.current = s;
            window.__mwcast_stream = s;
            window.__mwcast_has_cam = false;
            setHasCam(false); setCamOn(false); setMicOn(true);
            await republishRef.current({ cam: false, screen: false });
          } catch (_) {}
        }
      }

      setPublishState('publishing');
      hlsPollRef.current = setInterval(async () => {
        try {
          const res = await fetch(HLS_URL(streamId));
          if (res.ok) { setPublishState('publishing'); clearInterval(hlsPollRef.current); hlsPollRef.current = null; }
        } catch (_) {}
      }, 3000);
    };

    init();

    return () => {
      stopPublisher();
      if (hlsPollRef.current) { clearInterval(hlsPollRef.current); hlsPollRef.current = null; }
    };
  }, [isHost, streamId]);

  // ── VIEWER: fetch stream data ────────────────────────────────────────────────
  useEffect(() => {
    if (isHost || !streamId) return;
    fetch(`${API_BASE_URL}/api/v1/streams/${streamId}/join`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStreamData(data.data);
          setHostName(data.data.host_name || data.data.username || '');
          if (!streamerName || streamerName === 'undefined') {
            window.history.replaceState(null, '',
              `/s/${data.data.username}?id=${streamId}&title=${encodeURIComponent(data.data.title)}`);
          }
        }
      });
  }, [isHost, streamId]);

  // ── VIEWER: poll stream status ───────────────────────────────────────────────
  useEffect(() => {
    if (isHost || !streamId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/streams/${streamId}`);
        const data = await res.json();
        if (data.success && data.data.status !== 'live') { setStreamEnded(true); clearInterval(iv); }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(iv);
  }, [isHost, streamId]);

  // ── WebSocket chat + host_state ──────────────────────────────────────────────
  useEffect(() => {
    if (!streamId || !guestName) return;
    let cancelled = false;
    let reconnectTimer = null;
    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(`${WS_CHAT_URL}/${streamId}?username=${encodeURIComponent(guestName)}`);
      wsRef.current = socket;
      socket.onopen = () => {
        // Host: immediately broadcast current state so any joining viewer gets it
        if (isHost) {
          socket.send(JSON.stringify({
            type: 'host_state',
            camOn: camOnRef.current,
            screenSharing: screenSharingRef.current,
            hostName: window.__mwcast_username || streamerName,
          }));
        }
      };
      socket.onmessage = (event) => {
        if (cancelled) return;
        const data = JSON.parse(event.data);
        // Host state broadcast — not a chat message
        if (data.type === 'host_state') {
          setHostCamOn(data.camOn ?? true);
          setHostScreenSharing(data.screenSharing ?? false);
          if (data.hostName) setHostName(data.hostName);
          return;
        }
        setMessages(prev => {
          const next = [...prev, data].slice(-50);
          sessionStorage.setItem(`mwcast_chat_${streamId}`, JSON.stringify(next));
          return next;
        });
      };
      socket.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        fetch(`${API_BASE_URL}/api/v1/streams/${streamId}`)
          .then(r => r.json())
          .then(data => {
            if (cancelled) return;
            if (data.success && data.data.status !== 'live') setStreamEnded(true);
            else reconnectTimer = setTimeout(connect, 2000);
          })
          .catch(() => { if (!cancelled) reconnectTimer = setTimeout(connect, 3000); });
      };
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [streamId, guestName]);

  // Ensure camera video element always has srcObject when it's visible
  useLayoutEffect(() => {
    if (!isHost || !camOn || !localMedia.current) return;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localMedia.current;
      localVideoRef.current.play().catch(() => {});
    }
    if (pipRef.current && screenSharing) {
      pipRef.current.srcObject = localMedia.current;
      pipRef.current.play().catch(() => {});
    }
  }, [isHost, camOn, publishState, screenSharing, pipMinimized]);

  const broadcastHostState = (state) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'host_state',
      camOn: state.camOn ?? camOnRef.current,
      screenSharing: state.screenSharing ?? screenSharingRef.current,
      hostName: hostDisplayName,
    }));
  };

  // ── HOST: republish WHIP stream ──────────────────────────────────────────────
  const republish = async ({ cam, screen }) => {
    stopPublisher();
    const audioTrack = localMedia.current?.getAudioTracks()[0] ?? null;
    if (audioTrack) audioTrack.enabled = micOnRef.current;

    if (screen && screenTrackRef.current) {
      const stream = new MediaStream([
        screenTrackRef.current,
        ...(audioTrack ? [audioTrack] : []),
      ]);
      try {
        const pc = await publish(`${streamId}_screen`, stream);
        window.__mwcast_pc = pc;
      } catch (_) {}
    } else {
      const videoTrack = localMedia.current?.getVideoTracks()[0] ?? null;
      if (videoTrack) videoTrack.enabled = cam;
      const stream = cam && videoTrack
        ? new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])])
        : buildSilentStream(audioTrack);
      try {
        const pc = await publish(streamId, stream);
        window.__mwcast_pc = pc;
      } catch (_) {}
    }
  };
  // Keep ref in sync so the init effect can call it before render
  republishRef.current = republish;

  // ── HOST controls ────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    micOnRef.current = next;
    // Just toggle the track — the existing WHIP peer connection handles it.
    // Republishing would tear down and restart the stream unnecessarily.
    const audioTrack = localMedia.current?.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = next;
  };

  const toggleCam = async () => {
    if (!hasCam) return;
    const next = !camOn;
    setCamOn(next);
    camOnRef.current = next;
    if (!screenSharing) {
      await republish({ cam: next, screen: false });
      // Re-attach stream to self-view (needed after republish creates new MediaStream)
      if (localVideoRef.current) localVideoRef.current.srcObject = localMedia.current;
    } else {
      // During screen share — update the camera PiP stream
      if (next) {
        const videoTrack = localMedia.current?.getVideoTracks()[0] ?? null;
        if (videoTrack) {
          videoTrack.enabled = true;
          const audioTrack = localMedia.current?.getAudioTracks()[0] ?? null;
          const camStream = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
          await publishCam(`${streamId}_cam`, camStream);
        }
      } else {
        stopCamPublisher();
      }
    }
    broadcastHostState({ camOn: next, screenSharing: screenSharingRef.current });
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
      screenSharingRef.current = false;
      if (screenVideoRef.current) { screenVideoRef.current.srcObject = null; }
      stopPublisher(); // stops the _screen WHIP connection
      stopCamPublisher();
      await republish({ cam: camOnRef.current, screen: false }); // republish camera to main path
      if (localVideoRef.current) localVideoRef.current.srcObject = localMedia.current;
      broadcastHostState({ camOn: camOnRef.current, screenSharing: false });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;
        setScreenSharing(true);
        screenSharingRef.current = true;
        setPipStyle({ bottom: 12, right: 12 });
        setPipMinimized(false);
        if (pipRef.current) pipRef.current.srcObject = localMedia.current;
        // Show screen preview in host view
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = new MediaStream([screenTrack]);
          screenVideoRef.current.play().catch(() => {});
        }

        // Publish screen as separate stream path
        await republish({ cam: false, screen: true });

        // Publish camera as separate PiP stream (viewers can see it)
        if (camOn) {
          const videoTrack = localMedia.current?.getVideoTracks()[0] ?? null;
          const audioTrack = localMedia.current?.getAudioTracks()[0] ?? null;
          if (videoTrack) {
            videoTrack.enabled = true;
            const camStream = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
            await publishCam(`${streamId}_cam`, camStream);
          }
        }

        broadcastHostState({ camOn: camOnRef.current, screenSharing: true });

        screenTrack.addEventListener('ended', async () => {
          screenTrackRef.current = null;
          setScreenSharing(false);
          screenSharingRef.current = false;
          if (screenVideoRef.current) { screenVideoRef.current.srcObject = null; }
          stopPublisher();
          stopCamPublisher();
          await republish({ cam: camOnRef.current, screen: false });
          if (localVideoRef.current) localVideoRef.current.srcObject = localMedia.current;
          broadcastHostState({ camOn: camOnRef.current, screenSharing: false });
        });
      } catch (_) {}
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleJoin = (name) => {
    sessionStorage.setItem('mwcast_nickname', name);
    setGuestName(name);
    setIsJoinModalOpen(false);
  };

  const handleStop = async () => {
    setIsStopping(true);
    stopPublisher();
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/streams/stop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: streamId }),
      });
      if (res.ok) navigate('/');
      else { const e = await res.json(); alert('Failed to stop: ' + (e.error?.message || 'Unknown')); }
    } catch (e) { alert('Network error'); }
    finally { setIsStopping(false); setIsStopModalOpen(false); }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ message: inputText }));
    setInputText('');
  };

  const copyText = (text, fn) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    fn(true); setTimeout(() => fn(false), 2000);
  };
  const copyLink = () => copyText(`${window.location.origin}/s/${streamerName}?id=${streamId}`, setCopied);

  // ── Host PiP drag ─────────────────────────────────────────────────────────────
  const onPipMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const container = el.parentElement;
    const rect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    pipDragOffset.current = { x: e.clientX - elRect.left, y: e.clientY - elRect.top };
    const onMove = (me) => {
      if (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4) moved = true;
      if (!moved) return;
      const x = Math.max(0, Math.min(me.clientX - rect.left - pipDragOffset.current.x, rect.width - elRect.width));
      const y = Math.max(0, Math.min(me.clientY - rect.top - pipDragOffset.current.y, rect.height - elRect.height));
      setPipStyle({ right: rect.width - x - elRect.width, bottom: rect.height - y - elRect.height });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved && pipMinimized) setPipMinimized(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Viewer PiP drag ───────────────────────────────────────────────────────────
  const onViewerPipMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const container = el.parentElement;
    const rect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    viewerPipDragOffset.current = { x: e.clientX - elRect.left, y: e.clientY - elRect.top };
    const onMove = (me) => {
      if (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4) moved = true;
      if (!moved) return;
      const x = Math.max(0, Math.min(me.clientX - rect.left - viewerPipDragOffset.current.x, rect.width - elRect.width));
      const y = Math.max(0, Math.min(me.clientY - rect.top - viewerPipDragOffset.current.y, rect.height - elRect.height));
      setViewerPipStyle({ right: rect.width - x - elRect.width, bottom: rect.height - y - elRect.height });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved && viewerPipMinimized) setViewerPipMinimized(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Poll for camera PiP HLS when screen sharing — removed, now using WHEP directly

  // ── VIEWER: detect active stream via MediaMTX API ───────────────────────────
  // Handles OBS/external sources that don't broadcast host_state over WS.
  // If the main stream path has an active publisher, show the stream.
  useEffect(() => {
    if (isHost || !streamId) return;
    const check = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:9997/v3/paths/get/live/${streamId}`);
        if (!res.ok) return;
        const data = await res.json();
        // Always update based on whether a publisher is active
        setHostCamOn(!!(data.source));
      } catch (_) {}
    };
    check();
    const iv = setInterval(check, 3000);
    return () => clearInterval(iv);
  }, [isHost, streamId]);
  // With WHEP, WhepPlayer handles its own connection — no hlsReady needed
  const viewerShowStream = !isHost && !streamEnded && streamData && (hostCamOn || hostScreenSharing);
  const viewerShowAvatar = !isHost && !streamEnded && streamData && !hostScreenSharing && !hostCamOn;
  const viewerShowPip    = !isHost && viewerShowStream && hostScreenSharing;

  // Which stream path to play in the main view
  // When screen sharing: play the screen stream; otherwise play the camera stream
  const mainStreamId = hostScreenSharing ? `${streamId}_screen` : streamId;
  const pipStreamId  = `${streamId}_cam`;

  return (
    <div className="flex flex-col xl:flex-row gap-4 max-w-[2000px] mx-auto transition-colors duration-300 xl:h-[calc(100vh-96px)]">
      <JoinStreamModal isOpen={isJoinModalOpen} onJoin={handleJoin} />

      {/* Stop Stream Modal */}
      {isStopModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
                  <Square size={22} className="text-red-500" fill="currentColor" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white">Stop the stream?</h3>
                  <p className="text-sm text-slate-500 font-medium mt-0.5">This will disconnect all viewers immediately.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setIsStopModalOpen(false)} disabled={isStopping}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                Cancel
              </button>
              <button onClick={handleStop} disabled={isStopping}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg disabled:opacity-60">
                {isStopping ? 'Stopping...' : 'Yes, Stop Stream'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col flex-1 gap-3 min-h-0 min-w-0">

        {/* Video area */}
        <div className="relative bg-black rounded-2xl overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 shadow-2xl border-2 border-slate-100 dark:border-slate-900/40 transition-colors w-full aspect-video xl:aspect-auto xl:flex-1 xl:min-h-0">

          {/* ── HOST VIEW ── */}
          {isHost && (
            <div className="w-full h-full relative bg-slate-900">
              {publishState === 'publishing' ? (
                <>
                  {/* Main view: screen share preview OR camera OR avatar */}
                  {screenSharing ? (
                    <div className="w-full h-full relative bg-slate-950 flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                        <Monitor size={32} className="text-indigo-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-white font-black text-base tracking-tight">You are sharing your screen</p>
                      </div>
                      <button onClick={toggleScreenShare}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all">
                        <MonitorOff size={13} /> Stop Sharing
                      </button>
                      {/* Hidden video keeps srcObject alive for the stream */}
                      <video ref={screenVideoRef} autoPlay muted playsInline className="hidden" />
                    </div>
                  ) : camOn ? (
                    <video
                      ref={localVideoRef}
                      autoPlay muted playsInline
                      className="w-full h-full object-cover mirror" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 gap-3">
                      <div className="w-24 h-24 rounded-full bg-indigo-600/20 border-2 border-indigo-500/30 flex items-center justify-center">
                        <span className="text-3xl font-black text-indigo-300 select-none">{getInitials(hostDisplayName)}</span>
                      </div>
                      <span className="text-slate-400 text-xs font-bold">{hostDisplayName}</span>
                    </div>
                  )}

                  {/* Muted indicator */}
                  {!micOn && (
                    <div className="absolute bottom-3 left-3 bg-red-600/90 rounded-lg px-2 py-1 flex items-center gap-1 pointer-events-none">
                      <MicOff size={11} className="text-white" />
                      <span className="text-white text-[10px] font-black">Muted</span>
                    </div>
                  )}

                  {/* Camera PiP during screen share — draggable, minimizable */}
                  {screenSharing && (
                    <div onMouseDown={onPipMouseDown} style={{ bottom: pipStyle.bottom, right: pipStyle.right }}
                      className={`absolute z-10 select-none transition-[width,height,border-radius] duration-200 ${
                        pipMinimized
                          ? 'w-12 h-12 rounded-full border-2 border-white/30 shadow-2xl cursor-pointer bg-indigo-700/80 overflow-hidden'
                          : 'w-44 aspect-video rounded-xl border-2 border-white/20 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing bg-slate-800'
                      }`}>
                      {pipMinimized ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-sm font-black text-white select-none">{getInitials(hostDisplayName)}</span>
                        </div>
                      ) : (
                        <>
                          {camOn
                            ? <video ref={pipRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
                            : <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                <div className="w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                                  <span className="text-sm font-black text-indigo-300 select-none">{getInitials(hostDisplayName)}</span>
                                </div>
                              </div>
                          }
                          {!micOn && <div className="absolute bottom-1 left-1 bg-red-600/90 rounded p-0.5"><MicOff size={9} className="text-white" /></div>}
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => setPipMinimized(true)}
                            className="absolute top-1 right-1 bg-black/50 hover:bg-black/80 rounded-full p-0.5 transition-colors" title="Minimize">
                            <Minimize2 size={10} className="text-white" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                    <Camera size={32} className="opacity-40" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Connecting stream...</span>
                </div>
              )}
              {/* Host badge */}
              <div className="absolute top-4 left-4 pointer-events-none">
                <div className="bg-emerald-500 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-1.5">
                  <Shield size={12} /> Host Mode
                </div>
              </div>
            </div>
          )}

          {/* ── VIEWER VIEW ── */}
          {!isHost && (
            <div className="w-full h-full relative bg-slate-900">
              {streamEnded ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                  <div className="w-14 h-14 bg-slate-700 rounded-full flex items-center justify-center">
                    <Square size={24} className="text-slate-400" fill="currentColor" />
                  </div>
                  <span className="text-base font-black uppercase tracking-widest text-slate-300">Stream Ended</span>
                  <p className="text-xs text-slate-500 font-medium">The host has stopped the broadcast.</p>
                  <button onClick={() => navigate('/')}
                    className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all">
                    Back to Home
                  </button>
                </div>
              ) : viewerShowAvatar ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 gap-3">
                  <div className="w-24 h-24 rounded-full bg-indigo-600/20 border-2 border-indigo-500/30 flex items-center justify-center">
                    <span className="text-3xl font-black text-indigo-300 tracking-tight select-none">
                      {getInitials(hostName || streamerName)}
                    </span>
                  </div>
                  <span className="text-slate-400 text-xs font-bold">{hostName || streamerName}</span>
                </div>
              ) : viewerShowStream ? (
                <>
                  {/* Main stream via WHEP — screen share or camera */}
                  <WhepPlayer streamId={mainStreamId} stopped={streamEnded} className="w-full h-full" />

                  {/* PiP during screen share — shows camera via WHEP */}
                  {viewerShowPip && (
                    <div onMouseDown={onViewerPipMouseDown}
                      style={{ bottom: viewerPipStyle.bottom, right: viewerPipStyle.right }}
                      className={`absolute z-10 select-none transition-[width,height,border-radius] duration-200 ${
                        viewerPipMinimized
                          ? 'w-12 h-12 rounded-full border-2 border-white/30 shadow-2xl cursor-pointer bg-indigo-700/80 overflow-hidden'
                          : 'w-44 aspect-video rounded-xl border-2 border-white/20 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing bg-slate-800'
                      }`}>
                      {viewerPipMinimized ? (
                        <div className="w-full h-full flex items-center justify-center"
                          onClick={() => setViewerPipMinimized(false)}>
                          <span className="text-sm font-black text-white select-none">
                            {getInitials(hostName || streamerName)}
                          </span>
                        </div>
                      ) : (
                        <>
                          {hostCamOn
                            ? <WhepPlayer streamId={pipStreamId} stopped={streamEnded} className="w-full h-full" controls={false} />
                            : <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                <div className="w-12 h-12 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center">
                                  <span className="text-base font-black text-indigo-300 select-none">
                                    {getInitials(hostName || streamerName)}
                                  </span>
                                </div>
                              </div>
                          }
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => setViewerPipMinimized(true)}
                            className="absolute top-1 right-1 bg-black/50 hover:bg-black/80 rounded-full p-0.5 transition-colors z-10">
                            <Minimize2 size={10} className="text-white" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 animate-pulse">
                  <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
                    <div className="w-6 h-6 bg-indigo-500 rounded-full animate-ping" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {streamData ? 'Waiting for stream...' : 'Connecting to stream...'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Host controls bar */}
        {isHost && publishState === 'publishing' && (
          <div className="flex items-center justify-center flex-wrap gap-2 bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-700 shrink-0">
            <button onClick={toggleMic}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${micOn ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-red-600 border-red-600 text-white'}`}>
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
              <span className="hidden sm:inline">{micOn ? 'Mute' : 'Unmuted'}</span>
            </button>
            <button onClick={toggleCam} disabled={!hasCam}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${!hasCam ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-slate-500' : camOn ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-red-600 border-red-600 text-white'}`}>
              {camOn ? <Camera size={13} /> : <CameraOff size={13} />}
              <span className="hidden sm:inline">{!hasCam ? 'No Cam' : camOn ? 'Cam On' : 'Cam Off'}</span>
            </button>
            {navigator.mediaDevices?.getDisplayMedia && (
              <button onClick={toggleScreenShare}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${screenSharing ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                {screenSharing ? <MonitorOff size={13} /> : <Monitor size={13} />}
                <span className="hidden sm:inline">{screenSharing ? 'Stop Sharing' : 'Share Screen'}</span>
              </button>
            )}
          </div>
        )}

        {/* Channel Info */}
        <div className="flex flex-row items-center justify-between gap-2 bg-white dark:bg-slate-900/40 px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-xl transition-colors shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`}
                alt={streamerName} className="w-10 h-10 rounded-xl ring-4 ring-indigo-500/10 dark:ring-indigo-500/20 shadow-xl bg-white dark:bg-slate-800" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-800 dark:text-white tracking-tight truncate">@{streamData?.username || streamerName}</h2>
              <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs tracking-wide truncate">{streamData?.title || initialTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isHost && (
              <button onClick={() => setIsStopModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl bg-red-600 hover:bg-red-500 text-white active:scale-95">
                <Square size={12} fill="currentColor" />
                <span className="hidden sm:inline">Stop Stream</span>
                <span className="sm:hidden">Stop</span>
              </button>
            )}
            <button onClick={copyLink}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl ${copied ? 'bg-emerald-500 text-white scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
            </button>
            <button onClick={() => setIsLiked(!isLiked)}
              className={`p-2 rounded-xl transition-all active:scale-90 shadow-xl ${isLiked ? 'bg-pink-500/20 text-pink-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
              <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* RTMP info — host only */}
        {isHost && (
          <div className="bg-slate-900 px-5 py-4 rounded-2xl border border-slate-700 shadow-xl shrink-0 space-y-3">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <Radio size={12} className="text-red-400" /> Stream Settings
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between gap-3 bg-slate-800 rounded-xl px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Server URL</p>
                  <p className="text-xs font-mono text-slate-200 truncate">{`rtmp://${window.location.hostname}:1935/live`}</p>
                </div>
                <button onClick={() => copyText(`rtmp://${window.location.hostname}:1935/live`, setCopiedServer)}
                  className="shrink-0 text-slate-400 hover:text-white transition-colors p-1">
                  {copiedServer ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 bg-slate-800 rounded-xl px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Stream Key</p>
                  <p className="text-xs font-mono text-slate-200 truncate">{streamId}</p>
                </div>
                <button onClick={() => copyText(streamId, setCopiedKey)}
                  className="shrink-0 text-slate-400 hover:text-white transition-colors p-1">
                  {copiedKey ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Sidebar */}
      <div className="w-full xl:w-[380px] flex flex-col bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl backdrop-blur-sm transition-colors min-h-0 h-[400px] xl:h-auto">
        <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900/40 flex items-center gap-2 shrink-0">
          <div className="p-1.5 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-lg">
            <MessageCircle size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="font-black text-slate-700 dark:text-slate-100 tracking-tight text-sm uppercase">Community Chat</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-50">
              <MessageCircle size={32} strokeWidth={1.5} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-center px-8">Welcome to the stream! Start the conversation.</span>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className="flex gap-3 items-start animate-in slide-in-from-right-2 duration-300">
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${msg.username}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`}
                className="w-7 h-7 rounded-lg bg-white shadow-sm shrink-0 border border-slate-100 dark:border-white/5" alt="" />
              <div className="flex flex-col min-w-0">
                <span className={`text-[11px] font-black tracking-wide ${msg.username === streamerName ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} mb-1`}>{msg.username}</span>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-2xl rounded-tl-none border border-slate-200 dark:border-white/5 shadow-sm">
                  <p className="text-slate-600 dark:text-slate-300 text-sm font-medium leading-relaxed break-words">{msg.message}</p>
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900/40 shrink-0">
          <form className="relative" onSubmit={sendMessage}>
            <input type="text" value={inputText} onChange={e => setInputText(e.target.value)}
              placeholder={streamEnded ? 'Stream has ended' : 'Send a message...'} disabled={streamEnded}
              className={`w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-500 transition-all font-medium shadow-inner ${streamEnded ? 'opacity-50 cursor-not-allowed' : ''}`} />
            <button type="submit" disabled={streamEnded}
              className={`absolute right-2 top-1.5 h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90 ${streamEnded ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Stream;
