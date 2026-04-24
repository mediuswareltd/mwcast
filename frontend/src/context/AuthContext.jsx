import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);          // UserPublic | null
  const [token, setToken] = useState(() => localStorage.getItem('mwcast_token'));
  const [loading, setLoading] = useState(true);

  // Verify token with /me on startup
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setUser(data.data);
        else logout();            // token is invalid/expired
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  const saveAuth = useCallback((newToken, newUser) => {
    localStorage.setItem('mwcast_token', newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mwcast_token');
    setToken(null);
    setUser(null);
  }, []);

  // Authenticated fetch helper — auto-injects Bearer header
  const authFetch = useCallback(
    (url, opts = {}) => {
      const headers = { ...(opts.headers || {}) };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return fetch(url, { ...opts, headers });
    },
    [token],
  );

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  return (
    <AuthContext.Provider value={{ 
      user, token, loading, saveAuth, logout, authFetch,
      isAuthModalOpen, openAuthModal, closeAuthModal 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
