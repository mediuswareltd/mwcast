import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import Stream from './pages/Stream';
import Explore from './pages/Explore';
import AuthCallback from './pages/AuthCallback';

import { useAuth } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import Placeholder from './components/Placeholder';
import NotFound from './pages/NotFound';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { isAuthModalOpen, closeAuthModal } = useAuth();

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
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/following" element={<Placeholder title="Following" description="Your favorite creators are just a heartbeat away. Feature coming soon." />} />
          <Route path="/browse" element={<Placeholder title="Browse" description="Discovery is an art. Explore categories and tags in the next update." />} />
          <Route path="/settings" element={<Placeholder title="Settings" description="Customize your experience. Profile and account controls are in development." />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MainLayout>
      <AuthModal isOpen={isAuthModalOpen} onClose={closeAuthModal} />
    </Router>
  );
}

export default App;
