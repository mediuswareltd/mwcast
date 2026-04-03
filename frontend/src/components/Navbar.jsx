import { Camera, Search, User, Bell, Sun, Moon } from 'lucide-react';
import { Link } from 'react-router-dom';

const Navbar = ({ isDarkMode, toggleTheme }) => {
  return (
    <nav className="fixed top-0 z-50 w-full bg-[var(--surface)]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 px-6 py-3 flex items-center justify-between transition-all duration-500">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 group">
        <div className="bg-indigo-600 p-1.5 rounded-lg group-hover:bg-indigo-500 transition-colors">
          <Camera className="text-white w-6 h-6" />
        </div>
        <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-600 dark:from-indigo-400 to-pink-500 dark:to-pink-400 bg-clip-text text-transparent transition-all">
          MW Cast
        </span>
      </Link>

      {/* Search */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
        <div className="absolute left-3 text-slate-400">
          <Search size={18} />
        </div>
        <input 
          type="text" 
          placeholder="Search live streams..." 
          className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm placeholder:text-slate-500 dark:text-slate-200 shadow-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all active:scale-90 border border-slate-200 dark:border-white/10 shadow-sm"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button className="text-slate-400 hover:text-indigo-600 dark:hover:text-white transition-colors relative h-10 w-10 flex items-center justify-center">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-pink-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>
        </button>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-full text-sm transition-all shadow-lg shadow-indigo-600/20 active:scale-95 whitespace-nowrap">
          <User size={18} />
          <span>Login</span>
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
