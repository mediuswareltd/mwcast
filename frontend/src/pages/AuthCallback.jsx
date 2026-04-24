import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { Loader } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { saveAuth } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const token = searchParams.get('token');
    if (!token) {
      console.error('No token found in callback URL');
      navigate('/');
      return;
    }

    // Verify token and get user info
    fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          saveAuth(token, data.data);
          navigate('/');
        } else {
          console.error('Token verification failed', data);
          navigate('/');
        }
      })
      .catch(err => {
        console.error('Callback error:', err);
        navigate('/');
      });
  }, [searchParams, saveAuth, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center">
        <Loader className="text-indigo-600 animate-spin" size={32} />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter italic">Authenticating</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Please wait while we sign you in...</p>
      </div>
    </div>
  );
}
