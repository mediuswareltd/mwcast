import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Sparkles, ArrowRight } from 'lucide-react';
import GoLiveModal from '../components/GoLiveModal';

const Home = () => {
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-12 transition-colors duration-300 px-4">
      <GoLiveModal isOpen={isLiveModalOpen} onClose={() => setIsLiveModalOpen(false)} />
      
      <div className="text-center space-y-6 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-xs font-bold uppercase tracking-widest border border-indigo-400/30 mx-auto">
          <Sparkles size={14} />
          <span>Next-Gen Streaming</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
          Broadcasting <span className="text-indigo-600 dark:text-indigo-400 italic">Simplified.</span>
        </h1>
        
        <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-xl mx-auto">
          Start a live stream directly from your browser in seconds. Secure authentication, zero complex software. Just you and your audience.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <button 
            onClick={() => setIsLiveModalOpen(true)}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-black px-10 py-5 rounded-2xl shadow-2xl shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
          >
            <Video size={24} />
            Start Streaming
          </button>
          
          <button 
            className="w-full sm:w-auto group flex items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold py-5 px-8 transition-colors"
            onClick={() => navigate('/explore')}
          >
            Explore Streams
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Feature Pills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl pt-12">
        {[
          { title: 'No Install', desc: 'Zero setup required. Broadcast directly from your browser.' },
          { title: 'Secure Auth', desc: 'Protect your channel with Google or email login.' },
          { title: 'Ultra Low Latency', desc: 'Engineered for real-time interaction with no delay.' }
        ].map((f, i) => (
          <div key={i} className="p-6 rounded-3xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 shadow-sm space-y-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{f.title}</h3>
            <p className="text-sm text-slate-500 font-medium">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
