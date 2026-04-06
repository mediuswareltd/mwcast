import React from 'react';
import { Users, Eye, Play, MoreVertical } from 'lucide-react';
import { Link } from 'react-router-dom';

const LiveStreamCard = ({ title, streamer, viewerCount, category, thumbnail, avatar, isLive = true }) => {
  return (
    <Link 
      to={`/@${streamer}`}
      className="group relative flex flex-col gap-3 p-1 rounded-2xl transition-all hover:bg-slate-100 dark:hover:bg-white/5 active:scale-[0.98] cursor-pointer"
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 shadow-lg dark:shadow-xl dark:shadow-black/40">
        <img 
          src={thumbnail} 
          alt={title} 
          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" 
        />
        
        {/* Overlay Badges */}
        {isLive && (
          <div className="absolute top-3 left-3 bg-red-600 px-2.5 py-1 rounded-md flex items-center gap-1.5 backdrop-blur-sm shadow-md animate-in fade-in slide-in-from-left-4">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-glow"></span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-white drop-shadow-sm">Live</span>
          </div>
        )}
        
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 shadow-lg group-hover:bg-indigo-600/80 transition-colors">
          <Eye size={12} className="text-indigo-400 group-hover:text-white" />
          <span className="text-[10px] font-bold text-white tracking-wide">{viewerCount}</span>
        </div>

        {/* Hover Play Button */}
        <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/20 transform scale-75 group-hover:scale-100 transition-transform duration-300 shadow-2xl">
            <Play fill="white" className="text-white w-5 h-5 ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info Area */}
      <div className="flex gap-3 px-1">
        <div onClick={(e) => e.preventDefault()} className="shrink-0 relative h-10 w-10">
          <img 
            src={avatar} 
            alt={streamer} 
            className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 object-cover shadow-inner bg-slate-100 dark:bg-slate-700" 
          />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-tight mb-0.5">
            {title}
          </h4>
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 truncate hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            {streamer}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md transition-colors border border-slate-200 dark:border-white/5 cursor-pointer">
              {category}
            </span>
          </div>
        </div>
        <button 
          onClick={(e) => {e.preventDefault(); e.stopPropagation();}}
          className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors h-fit p-1 rounded-full hover:bg-slate-200 dark:hover:bg-white/5 self-start"
        >
          <MoreVertical size={16} />
        </button>
      </div>
    </Link>


  );
};

export default LiveStreamCard;
