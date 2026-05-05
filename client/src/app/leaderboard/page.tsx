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

const PAGE_SIZE = 15;

export default function LeaderboardPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    fetch(`${API_URL}/leaderboard`, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load leaderboard');
        return res.json();
      })
      .then(data => {
        setPlayers(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const pagePlayers = players.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="h-full grid-bg flex flex-col items-center relative py-12 overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Background glow orbs */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-red-800/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-7xl px-4 flex flex-col items-center flex-1 min-h-0">
        <h1 className="text-4xl font-bold mb-2">
          <span className="text-white">Global</span>{' '}
          <span style={{ color: 'var(--accent-purple)' }}>Leaderboard</span>
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Top clashvers Players by ELO Rating
        </p>

        <button
          onClick={() => router.push('/')}
          className="absolute top-0 left-4 px-4 py-2 text-xs font-bold rounded-lg border transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          ← Back to Lobby
        </button>

        {loading ? (
          <div className="w-8 h-8 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin mt-10" />
        ) : error ? (
          <p className="text-red-400 bg-red-400/10 px-4 py-2 border border-red-500/20 rounded-lg">{error}</p>
        ) : (
          <>
            <div className="w-full rounded-xl overflow-hidden shadow-2xl flex-1 min-h-0" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <table className="w-full table-fixed text-left text-base text-slate-300 h-full">
                <thead className="text-sm uppercase bg-black/40 border-b" style={{ borderColor: 'var(--border)' }}>
                  <tr>
                    <th className="px-6 py-4 font-mono w-20 text-center">Rank</th>
                    <th className="px-6 py-4 font-mono">Player</th>
                    <th className="px-6 py-4 font-mono text-center">ELO Rating</th>
                    <th className="px-6 py-4 font-mono text-center">Win Rate</th>
                    <th className="px-6 py-4 font-mono text-center">Record (W-L)</th>
                  </tr>
                </thead>
                <tbody>
                  {pagePlayers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                        No ranked players yet.
                      </td>
                    </tr>
                  ) : (
                    pagePlayers.map((p, idx) => {
                      const globalIdx = page * PAGE_SIZE + idx;
                      const totalMatches = p.wins + p.losses;
                      const winRate = totalMatches > 0 ? Math.round((p.wins / totalMatches) * 100) : 0;

                      let rankBadge = <span className="text-slate-400 font-bold">#{globalIdx + 1}</span>;
                      if (globalIdx === 0) rankBadge = <span className="text-yellow-400 text-lg">🥇</span>;
                      else if (globalIdx === 1) rankBadge = <span className="text-slate-300 text-lg">🥈</span>;
                      else if (globalIdx === 2) rankBadge = <span className="text-amber-600 text-lg">🥉</span>;

                      return (
                        <tr
                          key={p.id}
                          className="border-b last:border-0 hover:bg-white/5 transition-colors"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="px-6 py-6 text-center">{rankBadge}</td>
                          <td className="px-6 py-6 font-bold text-white">
                            <div className="flex items-center gap-3">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'var(--accent-purple)' }} />
                              <span className="text-xl tracking-wide">{p.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-6 text-center font-mono font-bold" style={{ color: 'var(--accent-green)' }}>
                            {p.elo}
                          </td>
                          <td className="px-6 py-6 text-center">
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${winRate}%` }} />
                            </div>
                            <span className="text-xs text-slate-400 block mt-2">{winRate}%</span>
                          </td>
                          <td className="px-6 py-6 text-center font-mono text-sm">
                            <span className="text-green-400">{p.wins}</span>
                            {' — '}
                            <span className="text-red-400">{p.losses}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-4 mt-5 shrink-0">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-5 py-2 rounded-lg font-bold text-sm border transition-all disabled:opacity-30 hover:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  ← Prev
                </button>
                <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                  Page <span className="text-white font-bold">{page + 1}</span> / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-5 py-2 rounded-lg font-bold text-sm border transition-all disabled:opacity-30 hover:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
