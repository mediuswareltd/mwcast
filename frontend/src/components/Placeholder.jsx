import React from 'react';

const Placeholder = ({ title, description }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-slate-50 dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-200 dark:border-white/5 mx-auto max-w-4xl animate-in fade-in duration-700">
      <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
      </div>
      <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight uppercase italic underline decoration-indigo-500 decoration-4 underline-offset-8">
        {title}
      </h2>
      <p className="mt-6 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs max-w-xs mx-auto leading-relaxed">
        {description}
      </p>
    </div>
  );
};

export default Placeholder;
