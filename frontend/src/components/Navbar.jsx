import { Camera, Search, User, Bell, Sun, Moon, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = ({ isDarkMode, toggleTheme }) => {
  const { user, logout, isAuthModalOpen, openAuthModal, closeAuthModal } = useAuth();

  return (
    <nav className="fixed top-0 z-50 w-full bg-[var(--surface)]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 px-6 py-3 flex items-center justify-between transition-all duration-500">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 group shrink-0">
        <div className="bg-indigo-600 p-1.5 rounded-lg group-hover:bg-indigo-500 transition-colors">
          <Camera className="text-white w-6 h-6" />
        </div>
        <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-600 dark:from-indigo-400 to-pink-500 dark:to-pink-400 bg-clip-text text-transparent transition-all">
          MW Cast
        </span>
      </Link>

      {/* Navigation Links */}
      <div className="hidden lg:flex items-center gap-6 ml-8">
        {[
          { name: 'Explore', path: '/explore' },
          { name: 'Following', path: '/following' },
          { name: 'Browse', path: '/browse' }
        ].map((link) => (
          <Link 
            key={link.path}
            to={link.path}
            className="text-sm font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {link.name}
          </Link>
        ))}
      </div>

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

        {user ? (
          <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-white/10 ml-2">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-xs font-bold dark:text-white leading-tight">{user.display_name}</span>
              <span className="text-[10px] text-slate-500 font-medium leading-tight">Host Account</span>
            </div>
            <div className="relative group">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-indigo-600 dark:text-indigo-400" />
                )}
              </div>
              
              {/* Dropdown menu */}
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <button 
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-500/5 rounded-xl transition-colors font-bold"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button 
            onClick={openAuthModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-full text-sm transition-all shadow-lg shadow-indigo-600/20 active:scale-95 whitespace-nowrap"
          >
            <User size={18} />
            <span>Login</span>
          </button>
        )}
      </div>

    </nav>
  );
};

export default Navbar;
