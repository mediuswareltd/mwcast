import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Video, X, Mic, Play, Info } from 'lucide-react';
import { API_BASE_URL } from '../config';

const GoLiveModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1);
  const [stream, setStream] = useState(null);
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen && step === 1) {
      startPreview();
    }
    return () => stopStream();
  }, [isOpen, step]);

  const startPreview = async () => {
    try {
      // First try to get both
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      setError(null);
    } catch (err) {
      console.warn("Full media access failed, trying audio only...", err);
      try {
        // Fallback: Try getting only audio since user has a mic
        const audioStream = await navigator.mediaDevices.getUserMedia({ 
          video: false, 
          audio: true 
        });
        setStream(audioStream);
        setError("Camera not detected, but Microphone is active. Using simulation for video.");
      } catch (audioErr) {
        console.warn("No camera/mic access:", audioErr);
        setError("No camera or microphone detected. Switching to full simulation mode.");
      }
    }
  };

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleStartLive = async () => {
    if (!title || !username) {
      setError("Please enter both a title and a username.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/streams/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           host_id: "00000000-0000-0000-0000-000000000000", 
           title: title 
        })
      });

      if (!response.ok) throw new Error("Failed to initialize stream on server");
      
      const resData = await response.json();
      const streamId = resData.data.stream_id;

      // Navigate to stream page using standard route /s/
      navigate(`/s/${username}?host=true&id=${streamId}&title=${encodeURIComponent(title)}`);
      onClose();
    } catch (err) {
      setError("Server error: " + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10 animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-red-500/10 p-2 rounded-xl text-red-500">
                <Video size={24} />
             </div>
             <div>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">Go Live Instantly</h2>
                <p className="text-xs text-slate-500 font-medium">Broadcast your vision to the world</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors text-slate-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {error && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold uppercase tracking-wide">
              <Info size={18} />
              {error}
            </div>
          )}
          {step === 1 ? (
          <div className="grid md:grid-cols-2 gap-8">
             {/* Left: Input */}
             <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Stream Title</label>
                  <input 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Test Stream"
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-medium dark:text-white transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-1">Nickname</label>
                  <input 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. dev_01"
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-medium dark:text-white transition-all shadow-sm"
                  />
                </div>
                <div className="pt-4">
                  <button 
                    onClick={handleStartLive}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                  >
                    <Play size={16} fill="currentColor" />
                    Start Broadcast
                  </button>
                </div>
             </div>

             {/* Right: Preview or Placeholder */}
             <div className="space-y-4">
                <div className="relative aspect-video bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden group shadow-inner">
                   {stream && stream.getVideoTracks().length > 0 ? (
                     <video 
                       ref={videoRef} 
                       autoPlay 
                       muted 
                       playsInline 
                       className="w-full h-full object-cover mirror grayscale-[0.2]"
                     />
                   ) : (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 gap-4">
                        <img 
                          src="https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=600" 
                          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-sm" 
                          alt=""
                        />
                        <div className="relative z-10 flex flex-col items-center text-center px-6">
                           <div className="w-16 h-16 bg-slate-200 dark:bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/5 shadow-md">
                              {stream && stream.getAudioTracks().length > 0 ? <Mic size={32} className="text-indigo-400" /> : <Camera size={32} className="opacity-40" />}
                           </div>
                           <span className="text-[10px] font-black uppercase tracking-[0.2em]">{stream && stream.getAudioTracks().length > 0 ? 'Audio Mode' : 'Simulation Mode'}</span>
                           <p className="text-[10px] opacity-60 mt-1 font-medium">{stream && stream.getAudioTracks().length > 0 ? 'Broadcasting with Mic' : 'Generic placeholder active'}</p>
                        </div>
                     </div>
                   )}
                   <div className="absolute bottom-3 left-3 flex gap-2">
                      <div className={`p-2 bg-black/60 backdrop-blur-md rounded-lg text-white ${stream?.getAudioTracks().length > 0 ? 'text-indigo-400' : 'opacity-50'}`}><Mic size={14} /></div>
                      <div className={`p-2 bg-black/60 backdrop-blur-md rounded-lg text-white ${stream?.getVideoTracks().length > 0 ? 'text-indigo-400' : 'opacity-50'}`}><Video size={14} /></div>
                   </div>
                </div>
             </div>
          </div>

          ) : (
            <div className="text-center py-12 space-y-6 animate-in zoom-in-95 fill-mode-both">
               <div className="relative inline-block">
                  <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center border-4 border-green-500/30 animate-pulse">
                     <Video size={40} className="text-green-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg uppercase tracking-widest">Live</div>
               </div>
               <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">You are now LIVE!</h3>
                  <p className="text-slate-500 font-medium max-w-sm mx-auto">Successfully connected to Media Server. Your audience can now see you at /{username}</p>
               </div>
               <div className="bg-slate-100 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-white/5 flex items-center justify-between gap-4 max-w-sm mx-auto">
                  <span className="text-xs font-mono text-slate-500 truncate">http://localhost:5173/@{username}</span>
                  <button className="text-indigo-600 dark:text-indigo-400 font-bold text-xs whitespace-nowrap">Copy Link</button>
               </div>
               <button 
                 onClick={onClose}
                 className="bg-slate-800 hover:bg-slate-700 text-white font-black px-8 py-3.5 rounded-2xl transition-all shadow-xl tracking-widest text-xs uppercase"
               >
                 Stop & Close
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoLiveModal;
