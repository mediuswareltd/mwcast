import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { MessageCircle, Send, Heart, Shield, Copy, Check, Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff, Square, Radio, Minimize2, Settings, X } from 'lucide-react';
import JoinStreamModal from '../components/JoinStreamModal';
import WhepPlayer from '../components/WhepPlayer';
import { API_BASE_URL, WS_CHAT_URL, HLS_URL } from '../config';
import { useWhipPublisher } from '../hooks/useWhipPublisher';

// Helper: "Subal Roy" → "SR"
const getInitials = (name = '') =>
  name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const formatTimeAgo = (time) => {
  if (!time) return 'just now';
  const seconds = Math.floor((Date.now() - time) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return 'long ago';
};

const USER_COLORS = [
  'text-emerald-600 dark:text-emerald-400', 'text-cyan-600 dark:text-cyan-400', 'text-fuchsia-600 dark:text-fuchsia-400', 
  'text-amber-600 dark:text-amber-400', 'text-rose-600 dark:text-rose-400', 'text-indigo-600 dark:text-indigo-400', 
  'text-lime-600 dark:text-lime-400', 'text-orange-600 dark:text-orange-400'
];

const getUserColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
};

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
  const [showSettings, setShowSettings] = useState(false);

  // Host state
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasCam, setHasCam] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Keep refs in sync so async callbacks always have fresh values
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);
  useEffect(() => { camOnRef.current = camOn; }, [camOn]);
  useEffect(() => { screenSharingRef.current = screenSharing; }, [screenSharing]);

  // Viewer: host state received over WS
  // Default hostCamOn to false — show avatar until host confirms cam is on.
  // This prevents the "waiting for stream" flash on initial load.
  const [hostCamOn, setHostCamOn] = useState(false);
  const [hostScreenSharing, setHostScreenSharing] = useState(false);
  const [hostName, setHostName] = useState('');

  // Viewer PiP drag state
  const [viewerPipStyle, setViewerPipStyle] = useState({ bottom: 16, right: 16 });
  const [viewerPipMinimized, setViewerPipMinimized] = useState(false);
  const viewerPipDragOffset = useRef({ x: 0, y: 0 });

  const { publish, stop: stopPublisher } = useWhipPublisher();
  const { publish: publishCam, stop: stopCamPublisher } = useWhipPublisher(); // camera PiP during screen share
  const localMedia = useRef(null);
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null); // host screen share preview
  const pipRef = useRef(null);
  const screenTrackRef = useRef(null);
  const republishRef = useRef(null); // stable ref to republish fn (avoids stale closure in init)
  const pipDragOffset = useRef({ x: 0, y: 0 });
  // Stable refs for current host state — used in WS/async callbacks to avoid stale closures
  const micOnRef = useRef(true);
  const camOnRef = useRef(true);
  const screenSharingRef = useRef(false);
  const [pipStyle, setPipStyle] = useState({ bottom: 12, right: 12 });
  const [pipMinimized, setPipMinimized] = useState(false);
  const wsRef = useRef(null);
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

  // Periodic refresh for "ago" timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, []);

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
          } catch (_) { }
        }
      }

      setPublishState('publishing');
      hlsPollRef.current = setInterval(async () => {
        try {
          const res = await fetch(HLS_URL(streamId));
          if (res.ok) { setPublishState('publishing'); clearInterval(hlsPollRef.current); hlsPollRef.current = null; }
        } catch (_) { }
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
      } catch (_) { }
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
            const updated = [...prev, {
              username: data.username,
              message: data.message,
              time: Date.now()
            }].slice(-100);
            sessionStorage.setItem(`mwcast_chat_${streamId}`, JSON.stringify(updated));
            return updated;
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
      localVideoRef.current.play().catch(() => { });
    }
    if (pipRef.current && screenSharing) {
      pipRef.current.srcObject = localMedia.current;
      pipRef.current.play().catch(() => { });
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
      } catch (_) { }
    } else {
      const videoTrack = localMedia.current?.getVideoTracks()[0] ?? null;
      if (videoTrack) videoTrack.enabled = cam;
      const stream = cam && videoTrack
        ? new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])])
        : buildSilentStream(audioTrack);
      try {
        const pc = await publish(streamId, stream);
        window.__mwcast_pc = pc;
      } catch (_) { }
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
          screenVideoRef.current.play().catch(() => { });
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
      } catch (_) { }
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
    navigator.clipboard?.writeText(text).catch(() => { });
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

  useEffect(() => {
    if (isHost || !streamId) return;
    const check = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:9997/v3/paths/get/live/${streamId}`);
        if (!res.ok) return;
        const data = await res.json();
        setHostCamOn(!!(data.source));
      } catch (_) { }
    };
    check();
    const iv = setInterval(check, 3000);
    return () => clearInterval(iv);
  }, [isHost, streamId]);

  const viewerShowStream = !isHost && !streamEnded && streamData && (hostCamOn || hostScreenSharing);
  const viewerShowAvatar = !isHost && !streamEnded && streamData && !hostScreenSharing && !hostCamOn;
  const viewerShowPip = !isHost && viewerShowStream && hostScreenSharing;

  const mainStreamId = hostScreenSharing ? `${streamId}_screen` : streamId;
  const pipStreamId = `${streamId}_cam`;

  return (
    <div className="flex flex-col xl:flex-row gap-4 max-w-[2400px] mx-auto p-2 xl:p-4 justify-center transition-all duration-500 xl:h-[calc(100vh-80px)] font-sans">
      <JoinStreamModal isOpen={isJoinModalOpen} onJoin={handleJoin} />

      {/* Stop Stream Modal */}
      {isStopModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden transform animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
                <Square size={28} className="text-red-500" fill="currentColor" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Stop Broadcasting?</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">This will disconnect all viewers immediately.</p>
              </div>
            </div>
            <div className="flex gap-3 px-8 pb-8">
              <button onClick={() => setIsStopModalOpen(false)} disabled={isStopping}
                className="flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                Cancel
              </button>
              <button onClick={handleStop} disabled={isStopping}
                className="flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg active:scale-95 disabled:opacity-60">
                {isStopping ? 'Stopping...' : 'End Stream'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content: Video + Dashboard */}
      <div className="flex flex-col w-full max-w-5xl gap-3 min-h-0 min-w-0">

        {/* Video Player Area */}
        <div className="relative group bg-slate-950 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5 aspect-video w-full max-h-[65vh]">

          {/* ── HOST VIEW ── */}
          {isHost && (
            <div className="w-full h-full relative">
              {publishState === 'publishing' ? (
                <>
                  {screenSharing ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-900/95">
                      <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                        <Monitor size={32} className="text-indigo-400" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-white font-black text-lg tracking-tight">Sharing Screen</h3>
                        <p className="text-slate-400 text-xs font-medium">Your desktop is live for all viewers</p>
                      </div>
                      <button onClick={toggleScreenShare}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                        <MonitorOff size={14} /> Stop Sharing
                      </button>
                      <video ref={screenVideoRef} autoPlay muted playsInline className="hidden" />
                    </div>
                  ) : camOn ? (
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-contain mirror" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 gap-4">
                      <div className="w-20 h-20 rounded-full border-4 border-white/10 p-1 bg-slate-800">
                        <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`}
                          className="w-full h-full rounded-full object-cover shadow-inner" alt="" />
                      </div>
                      <span className="text-white text-base font-black tracking-tight">{hostDisplayName}</span>
                    </div>
                  )}

                  {/* Host PiP */}
                  {screenSharing && (
                    <div onMouseDown={onPipMouseDown} style={{ bottom: pipStyle.bottom, right: pipStyle.right }}
                      className={`absolute z-20 shadow-2xl transition-all duration-200 group/pip ${pipMinimized
                          ? 'w-12 h-12 rounded-full border-2 border-white/30 cursor-pointer bg-indigo-600 active:scale-95'
                          : 'w-48 aspect-video rounded-2xl border-2 border-white/20 overflow-hidden cursor-grab active:cursor-grabbing bg-slate-800'
                        }`}>
                      {pipMinimized ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera size={16} className="text-white" />
                        </div>
                      ) : (
                        <div className="w-full h-full relative bg-slate-900 flex items-center justify-center">
                          {camOn ? (
                            <video ref={pipRef} autoPlay muted playsInline className="w-full h-full object-cover mirror pointer-events-none" />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <div className="w-12 h-12 rounded-full border-2 border-slate-700 p-0.5 bg-slate-800">
                                <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899`}
                                  className="w-full h-full rounded-full object-cover" alt="" />
                              </div>
                              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{hostDisplayName}</span>
                            </div>
                          )}
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => setPipMinimized(true)}
                            className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 rounded-lg transition-all opacity-0 group-hover/pip:opacity-100 z-10">
                            <Minimize2 size={12} className="text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 bg-slate-950">
                  <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Connecting...</span>
                </div>
              )}
              {/* Host Badge */}
              <div className="absolute top-4 left-4 pointer-events-none">
                <div className="bg-emerald-500/90 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl border border-white/10">
                  <Shield size={12} className="text-white" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Host Mode</span>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEWER VIEW ── */}
          {!isHost && (
            <div className="w-full h-full relative">
              {streamEnded ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-5 bg-slate-950 p-8 text-center font-sans">
                  <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center">
                    <Square size={28} className="text-slate-500" fill="currentColor" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-white tracking-tight uppercase">Stream Offline</h3>
                    <p className="text-slate-500 text-xs font-medium">This broadcast has concluded.</p>
                  </div>
                  <button onClick={() => navigate('/')}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    Explore Streams
                  </button>
                </div>
              ) : viewerShowStream ? (
                <>
                  <WhepPlayer streamId={mainStreamId} stopped={streamEnded} className="w-full h-full" />
                  {/* LIVE Badge */}
                  <div className="absolute top-4 left-4 pointer-events-none">
                    <div className="bg-red-600 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl border border-white/10">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Live</span>
                    </div>
                  </div>
                  {viewerShowPip && (
                    <div onMouseDown={onViewerPipMouseDown} style={{ bottom: viewerPipStyle.bottom, right: viewerPipStyle.right }}
                      className={`absolute z-20 shadow-2xl group/pip transition-all duration-200 ${viewerPipMinimized
                          ? 'w-12 h-12 rounded-full border-2 border-white/30 cursor-pointer bg-indigo-600 overflow-hidden'
                          : 'w-48 aspect-video rounded-2xl border-2 border-white/20 overflow-hidden cursor-grab active:cursor-grabbing bg-slate-800'
                        }`}>
                      {viewerPipMinimized ? (
                        <div className="w-full h-full flex items-center justify-center" onClick={() => setViewerPipMinimized(false)}>
                          <Camera size={16} className="text-white" />
                        </div>
                      ) : (
                        <div className="w-full h-full relative bg-slate-900 flex items-center justify-center">
                          {hostCamOn ? (
                            <WhepPlayer streamId={pipStreamId} stopped={streamEnded} className="w-full h-full" controls={false} />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <div className="w-12 h-12 rounded-full border-2 border-slate-700 p-0.5 bg-slate-800">
                                <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899`}
                                  className="w-full h-full rounded-full object-cover" alt="" />
                              </div>
                              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{hostName || streamerName}</span>
                            </div>
                          )}
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => setViewerPipMinimized(true)}
                            className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 rounded-lg transition-all opacity-0 group-hover/pip:opacity-100 z-10">
                            <Minimize2 size={12} className="text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : viewerShowAvatar ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 border border-white/5 gap-5">
                  <div className="relative group">
                    <div className="absolute -inset-4 bg-indigo-500/10 rounded-full blur-2xl transition-all" />
                    <div className="relative w-24 h-24 rounded-full border-4 border-slate-800 p-1 bg-slate-900 shadow-2xl">
                      <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899`}
                        className="w-full h-full rounded-full object-cover" alt="" />
                    </div>
                  </div>
                  <div className="text-center">
                    <h3 className="text-white text-xl font-black tracking-tight">{hostName || streamerName}</h3>
                    <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest mt-1">Broadcaster is on air</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 gap-4">
                  <div className="w-10 h-10 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Connecting...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Host Control Bar */}
        {isHost && publishState === 'publishing' && (
          <div className="flex items-center justify-center gap-2 bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-slate-800 shadow-xl shrink-0">
            <button onClick={toggleMic}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${micOn ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20'}`}>
              {micOn ? <Mic size={14} /> : <MicOff size={14} />}
              <span className="hidden sm:inline">Mic</span>
            </button>
            <button onClick={toggleCam} disabled={!hasCam}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${!hasCam ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-slate-500' : camOn ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20'}`}>
              {camOn ? <Camera size={14} /> : <CameraOff size={14} />}
              <span className="hidden sm:inline">Cam</span>
            </button>
            <button onClick={toggleScreenShare}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${screenSharing ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
              {screenSharing ? <MonitorOff size={14} /> : <Monitor size={14} />}
              <span className="hidden sm:inline">Screen</span>
            </button>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <button onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${showSettings ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'}`}>
              <Settings size={14} className={showSettings ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        )}

        {/* Channel Info Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-xl shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-fuchsia-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition-opacity" />
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`}
                alt={streamerName} className="relative w-12 h-12 rounded-xl ring-2 ring-white dark:ring-slate-800 shadow-xl bg-white dark:bg-slate-800" />
              <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-emerald-500 border-4 border-white dark:border-slate-900 rounded-full" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">@{streamerName}</h2>
                {isHost && <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.2em]">Host</span>}
              </div>
              <p className="text-indigo-600 dark:text-indigo-400 font-bold text-sm tracking-wide truncate">{streamData?.title || initialTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isHost && (
              <button onClick={() => setIsStopModalOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 active:scale-95">
                <Square size={14} fill="currentColor" /> Stop
              </button>
            )}
            <button onClick={copyLink}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${copied ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 shadow-inner'}`}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>
            <button onClick={() => setIsLiked(!isLiked)}
              className={`p-3 rounded-xl transition-all active:scale-90 shadow-inner ${isLiked ? 'bg-pink-500/10 text-pink-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-500'}`}>
              <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} className={isLiked ? 'scale-110' : ''} />
            </button>
          </div>
        </div>

        {/* Stream Settings (RTMP Info - Host Only) */}
        {isHost && showSettings && (
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl shrink-0 space-y-3 font-mono animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-[9px] font-black uppercase tracking-widest">
                <Radio size={12} className="text-red-500" /> RTMP Configuration
              </div>
              <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-950/50 rounded-xl p-3 border border-white/5 flex items-center justify-between group">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Server URL</p>
                  <p className="text-xs text-slate-300 truncate">{`rtmp://${window.location.hostname}:1935/live`}</p>
                </div>
                <button onClick={() => copyText(`rtmp://${window.location.hostname}:1935/live`, setCopiedServer)}
                  className="p-2 text-slate-500 hover:text-white transition-colors">
                  {copiedServer ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="bg-slate-950/50 rounded-xl p-3 border border-white/5 flex items-center justify-between group">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Stream Key</p>
                  <p className="text-xs text-slate-300 truncate">{streamId}</p>
                </div>
                <button onClick={() => copyText(streamId, setCopiedKey)}
                  className="p-2 text-slate-500 hover:text-white transition-colors">
                  {copiedKey ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Sidebar: Clean Neutral Style */}
      <div className="flex flex-col w-full xl:w-[380px] bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10 font-sans">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-black text-slate-900 dark:text-white tracking-[0.15em] text-[10px] uppercase">Live Chat</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">{messages.length + 12}</span>
          </div>
        </div>

        <div className="px-5 pt-4 pb-2 shrink-0">
          <p className="text-[9px] font-bold text-slate-400 dark:text-white/20 uppercase tracking-tight italic">Welcome to the void. Be kind and keep it kinetic.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2.5 min-h-0 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 items-baseline p-1.5 rounded-xl transition-all animate-in fade-in duration-300 ${msg.username === streamerName ? 'bg-indigo-500/5 ring-1 ring-indigo-500/10 my-1' : ''}`}>
               <span className={`text-sm font-black tracking-tight shrink-0 ${msg.username === streamerName ? 'text-indigo-600 dark:text-fuchsia-400' : getUserColor(msg.username)}`}>
                 {msg.username}:
               </span>
               <span className="text-base font-semibold leading-relaxed break-words text-slate-700 dark:text-white/90">
                 {msg.message}
               </span>
               <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-auto shrink-0">{formatTimeAgo(msg.time)}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5 shrink-0">
          <form className="relative" onSubmit={sendMessage}>
            <input type="text" value={inputText} onChange={e => setInputText(e.target.value)}
              placeholder={streamEnded ? 'Offline' : 'Send a message...'} disabled={streamEnded}
              className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-4 pr-10 text-sm focus:outline-none focus:border-indigo-500/30 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 transition-all font-medium" />
            <button type="submit" disabled={streamEnded || !inputText.trim()}
              className="absolute right-2 top-2.5 text-indigo-600 dark:text-fuchsia-500 hover:opacity-80 disabled:opacity-10 transition-all">
              <Send size={18} strokeWidth={2} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Stream;
