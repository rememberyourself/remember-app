import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Footer from '../components/Footer';

export default function Login() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(code.trim());
      // Navigation happens via auth state change in useAuth
    } catch {
      setError('Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-forest-900 px-4">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Logo area */}
          <div className="text-center mb-14">
            <div className="w-24 h-24 mx-auto mb-8 rounded-full overflow-hidden animate-pulse-glow border border-gold-500/20">
              <img src="/app-icon.png" alt="Remember" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-5xl tracking-[0.2em] text-warm-white mb-3 gold-shimmer heading-brand">
              Remember
            </h1>
            <p className="text-earth-400 text-sm tracking-wide italic mb-1">
              Remember who you truly are
            </p>
            <p className="text-earth-600 text-xs tracking-widest uppercase mt-3">
              Men's Work · Check-in
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="animate-slide-up stagger-1">
              <label className="block text-earth-400 text-xs uppercase tracking-wider mb-2">
                Your Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter invite code..."
                className="w-full bg-forest-800 border border-forest-600 rounded-xl px-4 py-4 text-warm-white placeholder-earth-700 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 transition-all text-center text-lg tracking-widest"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center animate-fade-in">{error}</p>
            )}

            <div className="animate-slide-up stagger-2">
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-forest-900 rounded-xl py-4 font-medium transition-all duration-300 hover:shadow-lg hover:shadow-gold-500/20"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Entering...
                  </span>
                ) : 'Enter'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="animate-slide-up stagger-3">
        <Footer />
      </div>
    </div>
  );
}
