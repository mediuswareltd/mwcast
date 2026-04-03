import React from 'react';
import Navbar from '../components/Navbar';

const MainLayout = ({ children, isDarkMode, toggleTheme }) => {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-indigo-500/30 selection:text-indigo-600 dark:selection:text-indigo-200 transition-colors duration-500">
      <Navbar isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
      <div className="pt-20 pb-4">
        <main className="max-w-[1800px] mx-auto px-4 md:px-6 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
