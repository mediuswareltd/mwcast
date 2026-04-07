import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { MessageCircle, Send, Heart, Shield, Copy, Check, Mic, MicOff, Camera, CameraOff, Monitor, MonitorOff, Square, Radio } from 'lucide-react';
import JoinStreamModal from '../components/JoinStreamModal';
import LivePlayer from '../components/LivePlayer';
import { API_BASE_URL, WS_CHAT_URL, HLS_URL } from '../config';
import { useWhipPublisher } from '../hooks/useWhipPublisher';

const Stream = () => {
  const { username: streamerName } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isHost = searchParams.get('host') === 'true';
  const streamId = searchParams.get('id');
  const initialTitle = searchParams.get('title') || "Live Stream";

  const [guestName, setGuestName] = useState(() => {
    if (isHost) return streamerName;
    return sessionStorage.getItem('mwcast_nickname');
  });
  
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(!isHost && !sessionStorage.getItem('mwcast_nickname'));
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  
  // Load chat history when streamId is available
  useEffect(() => {
    if (streamId) {
      const saved = sessionStorage.getItem(`mwcast_chat_${streamId}`);
      if (saved) setMessages(JSON.parse(saved));
    }
  }, [streamId]);
  const [isLiked, setIsLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedServer, setCopiedServer] = useState(false);
  const [streamData, setStreamData] = useState(null);
  
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [publishState, setPublishState] = useState('idle');
  const [audioOnly, setAudioOnly] = useState(false);
  const [hlsReady, setHlsReady] = useState(false);
  // Host controls
  const [micOn, setMicOn]           = useState(true);
  const [camOn, setCamOn]           = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const { publish, stop: stopPublisher, pcRef } = useWhipPublisher();
  const localMedia = useRef(null); // camera/mic stream
  const pipRef     = useRef(null); // PiP video element
  const wsRef      = useRef(null);
  const chatEndRef = useRef(null);
  const hlsPollRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Host: grab the media stream published from the modal
  useEffect(() => {
    if (!isHost) return;
    if (window.__mwcast_stream) {
      localMedia.current = window.__mwcast_stream;
    }
    // Optimistically mark as publishing — modal already confirmed HLS is ready
    setPublishState('publishing');

    // Keep polling as a safety net for external sources (OBS/ffmpeg)
    hlsPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(HLS_URL(streamId));
        if (res.ok) {
          setPublishState('publishing');
          clearInterval(hlsPollRef.current);
          hlsPollRef.current = null;
        }
      } catch (_) {}
    }, 3000);

    return () => {
      stopPublisher();
      if (hlsPollRef.current) {
        clearInterval(hlsPollRef.current);
        hlsPollRef.current = null;
      }
    };
  }, [isHost, streamId]);

  // Viewer: fetch join data
  useEffect(() => {
    if (isHost || !streamId) return;
    fetch(`${API_BASE_URL}/api/v1/streams/${streamId}/join`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStreamData(data.data);
          if (!streamerName || streamerName === 'undefined') {
            window.history.replaceState(
              null, '',
              `/s/${data.data.username}?id=${streamId}&title=${encodeURIComponent(data.data.title)}`
            );
          }
        }
      });
  }, [isHost, streamId]);

  // Viewer: continuously poll HLS — handles initial ready + stream restarts
  useEffect(() => {
    if (isHost || !streamId) return;
    let wasReady = false;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(HLS_URL(streamId));
        if (res.ok) {
          if (!wasReady) {
            // First time ready
            setHlsReady(true);
            wasReady = true;
          }
        } else if (wasReady) {
          // Was ready but now 404 — stream restarted, reset player
          setHlsReady(false);
          wasReady = false;
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(poll);
  }, [isHost, streamId]);

  // Viewer: poll stream status to detect when host stops
  useEffect(() => {
    if (isHost || !streamId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/streams/${streamId}`);
        const data = await res.json();
        if (data.success && data.data.status !== 'live') {
          setStreamEnded(true);
          clearInterval(interval);
        }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [isHost, streamId]);
  useEffect(() => {
    if (!streamId || !guestName) return;

    const wsUrl = `${WS_CHAT_URL}/${streamId}?username=${encodeURIComponent(guestName)}`;
    const socket = new WebSocket(wsUrl);
    let cancelled = false;
    wsRef.current = socket;

    socket.onmessage = (event) => {
      if (cancelled) return;
      const data = JSON.parse(event.data);
      setMessages(prev => {
        const next = [...prev, data].slice(-50);
        sessionStorage.setItem(`mwcast_chat_${streamId}`, JSON.stringify(next));
        return next;
      });
    };

    socket.onclose = () => {
      if (cancelled) return;
      if (!isHost) {
        fetch(`${API_BASE_URL}/api/v1/streams/${streamId}`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.data.status !== 'live') setStreamEnded(true);
          })
          .catch(() => setStreamEnded(true));
      }
    };

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [streamId, guestName]);

  const handleJoin = (name) => {
    sessionStorage.setItem('mwcast_nickname', name);
    setGuestName(name);
    setIsJoinModalOpen(false);
  };

  const handleStop = async () => {
    setIsStopping(true);
    stopPublisher();
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/streams/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: streamId })
      });

      if (response.ok) {
        navigate('/');
      } else {
        const err = await response.json();
        alert("Failed to stop stream: " + (err.error?.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Error stopping stream:", err);
      alert("Network error while stopping stream.");
    } finally {
      setIsStopping(false);
      setIsStopModalOpen(false);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !wsRef.current) return;

    const msg = { message: inputText };
    wsRef.current.send(JSON.stringify(msg));
    setInputText("");
  };

  const copyText = (text, setCopiedFn) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedFn(true);
    setTimeout(() => setCopiedFn(false), 2000);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/s/${streamerName}?id=${streamId}`;
    copyText(url, setCopied);
  };

  // Host controls
  const toggleMic = () => {
    localMedia.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(v => !v);
  };

  const toggleCam = () => {
    localMedia.current?.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(v => !v);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen share — reconnect with camera
      stopPublisher();
      const camStream = localMedia.current;
      if (camStream && streamId) {
        try {
          const pc = await publish(streamId, camStream);
          window.__mwcast_pc = pc;
        } catch (_) {}
      }
      setScreenSharing(false);
    } else {
      try {
        // Get screen video
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Combine screen video with existing mic audio
        const audioTrack = localMedia.current?.getAudioTracks()[0];
        const publishStream = new MediaStream([
          screenTrack,
          ...(audioTrack ? [audioTrack] : []),
        ]);

        // Stop current WHIP and reconnect with screen stream
        stopPublisher();
        const pc = await publish(streamId, publishStream);
        window.__mwcast_pc = pc;

        // Show camera PiP
        if (pipRef.current && localMedia.current) pipRef.current.srcObject = localMedia.current;
        setScreenSharing(true);

        // Auto-stop when user clicks browser's "Stop sharing"
        screenTrack.addEventListener('ended', async () => {
          stopPublisher();
          const camStream = localMedia.current;
          if (camStream && streamId) {
            try {
              const pc = await publish(streamId, camStream);
              window.__mwcast_pc = pc;
            } catch (_) {}
          }
          setScreenSharing(false);
        });
      } catch (_) {} // user cancelled picker
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-4 max-w-[2000px] mx-auto transition-colors duration-300 xl:h-[calc(100vh-96px)]">
      <JoinStreamModal isOpen={isJoinModalOpen} onJoin={handleJoin} />

      {/* Stop Stream Confirmation Modal */}
      {isStopModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-in zoom-in-95 duration-200">
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
              <button
                onClick={() => setIsStopModalOpen(false)}
                disabled={isStopping}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg disabled:opacity-60"
              >
                {isStopping ? "Stopping..." : "Yes, Stop Stream"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content Area */}
      <div className="flex flex-col flex-1 gap-3 min-h-0 min-w-0">
        
        {/* Video Player Section — capped so channel info always fits */}
        <div className="relative bg-black rounded-2xl overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 shadow-2xl border-2 border-slate-100 dark:border-slate-900/40 transition-colors w-full aspect-video xl:aspect-auto xl:flex-1 xl:min-h-0">
           {isHost ? (
             <div className="w-full h-full relative bg-slate-900">
                {publishState === 'publishing' ? (
                  <>
                    <LivePlayer src={HLS_URL(streamId)} className="w-full h-full" />
                    {/* PiP self-view during screen share */}
                    {screenSharing && (
                      <video ref={pipRef} autoPlay muted playsInline disablePictureInPicture
                        className="absolute bottom-3 right-3 w-32 aspect-video object-cover rounded-xl border-2 border-white/20 shadow-2xl mirror pointer-events-none z-10" />
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
                    <img src="https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=1200"
                      className="absolute inset-0 w-full h-full object-cover opacity-20 blur-md" alt="" />
                    <div className="relative z-10 flex flex-col items-center text-center px-6">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                        <Camera size={32} className="opacity-40" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-[0.2em]">Connecting stream...</span>
                    </div>
                  </div>
                )}
             </div>
           ) : (
             <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white gap-4">
                {streamEnded ? (
                   <div className="flex flex-col items-center gap-3 text-center px-8">
                      <div className="w-14 h-14 bg-slate-700 rounded-full flex items-center justify-center">
                         <Square size={24} className="text-slate-400" fill="currentColor" />
                      </div>
                      <span className="text-base font-black uppercase tracking-widest text-slate-300">Stream Ended</span>
                      <p className="text-xs text-slate-500 font-medium">The host has stopped the broadcast.</p>
                      <button
                        onClick={() => navigate('/')}
                        className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
                      >
                        Back to Home
                      </button>
                   </div>
                ) : streamData && hlsReady ? (
                   <LivePlayer src={streamData.hls_url} stopped={streamEnded} className="w-full h-full" />
                ) : (
                   <div className="animate-pulse flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center">
                         <div className="w-6 h-6 bg-indigo-500 rounded-full animate-ping"></div>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        {streamData ? 'Waiting for stream...' : 'Connecting to stream...'}
                      </span>
                   </div>
                )}
             </div>
           )}

           {/* Overlays — only show when NOT playing LivePlayer (which has its own badges) */}
           {!(isHost && publishState === 'publishing') && !(!isHost && (streamData || streamEnded)) && (
           <div className="absolute top-4 left-4 flex items-center gap-2">
              <div className="bg-red-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg animate-pulse ring-2 ring-white/10">Live</div>
              {isHost && (
                <div className="bg-emerald-500 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-1.5">
                   <Shield size={12} />
                   Host Mode
                </div>
              )}
              {isHost && publishState === 'error' && (
                <div className="bg-amber-500 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
                  No Camera — Sim Mode
                </div>
              )}
           </div>
           )}
           {/* Host mode badge always visible */}
           {isHost && (
             <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
               <div className="bg-emerald-500 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-1.5">
                 <Shield size={12} />
                 Host Mode
               </div>
             </div>
           )}
        </div>

        {/* Host controls bar — outside player so LivePlayer controls are unobstructed */}
        {isHost && publishState === 'publishing' && (
          <div className="flex items-center justify-center flex-wrap gap-2 bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-700 shrink-0">
            <button onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${micOn ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-red-600 border-red-600 text-white'}`}>
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
              <span className="hidden sm:inline">{micOn ? 'Mute' : 'Unmuted'}</span>
            </button>
            <button onClick={toggleCam} title={camOn ? 'Camera off' : 'Camera on'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${camOn ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-red-600 border-red-600 text-white'}`}>
              {camOn ? <Camera size={13} /> : <CameraOff size={13} />}
              <span className="hidden sm:inline">{camOn ? 'Cam On' : 'Cam Off'}</span>
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

        {/* Channel Info Section */}
        <div className="flex flex-row items-center justify-between gap-2 bg-white dark:bg-slate-900/40 px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5 shadow-xl transition-colors shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
               <img 
                 src={`https://api.dicebear.com/7.x/initials/svg?seed=${streamerName}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`} 
                 alt={streamerName} 
                 className="w-10 h-10 rounded-xl ring-4 ring-indigo-500/10 dark:ring-indigo-500/20 shadow-xl bg-white dark:bg-slate-800" 
               />
               <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-800 dark:text-white tracking-tight truncate">@{streamData?.username || streamerName}</h2>
              <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs tracking-wide truncate">{streamData?.title || initialTitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {isHost && (
              <button
                onClick={() => setIsStopModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl bg-red-600 hover:bg-red-500 text-white active:scale-95"
              >
                <Square size={12} fill="currentColor" />
                <span className="hidden sm:inline">Stop Stream</span>
                <span className="sm:hidden">Stop</span>
              </button>
            )}
            <button 
              onClick={copyLink}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl ${copied ? 'bg-emerald-500 text-white scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
            </button>
            <button 
              onClick={() => setIsLiked(!isLiked)}
              className={`p-2 rounded-xl transition-all active:scale-90 shadow-xl ${isLiked ? 'bg-pink-500/20 text-pink-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
            >
              <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* RTMP Stream Info — host only */}
        {isHost && (
          <div className="bg-slate-900 px-5 py-4 rounded-2xl border border-slate-700 shadow-xl shrink-0 space-y-3">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <Radio size={12} className="text-red-400" />
              Stream Settings
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between gap-3 bg-slate-800 rounded-xl px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Server URL</p>
                  <p className="text-xs font-mono text-slate-200 truncate">{`rtmp://${window.location.hostname}:1935/live`}</p>
                </div>
                <button
                  onClick={() => copyText(`rtmp://${window.location.hostname}:1935/live`, setCopiedServer)}
                  className="shrink-0 text-slate-400 hover:text-white transition-colors p-1"
                >
                  {copiedServer ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 bg-slate-800 rounded-xl px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">Stream Key</p>
                  <p className="text-xs font-mono text-slate-200 truncate">{streamId}</p>
                </div>
                <button
                  onClick={() => copyText(streamId, setCopiedKey)}
                  className="shrink-0 text-slate-400 hover:text-white transition-colors p-1"
                >
                  {copiedKey ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Sidebar — pinned full height on xl, fixed height on mobile */}
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
               <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${msg.username}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`} className="w-7 h-7 rounded-lg bg-white shadow-sm shrink-0 border border-slate-100 dark:border-white/5" alt="" />
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
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={streamEnded ? "Stream has ended" : "Send a message..."} 
              disabled={streamEnded}
              className={`w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-500 transition-all font-medium shadow-inner ${streamEnded ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button 
               type="submit"
               disabled={streamEnded}
               className={`absolute right-2 top-1.5 h-9 w-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90 ${streamEnded ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Stream;
