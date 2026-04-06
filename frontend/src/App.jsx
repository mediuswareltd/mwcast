import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import Stream from './pages/Stream';
import Explore from './pages/Explore';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <Router>
      <MainLayout isDarkMode={isDarkMode} toggleTheme={toggleTheme}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/s/:username" element={<Stream />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/following" element={<div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-bold text-xl bg-slate-100 dark:bg-slate-900/40 rounded-3xl border border-white/5 mx-auto max-w-4xl animate-pulse">Your following list will appear here</div>} />
          <Route path="/browse" element={<div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-bold text-xl bg-slate-100 dark:bg-slate-900/40 rounded-3xl border border-white/5 mx-auto max-w-4xl animate-pulse">Browse all categories</div>} />
          <Route path="/settings" element={<div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-bold text-xl bg-slate-100 dark:bg-slate-900/40 rounded-3xl border border-white/5 mx-auto max-w-4xl animate-pulse">User Settings</div>} />
          <Route path="*" element={<div className="flex items-center justify-center min-h-[50vh] text-slate-500 font-bold text-xl bg-slate-100 dark:bg-slate-900/40 rounded-3xl border border-white/5 mx-auto max-w-4xl">404 - Page not found</div>} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;
