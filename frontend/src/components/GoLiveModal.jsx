import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Video, X, Mic, MicOff, Camera, CameraOff, Play, Loader, Radio, Lock, User, ArrowRight } from 'lucide-react';
import { API_BASE_URL, HLS_URL } from '../config';
import { useWhipPublisher } from '../hooks/useWhipPublisher';
import { useAuth } from '../context/AuthContext';

const slugify = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

export default function GoLiveModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { publish, stop: stopWhip } = useWhipPublisher();
  const { user, authFetch, openAuthModal } = useAuth();

  const [step, setStep] = useState('setup');
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [streamId, setStreamId] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasCam, setHasCam] = useState(true);
  const [mediaReady, setMediaReady] = useState(false);

  const videoRef = useRef(null);
  const mediaRef = useRef(null);

  // Stable video ref callback
  const setVideoRef = useCallback((el) => {
    videoRef.current = el;
    if (el && mediaRef.current) el.srcObject = mediaRef.current;
  }, []);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('setup'); setTitle('');
      setError(null); setStreamId(null);
      setMicOn(true); setCamOn(true); setHasCam(true); setMediaReady(false);
    } else if (step !== 'ready') {
      stopMediaTracks();
    }
  }, [isOpen]);

  // Start camera preview
  useEffect(() => {
    if (!isOpen || step !== 'setup' || !user) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => {
        setHasCam(true);
        mediaRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setMediaReady(true);
      })
      .catch(() => {
        setHasCam(false);
        setCamOn(false);
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
          .then(s => { mediaRef.current = s; setMediaReady(true); })
          .catch(() => { setMediaReady(true); });
      });
  }, [isOpen, step, user]);

  const stopMediaTracks = () => {
    mediaRef.current?.getTracks().forEach(t => t.stop());
    mediaRef.current = null;
  };

  const toggleMic = () => {
    mediaRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(v => !v);
  };

  const toggleCam = () => {
    const next = !camOn;
    mediaRef.current?.getVideoTracks().forEach(t => { t.enabled = next; });
    setCamOn(next);
    if (next && videoRef.current && mediaRef.current) {
      videoRef.current.srcObject = mediaRef.current;
    }
  };

  const pollHlsReady = (id) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { clearInterval(iv); reject(new Error('HLS stream timed out. Check media server.')); }, 30000);
    const iv = setInterval(async () => {
      try { const r = await fetch(HLS_URL(id)); if (r.ok) { clearInterval(iv); clearTimeout(timeout); resolve(); } } catch (_) { }
    }, 2000);
  });

  const handleGoLive = async () => {
    if (!title.trim()) { setError('Please enter a title for your stream.'); return; }
    setError(null);
    setStep('connecting');
    try {
      const res = await authFetch(`${API_BASE_URL}/api/v1/streams/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to create stream');
      }
      const { data } = await res.json();
      const id = data.stream_id;
      setStreamId(id);

      const publishStream = mediaRef.current ?? null;
      if (publishStream) {
        const pc = await publish(id, publishStream);
        window.__mwcast_stream = publishStream;
        window.__mwcast_username = user.display_name;
        window.__mwcast_has_cam = hasCam;
        window.__mwcast_pc = pc;
      }

      await pollHlsReady(id);
      setStep('ready');
    } catch (err) {
      setError(err.message);
      setStep('setup');
      stopWhip();
    }
  };

  const handleEnterStream = () => {
    navigate(`/s/${slugify(user.display_name)}?host=true&id=${streamId}&title=${encodeURIComponent(title)}`);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10 animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-500/10 p-2 rounded-xl text-red-500"><Video size={20} /></div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-white">
                {step === 'setup' ? 'Go Live' : step === 'connecting' ? 'Starting...' : 'Ready!'}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                {step === 'setup' ? 'Set up your broadcast' : step === 'connecting' ? 'Connecting to server' : 'Your stream is live'}
              </p>
            </div>
          </div>
          {step !== 'connecting' && (
            <button onClick={() => { stopMediaTracks(); stopWhip(); onClose(); }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-400">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {!user ? (
            <div className="py-12 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Lock className="text-amber-500" size={28} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight">Authentication Required</h3>
                <p className="text-xs text-slate-500 font-medium mt-1 max-w-[280px]">
                  Sign in to your account to start broadcasting live on MW Cast.
                </p>
              </div>

              <button
                onClick={openAuthModal}
                className="w-full flex items-center justify-between p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all active:scale-95 group shadow-xl shadow-indigo-600/20"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-2 rounded-xl">
                    <User size={24} className="text-white" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest text-white">Log In to Continue</span>
                </div>
                <ArrowRight size={18} className="text-white group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            <>
              {step === 'setup' && (
                <form onSubmit={e => { e.preventDefault(); handleGoLive(); }} className="space-y-4">
                  {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-2xl text-xs font-bold text-center">{error}</div>}

                  <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-inner">
                    <video
                      ref={setVideoRef}
                      autoPlay muted playsInline disablePictureInPicture
                      className={`w-full h-full object-cover mirror ${camOn && mediaReady && hasCam ? '' : 'hidden'}`}
                    />
                    {(!camOn || !mediaReady || !hasCam) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <Camera size={32} className="text-slate-600" />
                        <p className="text-slate-500 text-xs font-medium">
                          {!mediaReady ? 'Requesting camera...' : !hasCam ? 'No camera detected' : 'Camera off'}
                        </p>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                      <button type="button" onClick={toggleMic}
                        className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${micOn ? 'bg-white/10 border-white/20 text-white' : 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20'}`}>
                        {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                      </button>
                      <button type="button" onClick={hasCam ? toggleCam : undefined} disabled={!hasCam}
                        className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${!hasCam ? 'opacity-40 cursor-not-allowed bg-slate-700 border-slate-600 text-slate-400' : camOn ? 'bg-white/10 border-white/20 text-white' : 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20'}`}>
                        {camOn ? <Camera size={16} /> : <CameraOff size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center">
                        <User size={18} className="text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Broadcasting as</p>
                        <p className="text-sm font-bold dark:text-white">{user.display_name}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Stream Title</label>
                      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What are you streaming today?"
                        className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-medium dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-sm" />
                    </div>
                  </div>

                  <button type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 mt-2">
                    <Play size={14} fill="currentColor" /> Start Broadcast
                  </button>
                </form>
              )}

              {step === 'connecting' && (
                <div className="py-12 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Loader size={28} className="text-indigo-400 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-800 dark:text-white text-sm uppercase tracking-widest">Warming up...</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-1">Connecting to low-latency edge servers</p>
                  </div>
                </div>
              )}

              {step === 'ready' && (
                <div className="py-8 flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-[2rem] bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center rotate-3">
                      <Radio size={32} className="text-green-500 -rotate-3" />
                    </div>
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-black px-2.5 py-1 rounded-lg animate-pulse shadow-lg shadow-red-600/20">LIVE</div>
                  </div>
                  <div className="text-center">
                    <h3 className="font-black text-slate-800 dark:text-white text-xl tracking-tight">Signal Acquired!</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">Your broadcast is now being distributed globally</p>
                  </div>
                  <button onClick={handleEnterStream}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                    <Play size={14} fill="currentColor" /> Enter Studio
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

