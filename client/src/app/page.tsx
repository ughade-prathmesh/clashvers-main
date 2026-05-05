'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');
  const [playerStats, setPlayerStats] = useState<{ elo: number; wins: number; losses: number } | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

  useEffect(() => {
    const savedUserId = localStorage.getItem('cw_userId');
    const savedUsername = localStorage.getItem('cw_username');
    if (savedUserId && savedUsername) {
      setUserId(savedUserId);
      setUsername(savedUsername);
      fetchStats(savedUserId);
    }
  }, []);

  async function fetchStats(uid: string) {
    try {
      const res = await fetch(`${API_URL}/profile/${uid}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPlayerStats(data);
      }
    } catch { }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Username and Password are required');
      return;
    }

    setLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('cw_userId', data.userId);
      localStorage.setItem('cw_username', data.username);
      setUserId(data.userId);
      setUsername(data.username);
      setPlayerStats({ elo: data.elo || 1000, wins: 0, losses: 0 });
      fetchStats(data.userId);
      setLoading(false);
    } catch {
      setError('Connection error. Is the server running?');
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('cw_userId');
    localStorage.removeItem('cw_username');
    setUserId(null);
    setPlayerStats(null);
    setUsername('');
    setPassword('');
  }

  async function handleFindMatch() {
    setFinding(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/room/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username }),
        cache: 'no-store'
      });
      const data = await res.json();
      if (data.roomId) {
        router.push(`/battle/${data.roomId}`);
      } else {
        setError('Server error — try again');
        setFinding(false);
      }
    } catch {
      setError('Cannot reach server');
      setFinding(false);
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center relative overflow-hidden">
      {/* Full-screen background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/login-bg.png')" }}
      />
      {/* Dark tint overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(3,0,0,0.68)' }} />
      {/* Subtle grid */}
      <div className="absolute inset-0 grid-bg opacity-20" />
      {/* Red glow at bottom center */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-48 bg-red-600/20 blur-3xl rounded-full pointer-events-none" />

      {/* Nav buttons */}
      <div className="absolute top-6 right-6 flex gap-3 z-50">
        <button
          onClick={() => router.push('/hub')}
          className="px-5 py-2.5 rounded-lg font-bold text-xs border transition-all hover:border-red-500/50 hover:text-white uppercase tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.4)', textShadow: '0 0 10px rgba(255,0,60,0.2)' }}
        >
          📡 Community Hub
        </button>
        <button
          onClick={() => router.push('/career')}
          className="px-5 py-2.5 rounded-lg font-bold text-xs border transition-all hover:border-red-500/50 hover:text-white uppercase tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.4)' }}
        >
          📊 Career
        </button>
        <button
          onClick={() => router.push('/leaderboard')}
          className="px-5 py-2.5 rounded-lg font-bold text-xs border transition-all hover:border-red-500/50 hover:text-white uppercase tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.4)' }}
        >
          🏆 Leaderboard
        </button>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center gap-12 w-full max-w-xl px-6 text-center">

        {/* Logo */}
        <div className="animate-float">
          <div className="text-8xl font-bold tracking-tight drop-shadow-2xl">
            <span className="text-white">clash</span>
            <span style={{ color: 'var(--accent-red)', textShadow: '0 0 40px rgba(255,0,60,0.6)' }}>vers</span>
          </div>
          <div className="text-sm tracking-[0.5em] uppercase mt-3 font-medium" style={{ color: 'var(--text-muted)' }}>
            1v1 Real-Time Coding PvP
          </div>
        </div>

        {!userId ? (
          /* ── Login / Register Card ── */
          <div
            className="w-full rounded-3xl shadow-2xl"
            style={{
              background: 'rgba(10,0,0,0.75)',
              border: '1px solid rgba(255,0,60,0.25)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 0 60px rgba(255,0,60,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
              padding: '3rem 3.5rem 2.5rem',
            }}
          >
            {/* Top accent line */}
            <div className="h-0.5 w-24 mx-auto mb-8 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-red), transparent)' }} />

            <h2 className="text-3xl font-bold text-white mb-8 uppercase tracking-[0.2em] text-center">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>

            <form onSubmit={handleAuth} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>Username</label>
                <input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-5 py-4 rounded-xl text-white outline-none text-base transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,0,60,0.2)',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(255,0,60,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,0,60,0.2)'}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>Password</label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-xl text-white outline-none text-base transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,0,60,0.2)',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(255,0,60,0.6)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,0,60,0.2)'}
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm text-left bg-red-400/5 px-4 py-3 rounded-xl border border-red-500/25">
                  ⚠ {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-4 rounded-xl font-bold text-white text-lg tracking-widest uppercase transition-all hover:brightness-110 disabled:opacity-50 active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #cc0000, #ff003c)',
                  boxShadow: '0 4px 30px rgba(255,0,60,0.4)',
                }}
              >
                {loading ? 'Authenticating...' : authMode === 'login' ? '⚔ Login' : '⚔ Sign Up'}
              </button>
            </form>

            <div className="h-px my-7 mx-4" style={{ background: 'rgba(255,255,255,0.06)' }} />

            <button
              onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-sm font-medium transition-colors block w-full text-center tracking-wide hover:text-white"
              style={{ color: 'var(--text-muted)' }}
            >
              {authMode === 'login' ? "Don't have an account? Sign up →" : "Already have an account? Login →"}
            </button>
          </div>

        ) : (
          /* ── Logged-In Card ── */
          <div
            className="w-full rounded-3xl flex flex-col items-center gap-8"
            style={{
              background: 'rgba(10,0,0,0.78)',
              border: '1px solid rgba(255,0,60,0.25)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 0 60px rgba(255,0,60,0.12), inset 0 1px 0 rgba(255,255,255,0.05)',
              padding: '3rem 3.5rem',
            }}
          >
            {/* Player badge */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-1"
                style={{ background: 'linear-gradient(135deg, #3a0000, #660000)', border: '2px solid rgba(255,0,60,0.4)', boxShadow: '0 0 20px rgba(255,0,60,0.2)' }}
              >
                ⚔️
              </div>
              <span className="text-xs uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>Authenticated Player</span>
              <span className="text-5xl font-bold text-white tracking-tight">{username}</span>
            </div>

            {/* Stats row */}
            {playerStats && (
              <div
                className="flex justify-center gap-0 w-full rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,0,60,0.15)', background: 'rgba(0,0,0,0.4)' }}
              >
                <div className="flex-1 flex flex-col items-center py-6 px-4">
                  <span className="text-xs text-slate-500 uppercase tracking-[0.2em] mb-2">ELO</span>
                  <span className="text-4xl font-mono font-bold" style={{ color: 'var(--accent-red)', textShadow: '0 0 20px rgba(255,0,60,0.5)' }}>{playerStats.elo}</span>
                </div>
                <div className="w-px" style={{ background: 'rgba(255,0,60,0.15)' }} />
                <div className="flex-1 flex flex-col items-center py-6 px-4">
                  <span className="text-xs text-slate-500 uppercase tracking-[0.2em] mb-2">Wins</span>
                  <span className="text-4xl font-mono font-bold text-white">{playerStats.wins}</span>
                </div>
                <div className="w-px" style={{ background: 'rgba(255,0,60,0.15)' }} />
                <div className="flex-1 flex flex-col items-center py-6 px-4">
                  <span className="text-xs text-slate-500 uppercase tracking-[0.2em] mb-2">Losses</span>
                  <span className="text-4xl font-mono font-bold" style={{ color: '#8b2020' }}>{playerStats.losses}</span>
                </div>
              </div>
            )}

            {/* Find Match button */}
            <button
              onClick={handleFindMatch}
              disabled={finding}
              className="w-full py-6 rounded-2xl font-bold text-white text-2xl tracking-widest uppercase transition-all disabled:opacity-50 hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #cc0000, #ff003c)',
                boxShadow: '0 6px 40px rgba(255,0,60,0.45)',
                letterSpacing: '0.15em',
              }}
            >
              {finding ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching...
                </span>
              ) : '⚔  Find Match'}
            </button>

            <button onClick={handleLogout} className="text-xs text-slate-600 hover:text-red-400 transition-colors uppercase tracking-widest font-bold">
              Log Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
