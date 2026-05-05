'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PlayerProfile {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  avatar_url: string | null;
}

interface MatchHistory {
  id: string;
  player1_username: string | null;
  player2_username: string | null;
  player1_id: string | null;
  player2_id: string | null;
  winner: string | null; // "player1" | "player2" | "draw"
  elo_change_p1: number | null;
  elo_change_p2: number | null;
  problem_title: string | null;
  created_at: string | null;
  ended_at: string | null;
}

const timeAgo = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function CareerPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [matches, setMatches] = useState<MatchHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const savedUserId = localStorage.getItem('cw_userId');
    if (!savedUserId) {
      setError('No player session found. Go to the lobby and enter a username first.');
      setLoading(false);
      return;
    }
    setUserId(savedUserId);
    fetchData(savedUserId);
  }, []);

  async function fetchData(uid: string) {
    const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    try {
      const [resP, resM] = await Promise.all([
        fetch(`${API_URL}/profile/${uid}`, { cache: 'no-store' }),
        fetch(`${API_URL}/matches/${uid}`, { cache: 'no-store' })
      ]);

      if (!resP.ok) throw new Error('Failed to load profile');
      const profileData = await resP.json();
      setProfile(profileData);

      if (resM.ok) {
        const matchData = await resM.json();
        setMatches(matchData);
      }

      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  const getMatchResult = (m: MatchHistory) => {
    if (!m.winner || m.winner === 'draw') return { label: 'DRAW', color: '#ffcc00', bg: 'rgba(255, 204, 0, 0.1)' };
    const amPlayer1 = m.player1_id === userId;
    const amPlayer2 = m.player2_id === userId;
    
    if (m.winner === 'player1' && amPlayer1) return { label: 'VICTORY', color: '#00ff88', bg: 'rgba(0, 255, 136, 0.1)' };
    if (m.winner === 'player2' && amPlayer2) return { label: 'VICTORY', color: '#00ff88', bg: 'rgba(0, 255, 136, 0.1)' };
    
    return { label: 'DEFEAT', color: '#ff003c', bg: 'rgba(255, 0, 60, 0.1)' };
  };

  const getOpponent = (m: MatchHistory) => {
    const isP1 = m.player1_username === profile?.username;
    return isP1 ? (m.player2_username || 'Unknown') : (m.player1_username || 'Unknown');
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Background fighters image - low opacity */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10 pointer-events-none"
        style={{ backgroundImage: "url('/login-bg.png')" }}
      />
      {/* Subtle grid and glows */}
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-64 bg-red-600/5 blur-3xl rounded-full pointer-events-none" />

      {/* Navigation - Fixed at corners */}
      <div className="absolute top-6 left-6 z-50">
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 rounded-lg font-bold text-xs border transition-all hover:border-red-500/50 hover:text-white uppercase tracking-widest bg-black/40"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          ← Back to Lobby
        </button>
      </div>
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={() => router.push('/leaderboard')}
          className="px-5 py-2.5 rounded-lg font-bold text-xs border transition-all hover:border-red-500/50 hover:text-white uppercase tracking-widest bg-black/40"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          🏆 Leaderboard
        </button>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 w-full flex flex-col flex-1 min-h-0 items-center pt-12 px-8 pb-8">
        <div className="w-full max-w-6xl flex flex-col flex-1 min-h-0">
        
        {/* Centered Page Header */}
        <div className="text-center mb-10 shrink-0">
          <div className="animate-float mb-2 text-6xl font-black tracking-tight drop-shadow-2xl">
            <span className="text-white">Player</span>{' '}
            <span style={{ color: 'var(--accent-red)', textShadow: '0 0 30px rgba(255,0,60,0.4)' }}>Career</span>
          </div>
          <div className="text-xs tracking-[0.4em] uppercase font-medium" style={{ color: 'var(--text-muted)' }}>
            Performance Metrics & Combat History
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="w-14 h-14 border-2 border-red-400/20 border-t-red-400 rounded-full animate-spin" />
            <p className="text-sm uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Syncing Battle Records...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center -mt-20">
            <div
              className="p-12 rounded-3xl flex flex-col items-center gap-8 text-center"
              style={{
                background: 'rgba(10,0,0,0.78)',
                border: '1px solid rgba(255,0,60,0.25)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 0 60px rgba(255,0,60,0.12)',
                maxWidth: '500px'
              }}
            >
              <div className="text-7xl mb-2">🔐</div>
              <div>
                <h2 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">Access Restricted</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {error.includes('No player session') 
                    ? "You must authenticate with a player profile before you can access career statistics." 
                    : error}
                </p>
              </div>
              <button
                onClick={() => router.push('/')}
                className="px-10 py-4 rounded-xl font-bold text-white text-base uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98] w-full"
                style={{
                  background: 'linear-gradient(135deg, #cc0000, #ff003c)',
                  boxShadow: '0 6px 30px rgba(255,0,60,0.35)',
                }}
              >
                ⚔  Back to Login
              </button>
            </div>
          </div>
        ) : profile && (
          <div className="w-full flex flex-col flex-1 min-h-0">
            {/* Profile Header Card */}
            <div
              className="w-full rounded-2xl p-8 mb-8 flex items-center justify-between shadow-2xl shrink-0"
              style={{
                background: 'rgba(10,0,0,0.7)',
                border: '1px solid rgba(255,0,60,0.2)',
                backdropFilter: 'blur(10px)'
              }}
            >
              <div className="flex items-center gap-6">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
                  style={{ 
                    background: 'linear-gradient(135deg, #3a0000, #660000)', 
                    border: '2px solid rgba(255,0,60,0.4)',
                    boxShadow: '0 0 20px rgba(255,0,60,0.2)'
                  }}
                >
                  👤
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-white mb-1">{profile.username}</h2>
                  <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>Veteran Clashver</p>
                </div>
              </div>

              <div className="flex gap-12 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: 'var(--text-muted)' }}>Current Rating</p>
                  <p className="text-4xl font-mono font-bold" style={{ color: 'var(--accent-red)', textShadow: '0 0 20px rgba(255,0,60,0.4)' }}>{profile.elo}</p>
                </div>
                <div className="w-px h-12 bg-white/10 my-auto" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] mb-2" style={{ color: 'var(--text-muted)' }}>Battle Record</p>
                  <p className="text-4xl font-mono font-bold text-white">
                    {profile.wins}W <span className="text-slate-600 mx-1">—</span> {profile.losses}L
                  </p>
                </div>
              </div>
            </div>

            {/* Match History Table */}
            <div className="flex-1 min-h-0 flex flex-col">
              <h3 className="text-sm font-bold uppercase tracking-[0.3em] mb-4 flex items-center gap-3 px-2">
                <span className="w-8 h-px bg-red-600/50" />
                Combat Logs
              </h3>
              
              <div className="flex-1 min-h-0 rounded-2xl overflow-hidden shadow-2xl" style={{ border: '1px solid var(--border)', background: 'rgba(5,0,0,0.5)' }}>
                <div className="h-full overflow-auto">
                  <table className="w-full table-fixed text-left">
                    <thead className="bg-black/60 sticky top-0 z-10">
                      <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-slate-500 w-32">Status</th>
                        <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-slate-500">Operation / Problem</th>
                        <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-slate-500">Adversary</th>
                        <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-slate-500 text-center w-32">Rating Δ</th>
                        <th className="px-6 py-5 text-[10px] uppercase tracking-widest text-slate-500 text-right w-40">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {matches.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-20 text-center text-slate-500 italic">
                            No combat logs digitized yet. Begin your first clash to see history.
                          </td>
                        </tr>
                      ) : (
                        matches.map((m) => {
                          const result = getMatchResult(m);
                          const opponent = getOpponent(m);
                          const isP1 = m.player1_username === profile.username;
                          const delta = isP1 ? m.elo_change_p1 : m.elo_change_p2;

                          return (
                            <tr
                              key={m.id}
                              className="hover:bg-white/[0.03] transition-colors"
                            >
                              <td className="px-6 py-6 transition-all">
                                <span
                                  className="text-[10px] font-black px-3 py-1 rounded-full border"
                                  style={{ color: result.color, backgroundColor: result.bg, borderColor: `${result.color}33` }}
                                >
                                  {result.label}
                                </span>
                              </td>
                              <td className="px-6 py-6 font-mono text-sm text-white font-bold opacity-90">{m.problem_title}</td>
                              <td className="px-6 py-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full shadow-[0_0_8px]" style={{ background: 'var(--accent-red)' }} />
                                  <span className="text-white font-medium">{opponent}</span>
                                </div>
                              </td>
                              <td className="px-6 py-6 text-center font-mono text-sm font-black">
                                {delta !== null && delta !== 0 ? (
                                  <span style={{ color: delta > 0 ? '#00ff88' : '#ff003c' }}>
                                    {delta > 0 ? `+${delta}` : delta}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                              <td className="px-6 py-6 text-right text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                {m.ended_at ? timeAgo(m.ended_at) : m.created_at ? timeAgo(m.created_at) : '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
