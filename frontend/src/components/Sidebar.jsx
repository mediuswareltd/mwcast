import React from 'react';
import { Home, Tv, Radio, Users, Settings, LogOut, ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const SidebarLink = ({ to, icon: Icon, children }) => {
  return (
    <NavLink 
      to={to} 
      className={({ isActive }) => `
        flex items-center gap-3 px-4 py-3 rounded-xl transition-all group
        ${isActive ? 'bg-indigo-600/10 text-indigo-400 font-semibold' : 'text-slate-400 hover:bg-white/5 hover:text-white'}
      `}
    >
      <Icon size={20} className="shrink-0 transition-transform group-hover:scale-110" />
      <span className="text-sm font-medium">{children}</span>
    </NavLink>
  );
};

const Sidebar = () => {
  return (
    <aside className="fixed left-0 top-[64px] h-[calc(100vh-64px)] w-64 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-white/5 p-4 hidden lg:flex flex-col gap-6 overflow-y-auto transition-colors duration-300">
      <div className="flex flex-col gap-1.5">
        <h3 className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Discovery</h3>
        <SidebarLink to="/" icon={Home}>Home</SidebarLink>
        <SidebarLink to="/following" icon={Users}>Following</SidebarLink>
        <SidebarLink to="/browse" icon={Tv}>Browse</SidebarLink>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3">Top Streamers</h3>
        {[
          { name: 'Alex Rivera', category: 'Rust Development', avatar: 'https://i.pravatar.cc/150?u=alex' },
          { name: 'Sarah Chen', category: 'Competitive Coding', avatar: 'https://i.pravatar.cc/150?u=sarah' },
          { name: 'Marcus Nova', category: 'Web3 Design', avatar: 'https://i.pravatar.cc/150?u=marcus' },
        ].map((streamer, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer group">
            <div className="relative shrink-0">
              <img src={streamer.avatar} alt={streamer.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-transparent group-hover:ring-indigo-500/30 transition-all shadow-md shadow-black/20" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse"></div>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{streamer.name}</span>
              <span className="text-[11px] text-slate-500 truncate">{streamer.category}</span>
            </div>
          </div>
        ))}
        <button className="flex items-center gap-2 px-4 py-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 text-xs font-semibold group transition-all">
          <span>Show More</span>
          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <SidebarLink to="/settings" icon={Settings}>Settings</SidebarLink>
        <button className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-red-500 hover:bg-red-500/10 mb-4 group font-medium">
          <LogOut size={20} className="shrink-0 transition-transform group-hover:scale-110" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
