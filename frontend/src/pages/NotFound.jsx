import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="relative">
        <h1 className="text-[12rem] font-black text-slate-100 dark:text-white/5 leading-none select-none">404</h1>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tighter uppercase italic">Lost in space?</h2>
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs mt-2">The page you're looking for doesn't exist.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-12">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all active:scale-95 border border-slate-200 dark:border-white/5"
        >
          <ArrowLeft size={16} />
          Go Back
        </button>
        <button 
          onClick={() => navigate('/')}
          className="flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95"
        >
          <Home size={16} />
          Back Home
        </button>
      </div>
    </div>
  );
};

export default NotFound;
