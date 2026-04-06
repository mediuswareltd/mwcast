import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Clock, Users, Play, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../config';

const StreamCard = ({ stream, onJoin }) => {
  const isLive = stream.status === 'live';
  const date = new Date(stream.created_at);
  const timeAgo = (() => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  })();

  return (
    <div className="group bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-slate-900 overflow-hidden">
        <img
          src={`https://api.dicebear.com/7.x/initials/svg?seed=${stream.host_name}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-lg scale-110"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${stream.host_name}&backgroundColor=6366f1,ec4899,8b5cf6,06b6d4`}
              alt={stream.host_id}
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Status badge */}
        <div className="absolute top-3 left-3">
          {isLive ? (
            <span className="flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shadow-lg">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-slate-700/80 backdrop-blur text-slate-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">
              <Clock size={10} />
              Ended
            </span>
          )}
        </div>

        {/* Play overlay on hover — only for live */}
        {isLive && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
            <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-full flex items-center justify-center border border-white/30">
              <Play size={22} className="text-white" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-black text-slate-800 dark:text-white text-sm leading-tight line-clamp-1">{stream.title}</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">@{stream.host_name}</p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
            <Clock size={10} />
            {timeAgo}
          </span>

          {isLive ? (
            <button
              onClick={() => onJoin(stream)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              <Users size={10} />
              Join Stream
            </button>
          ) : (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Offline</span>
          )}
        </div>
      </div>
    </div>
  );
};

const Explore = () => {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const fetchStreams = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/streams`);
      const data = await res.json();
      if (data.success) setStreams(data.data);
    } catch (_) {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(() => fetchStreams(), 15000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = (stream) => {
    const slug = stream.host_name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    navigate(`/s/${slug}?id=${stream.id}&title=${encodeURIComponent(stream.title)}`);
  };

  const live = streams.filter(s => s.status === 'live');
  const past = streams.filter(s => s.status !== 'live');

  return (
    <div className="max-w-6xl mx-auto space-y-10 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Explore Streams</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Join a live stream or catch up on past broadcasts</p>
        </div>
        <button
          onClick={() => fetchStreams(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all ${refreshing ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-video bg-slate-200 dark:bg-slate-700" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Live now */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-red-500" />
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Live Now</h2>
              {live.length > 0 && (
                <span className="bg-red-500/10 text-red-500 text-[10px] font-black px-2 py-0.5 rounded-full">{live.length}</span>
              )}
            </div>
            {live.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-white/5">
                <Radio size={32} strokeWidth={1.5} />
                <p className="text-sm font-bold">No streams live right now</p>
                <p className="text-xs">Check back soon or start your own</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {live.map(s => <StreamCard key={s.id} stream={s} onJoin={handleJoin} />)}
              </div>
            )}
          </section>

          {/* Past streams */}
          {past.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Past Streams</h2>
                <span className="bg-slate-200 dark:bg-slate-700 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full">{past.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {past.map(s => <StreamCard key={s.id} stream={s} onJoin={handleJoin} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default Explore;
