import React, { useState } from 'react';
import { User, ArrowRight, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const JoinStreamModal = ({ isOpen, onJoin }) => {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nickname.trim().length < 2) {
      setError("Nickname must be at least 2 characters.");
      return;
    }
    onJoin(nickname.trim());
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
          >
            <div className="p-8 space-y-8 text-center">
              <div className="space-y-2">
                <div className="w-20 h-20 bg-indigo-600/10 dark:bg-indigo-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6 ring-1 ring-indigo-500/20">
                  <User size={40} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Join the Stream</h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium px-4">Choose a nickname to participate in the real-time chat.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Your Display Name</label>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                      <Sparkles size={18} />
                    </div>
                    <input 
                      autoFocus
                      value={nickname}
                      onChange={(e) => {setNickname(e.target.value); setError("");}}
                      placeholder="e.g. ChatExplorer"
                      className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-bold dark:text-white transition-all shadow-inner"
                    />
                  </div>
                  {error && <p className="text-xs text-pink-600 font-bold ml-1 animate-pulse">{error}</p>}
                </div>

                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                >
                  Enter Room
                  <ArrowRight size={16} />
                </button>
              </form>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border-t border-slate-200 dark:border-white/5 text-center">
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Public Guest Access</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default JoinStreamModal;
