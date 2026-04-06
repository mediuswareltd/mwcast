import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, X, Mic, MicOff, Camera, CameraOff, Play, Loader, Radio } from 'lucide-react';
import { API_BASE_URL, HLS_URL } from '../config';
import { useWhipPublisher } from '../hooks/useWhipPublisher';

const slugify = (s) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const buildAudioWithBlackVideo = (audioTrack) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const fill = () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 720); };
  fill();
  const iv = setInterval(fill, 1000 / 25);
  const vt = canvas.captureStream(25).getVideoTracks()[0];
  vt.addEventListener('ended', () => clearInterval(iv));
  return new MediaStream([vt, audioTrack]);
};

export default function GoLiveModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { publish, stop: stopWhip } = useWhipPublisher();

  const [step, setStep]         = useState('setup'); // setup | connecting | ready
  const [title, setTitle]       = useState('');
  const [username, setUsername] = useState('');
  const [error, setError]       = useState(null);
  const [streamId, setStreamId] = useState(null);
  const [micOn, setMicOn]       = useState(true);
  const [camOn, setCamOn]       = useState(true);

  const videoRef  = useRef(null);
  const mediaRef  = useRef(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('setup'); setTitle(''); setUsername('');
      setError(null); setStreamId(null);
      setMicOn(true); setCamOn(true);
    } else {
      stopMediaTracks();
    }
  }, [isOpen]);

  // Start camera preview
  useEffect(() => {
    if (!isOpen || step !== 'setup') return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(s => { mediaRef.current = s; if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => {
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
          .then(s => { mediaRef.current = s; setCamOn(false); })
          .catch(() => setCamOn(false));
      });
    // No cleanup here — tracks must stay alive for WHIP publishing
  }, [isOpen, step]);

  const stopMediaTracks = () => {
    mediaRef.current?.getTracks().forEach(t => t.stop());
    mediaRef.current = null;
  };

  // Toggle mic/cam in preview
  const toggleMic = () => {
    mediaRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
    setMicOn(v => !v);
  };
  const toggleCam = () => {
    mediaRef.current?.getVideoTracks().forEach(t => { t.enabled = !camOn; });
    setCamOn(v => !v);
  };

  const pollHlsReady = (id) => new Promise(resolve => {
    const iv = setInterval(async () => {
      try { const r = await fetch(HLS_URL(id)); if (r.ok) { clearInterval(iv); resolve(); } } catch (_) {}
    }, 2000);
  });

  const handleGoLive = async () => {
    if (!title.trim() || !username.trim()) { setError('Please enter a title and display name.'); return; }
    setError(null);
    setStep('connecting');
    try {
      // 1. Create stream
      const res = await fetch(`${API_BASE_URL}/api/v1/streams/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_name: username, title }),
      });
      if (!res.ok) throw new Error('Failed to create stream');
      const { data } = await res.json();
      const id = data.stream_id;
      setStreamId(id);

      // 2. Build publish stream from existing preview media
      let publishStream;
      if (mediaRef.current) {
        const videoTracks = mediaRef.current.getVideoTracks();
        const audioTracks = mediaRef.current.getAudioTracks();
        if (videoTracks.length > 0) {
          publishStream = mediaRef.current;
        } else if (audioTracks.length > 0) {
          publishStream = buildAudioWithBlackVideo(audioTracks[0]);
        }
      }

      if (publishStream) {
        const pc = await publish(id, publishStream);
        // Expose stream + pc for host controls in Stream page
        window.__mwcast_stream = publishStream;
        window.__mwcast_pc = pc;
      }

      // 3. Wait for HLS
      await pollHlsReady(id);
      setStep('ready');
    } catch (err) {
      setError(err.message);
      setStep('setup');
      stopWhip();
    }
  };

  const handleEnterStream = () => {
    navigate(`/s/${slugify(username)}?host=true&id=${streamId}&title=${encodeURIComponent(title)}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
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

          {/* SETUP */}
          {step === 'setup' && (
            <form onSubmit={e => { e.preventDefault(); handleGoLive(); }} className="space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-2xl text-xs font-bold">{error}</div>}

              {/* Camera preview */}
              <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden">
                {camOn && mediaRef.current?.getVideoTracks().length > 0
                  ? <video ref={videoRef} autoPlay muted playsInline disablePictureInPicture className="w-full h-full object-cover mirror" />
                  : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <Camera size={32} className="text-slate-600" />
                      <p className="text-slate-500 text-xs font-medium">{camOn ? 'No camera detected' : 'Camera off'}</p>
                    </div>
                }
                {/* Mic / Cam toggles */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                  <button type="button" onClick={toggleMic}
                    className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${micOn ? 'bg-white/10 border-white/20 text-white' : 'bg-red-600 border-red-600 text-white'}`}>
                    {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                  </button>
                  <button type="button" onClick={toggleCam}
                    className={`p-2.5 rounded-xl backdrop-blur-md border transition-all ${camOn ? 'bg-white/10 border-white/20 text-white' : 'bg-red-600 border-red-600 text-white'}`}>
                    {camOn ? <Camera size={16} /> : <CameraOff size={16} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stream Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Morning Session"
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-3 px-4 text-sm font-medium dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Display Name</label>
                  <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. Subal Roy"
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-3 px-4 text-sm font-medium dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
                </div>
              </div>

              <button type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                <Play size={14} fill="currentColor" /> Go Live
              </button>
            </form>
          )}

          {/* CONNECTING */}
          {step === 'connecting' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Loader size={28} className="text-indigo-400 animate-spin" />
              </div>
              <p className="font-black text-slate-800 dark:text-white text-sm uppercase tracking-widest">Setting up stream...</p>
              <p className="text-xs text-slate-400 font-medium">Waiting for HLS pipeline to be ready</p>
            </div>
          )}

          {/* READY */}
          {step === 'ready' && (
            <div className="py-8 flex flex-col items-center gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
                  <Radio size={28} className="text-green-500" />
                </div>
                <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md animate-pulse">Live</div>
              </div>
              <div className="text-center">
                <p className="font-black text-slate-800 dark:text-white text-lg">You're Live!</p>
                <p className="text-xs text-slate-400 font-medium mt-1">Viewers can join now</p>
              </div>
              <button onClick={handleEnterStream}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                <Play size={14} fill="currentColor" /> Enter Stream
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
