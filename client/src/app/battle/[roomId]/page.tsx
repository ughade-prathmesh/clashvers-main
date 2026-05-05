'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSocket } from '@/hooks/useSocket';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-slate-500 text-sm" style={{ background: '#1e1e1e' }}>Loading editor…</div>,
});

const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp'];

const STARTER: Record<string, string> = {
  javascript: `// Write your solution here\nfunction solution(nums, target) {\n  \n}\n`,
  typescript: `// Write your solution here\nfunction solution(nums: number[], target: number): number[] {\n  \n}\n`,
  python: `# Write your solution here\ndef solution(nums, target):\n    pass\n`,
  java: `// Write your solution here\npublic class Solution {\n    public int[] solve() {\n        return new int[]{};\n    }\n}\n`,
  cpp: `// Write your solution here\n#include <bits/stdc++.h>\nusing namespace std;\nvoid solution() {}\n`,
};

function generateDummy(length: number): string {
  if (length === 0) return "// opponent hasn't started typing yet…";
  const lines: string[] = [];
  let rem = length;
  while (rem > 0) { const len = Math.min(rem, 45 + (rem % 23)); lines.push('█'.repeat(len)); rem -= len; }
  return lines.join('\n');
}

function fmtTime(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

export default function BattlePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const [myCode, setMyCode] = useState('');
  const [myLang, setMyLang] = useState('javascript');
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [pendingName, setPendingName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [problemOpen, setProblemOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [playerIdx, setPlayerIdx] = useState<0 | 1 | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const lastSendRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { connected, gameState, joinRoom, sendCodeUpdate, requestDraw, confirmDraw, rejectDraw, requestFinish, confirmFinish, rejectFinish, sendChat } = useSocket();

  // Load identity from localStorage
  useEffect(() => {
    const id = localStorage.getItem('cw_userId');
    const name = localStorage.getItem('cw_username');
    if (id && name) { setUserId(id); setUsername(name); }
    else setShowModal(true);
  }, []);

  // Join room
  useEffect(() => {
    if (!userId || !username || !connected || !roomId || gameState.status !== 'idle') return;
    joinRoom(roomId, userId, username, myLang);
  }, [userId, username, connected, roomId, gameState.status, joinRoom, myLang]);

  // Starter code on lang change (only idle/waiting)
  useEffect(() => {
    if (gameState.status === 'idle' || gameState.status === 'waiting') setMyCode(STARTER[myLang]);
  }, [myLang, gameState.status]);

  // Player index
  useEffect(() => {
    if (gameState.players.length >= 1 && userId) {
      const idx = gameState.players.findIndex(p => p.userId === userId);
      if (idx !== -1) setPlayerIdx(idx as 0 | 1);
    }
  }, [gameState.players, userId]);

  // Countdown timer — uses server-provided startedAt + duration
  useEffect(() => {
    if (gameState.status !== 'active' || !gameState.matchStartedAt) return;
    const tick = () => {
      const elapsed = Date.now() - gameState.matchStartedAt!;
      const left = Math.max(0, Math.floor((gameState.matchDuration - elapsed) / 1000));
      setTimeLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameState.status, gameState.matchStartedAt, gameState.matchDuration]);

  // Scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [gameState.chatMessages]);

  // Throttled code send (max 5/sec)
  const handleCodeChange = useCallback((code: string | undefined) => {
    if (!code) return;
    setMyCode(code);
    const now = Date.now();
    if (now - lastSendRef.current >= 200 && gameState.status === 'active') {
      lastSendRef.current = now;
      sendCodeUpdate(code, myLang);
    }
  }, [gameState.status, myLang, sendCodeUpdate]);

  // Sync language automatically to server when active status begins or language changes
  useEffect(() => {
    if (gameState.status === 'active') {
      sendCodeUpdate(myCode, myLang);
    }
  }, [gameState.status, myLang]);

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = pendingName.trim();
    if (!name) return;
    let id = localStorage.getItem('cw_userId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('cw_userId', id); }
    localStorage.setItem('cw_username', name);
    setUserId(id); setUsername(name); setShowModal(false);
  };

  const handleChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim()); setChatInput('');
  };

  const opponent = gameState.players.find(p => p.userId !== userId);
  const me = gameState.players.find(p => p.userId === userId);
  const isRevealed = gameState.status === 'revealed';
  const revealedOpponent = gameState.revealData?.players.find(p => p.userId !== userId);
  const winner = gameState.revealData?.winner;
  const iWon = winner && winner !== 'draw' && playerIdx !== null
    ? (winner === 'player1' && playerIdx === 0) || (winner === 'player2' && playerIdx === 1)
    : false;
  const dummyText = useMemo(() => generateDummy(gameState.opponentCodeLength), [gameState.opponentCodeLength]);

  const editorOptions = { fontSize: 13, fontFamily: 'JetBrains Mono, monospace', minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on' as const, padding: { top: 12 }, wordWrap: 'on' as const };

  const timerColor = timeLeft !== null && timeLeft < 60 ? 'var(--accent-red)' : timeLeft !== null && timeLeft < 180 ? '#ffa502' : 'white';

  // ── Username Modal ──────────────────────────────────────────────────────────
  if (showModal) return (
    <div className="h-full grid-bg flex items-center justify-center">
      <form onSubmit={handleUsernameSubmit} className="flex flex-col gap-4 p-8 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', minWidth: 320 }}>
        <h2 className="text-xl font-bold text-white text-center">Enter Username</h2>
        <input autoFocus value={pendingName} onChange={e => setPendingName(e.target.value)} placeholder="your_handle" maxLength={20}
          className="px-4 py-2 rounded-lg text-white outline-none" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace' }} />
        <button type="submit" className="py-2 rounded-lg font-semibold text-black" style={{ background: 'var(--accent-green)' }}>Enter Arena</button>
      </form>
    </div>
  );

  if (gameState.status === 'idle') return (
    <div className="h-full grid-bg flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">{connected ? 'Joining battle room…' : 'Connecting to server…'}</p>
    </div>
  );

  // ── Waiting ────────────────────────────────────────────────────────────────
  if (gameState.status === 'waiting') return (
    <div className="h-full grid-bg flex flex-col items-center justify-center gap-6">
      <div className="animate-float text-5xl font-bold"><span className="text-white">clash</span><span style={{ color: 'var(--accent-red)' }}>vers</span></div>
      <div className="w-8 h-8 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Waiting for opponent…</p>
      <p className="text-slate-600 text-xs font-mono">{roomId}</p>
      <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="text-xs px-3 py-1 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>📋 Copy Link</button>
    </div>
  );

  // ── AI Evaluating Overlay ──────────────────────────────────────────────────
  const AIOverlay = gameState.aiEvaluating && !isRevealed ? (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6" style={{ background: 'rgba(8,8,16,0.95)' }}>
      <div className="text-5xl animate-pulse">🤖</div>
      <p className="text-white font-bold text-xl">AI Judging Solutions…</p>
      <div className="flex gap-1">
        {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-red-400" style={{ animation: `pulse-glow 1s ease-in-out ${i * 0.3}s infinite` }} />)}
      </div>
      <p className="text-slate-500 text-sm">Analyzing code quality and correctness</p>
    </div>
  ) : null;

  // ── Reveal Overlay ─────────────────────────────────────────────────────────
  const RevealOverlay = isRevealed ? (
    <div className="absolute inset-0 z-50 flex flex-col items-center animate-reveal overflow-y-auto" style={{ background: 'rgba(5,0,0,0.97)', padding: '2rem 2rem 3rem' }}>

      {/* ── Result Banner ── */}
      <div className="w-full max-w-7xl shrink-0 mb-6">
        <div className="flex items-center justify-center gap-4 py-6 rounded-2xl mb-5"
          style={{
            background: winner === 'draw'
              ? 'linear-gradient(135deg, rgba(180,140,0,0.15), rgba(255,200,0,0.05))'
              : iWon
                ? 'linear-gradient(135deg, rgba(0,180,80,0.15), rgba(0,255,100,0.05))'
                : 'linear-gradient(135deg, rgba(180,0,30,0.2), rgba(255,0,60,0.05))',
            border: `1px solid ${winner === 'draw' ? 'rgba(255,200,0,0.2)' : iWon ? 'rgba(0,255,100,0.2)' : 'rgba(255,0,60,0.25)'}`,
          }}
        >
          <span className="text-5xl">
            {winner === 'draw' ? '🤝' : iWon ? '🏆' : '💀'}
          </span>
          <div>
            <div className="text-5xl font-black tracking-tight"
              style={{ color: winner === 'draw' ? '#ffd700' : iWon ? '#00ff88' : '#ff003c', textShadow: `0 0 40px ${winner === 'draw' ? 'rgba(255,215,0,0.5)' : iWon ? 'rgba(0,255,136,0.5)' : 'rgba(255,0,60,0.5)'}` }}
            >
              {winner === 'draw' ? 'Draw!' : iWon ? 'Victory!' : 'Defeat'}
            </div>
            <div className="text-sm mt-1 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {winner === 'draw' ? 'Both players fought hard' : iWon ? 'You outclashed your opponent' : 'Better luck next clash'}
            </div>
          </div>
        </div>

        {/* AI Conclusion */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(15,5,0,0.8)', border: '1px solid rgba(255,0,60,0.15)' }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🤖</span>
            <strong className="text-white text-base uppercase tracking-widest">AI Match Conclusion</strong>
          </div>
          <p className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">
            {gameState.revealData?.explanation || 'Evaluating based on code quality and completeness...'}
          </p>
        </div>
      </div>

      {/* ── Player Panels ── */}
      <div className="flex gap-5 w-full max-w-7xl flex-1 min-h-[520px]">
        {gameState.revealData?.players.map((p) => {
          const evalData = gameState.revealData?.evaluations?.[p.userId];
          const isMe = p.userId === userId;
          const eloDelta = gameState.eloDeltas?.[p.userId];
          const accentColor = isMe ? '#00ff88' : '#ff003c';
          return (
            <div key={p.userId} className="flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
              style={{ border: `1px solid ${isMe ? 'rgba(0,255,136,0.25)' : 'rgba(255,0,60,0.25)'}`, background: 'rgba(8,0,0,0.7)' }}
            >
              {/* Panel Header */}
              <div className="px-5 py-3 shrink-0 flex items-center justify-between"
                style={{ background: isMe ? 'rgba(0,255,136,0.06)' : 'rgba(255,0,60,0.06)', borderBottom: `1px solid ${isMe ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,60,0.15)'}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{isMe ? '👤' : '⚔'}</span>
                  <span className="font-bold text-sm uppercase tracking-widest" style={{ color: accentColor }}>
                    {isMe ? 'You' : 'Opponent'}
                  </span>
                  <span className="text-slate-400 text-xs font-mono">— {p.username} [{p.language}]</span>
                </div>
                {eloDelta !== undefined && (
                  <span className="px-3 py-1 rounded-full text-xs font-black"
                    style={{
                      background: eloDelta >= 0 ? 'rgba(0,255,136,0.12)' : 'rgba(255,0,60,0.12)',
                      color: eloDelta >= 0 ? '#00ff88' : '#ff4757',
                      border: `1px solid ${eloDelta >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,0,60,0.2)'}`,
                    }}
                  >
                    {eloDelta >= 0 ? `▲ +${eloDelta}` : `▼ ${eloDelta}`} ELO
                  </span>
                )}
              </div>

              {/* Code Editor */}
              <div className="flex-1 min-h-0">
                <MonacoEditor height="100%" language={p.language} value={p.code} theme="vs-dark" options={{ ...editorOptions, readOnly: true }} />
              </div>

              {/* Feedback Panel */}
              {evalData && (
                <div className="shrink-0 p-5 text-sm overflow-y-auto" style={{ height: '42%', borderTop: `1px solid ${isMe ? 'rgba(0,255,136,0.12)' : 'rgba(255,0,60,0.12)'}`, background: 'rgba(0,0,0,0.5)' }}>
                  <p className="font-black mb-2 text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: accentColor }}>
                    🔬 Implementation Feedback
                  </p>
                  <p className="text-slate-300 mb-5 leading-relaxed whitespace-pre-wrap text-xs">{evalData.feedback}</p>
                  <p className="font-black mb-2 text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: accentColor }}>
                    ✨ Next Steps
                  </p>
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-xs">{evalData.improvements}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Back Button */}
      <button
        onClick={() => router.push('/')}
        className="mt-8 shrink-0 px-10 py-4 rounded-2xl font-bold text-white text-base uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #cc0000, #ff003c)', boxShadow: '0 6px 30px rgba(255,0,60,0.35)' }}
      >
        ← Back to Lobby
      </button>
    </div>
  ) : null;


  // ── Draw Request Modal ─────────────────────────────────────────────────────
  const isOpponentDraw = gameState.drawPending && gameState.drawRequesterName !== null;
  const DrawModal = isOpponentDraw ? (
    <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="flex flex-col items-center gap-6 text-center" style={{
        background: 'rgba(10,0,0,0.92)',
        border: '1px solid rgba(255,0,60,0.3)',
        borderRadius: '1.5rem',
        padding: '2.5rem 3rem',
        minWidth: 360,
        boxShadow: '0 0 60px rgba(255,0,60,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        <div className="text-5xl">🤝</div>
        <div>
          <p className="text-white font-bold text-xl mb-2 tracking-wide">Draw Request</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--accent-red)' }}>{gameState.drawRequesterName}</strong> wants to call a draw
          </p>
        </div>
        <div className="h-px w-full" style={{ background: 'rgba(255,0,60,0.15)' }} />
        <div className="flex gap-4 w-full">
          <button
            onClick={() => { confirmDraw(); }}
            className="flex-1 py-3 rounded-xl font-bold text-white text-sm tracking-widest uppercase transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #cc0000, #ff003c)', boxShadow: '0 4px 20px rgba(255,0,60,0.3)' }}
          >✓ Accept</button>
          <button
            onClick={() => { rejectDraw(); }}
            className="flex-1 py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all hover:bg-white/5"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
          >✕ Reject</button>
        </div>
      </div>
    </div>
  ) : null;

  // ── Finish Early Modal ─────────────────────────────────────────────────────
  const isOpponentFinish = gameState.finishPending && gameState.finishRequesterName !== null;
  const FinishModal = isOpponentFinish ? (
    <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="flex flex-col items-center gap-6 text-center" style={{
        background: 'rgba(10,0,0,0.92)',
        border: '1px solid rgba(255,0,60,0.3)',
        borderRadius: '1.5rem',
        padding: '2.5rem 3rem',
        minWidth: 380,
        boxShadow: '0 0 60px rgba(255,0,60,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        <div className="text-5xl">🏁</div>
        <div>
          <p className="text-white font-bold text-xl mb-2 tracking-wide">Early Submit Request</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--accent-red)' }}>{gameState.finishRequesterName}</strong> is done and wants to submit early.
          </p>
        </div>
        <div className="h-px w-full" style={{ background: 'rgba(255,0,60,0.15)' }} />
        <div className="flex gap-4 w-full">
          <button
            onClick={() => { confirmFinish(); }}
            className="flex-1 py-3 rounded-xl font-bold text-white text-sm tracking-widest uppercase transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #cc0000, #ff003c)', boxShadow: '0 4px 20px rgba(255,0,60,0.3)' }}
          >🏁 Submit Now</button>
          <button
            onClick={() => { rejectFinish(); }}
            className="flex-1 py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all hover:bg-white/5"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
          >⌨ Keep Coding</button>
        </div>
      </div>
    </div>
  ) : null;

  // ── Arena ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--bg-primary)' }}>
      {AIOverlay}
      {RevealOverlay}
      {DrawModal}
      {FinishModal}

      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-12 shrink-0 z-10" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <span className="font-bold text-sm"><span className="text-white">clash</span><span style={{ color: 'var(--accent-red)' }}>vers</span></span>
        <div className="w-px h-4" style={{ background: 'var(--border)' }} />
        <span className="text-slate-400 text-xs truncate max-w-40">{gameState.problem?.title ?? '…'}</span>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs" style={{ color: connected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-red-400' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>

          {/* Countdown */}
          {gameState.status === 'active' && timeLeft !== null && (
            <span className="text-sm font-mono font-bold tabular-nums" style={{ color: timerColor }}>
              ⏱ {fmtTime(timeLeft)}
            </span>
          )}

          {/* Early Submit button */}
          {gameState.status === 'active' && (
            <button onClick={requestFinish} disabled={!!gameState.finishPending}
              className="px-3 py-1 rounded text-xs font-semibold disabled:opacity-40"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--accent-green)' }}>
              🏁 {gameState.finishPending ? 'Pending…' : 'Submit Early'}
            </button>
          )}

          {/* Draw button */}
          {gameState.status === 'active' && (
            <button onClick={requestDraw} disabled={!!gameState.drawPending || gameState.drawAttempts >= 3}
              className="px-3 py-1 rounded text-xs font-semibold disabled:opacity-40"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              🤝 {gameState.drawPending ? 'Draw Pending…' : `Offer Draw (${3 - gameState.drawAttempts} left)`}
            </button>
          )}
        </div>
      </header>

      {/* Problem Panel */}
      {problemOpen && gameState.problem && (
        <div className="shrink-0 px-4 py-3 text-xs overflow-y-auto max-h-36 relative" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setProblemOpen(false)} className="absolute top-2 right-3 text-slate-500 hover:text-white">✕</button>
          <p className="font-semibold text-white mb-1">{gameState.problem.title}</p>
          <p className="text-slate-400 leading-relaxed mb-2">{gameState.problem.description}</p>
          <pre className="text-slate-500 font-mono whitespace-pre-wrap">{gameState.problem.examples}</pre>
        </div>
      )}
      {!problemOpen && (
        <button onClick={() => setProblemOpen(true)} className="shrink-0 px-4 py-1 text-xs text-left hover:text-white transition-colors"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          📋 {gameState.problem?.title} — click to expand
        </button>
      )}

      {/* Error / info banner */}
      {gameState.errorMessage && (
        <div className="shrink-0 px-4 py-2 text-xs text-center" style={{ background: 'rgba(255,71,87,0.15)', color: 'var(--accent-red)', borderBottom: '1px solid rgba(255,71,87,0.3)' }}>
          {gameState.errorMessage}
        </div>
      )}
      {gameState.isRateLimited && (
        <div className="shrink-0 px-4 py-1 text-xs text-center" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa502' }}>⚠ Typing too fast — slowing sync</div>
      )}

      {/* Editors */}
      <div className="flex flex-1 min-h-0">
        {/* My Editor */}
        <div className="flex flex-col flex-1 min-w-0" style={{ borderRight: '2px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-1.5 shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--accent-green)' }}>YOU — {username} {me?.elo ? `[${me.elo} ELO]` : ''}</span>
            <select value={myLang} onChange={e => setMyLang(e.target.value)} className="ml-auto text-xs rounded px-2 py-0.5 outline-none text-white" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex-1 min-h-0">
            <MonacoEditor height="100%" language={myLang} value={myCode} theme="vs-dark" onChange={handleCodeChange} options={editorOptions} />
          </div>
        </div>

        {/* Enemy Editor */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-3 px-3 py-1.5 shrink-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-purple)' }} />
            <span className="text-xs font-mono" style={{ color: 'var(--accent-purple)' }}>ENEMY — {opponent?.username ?? 'Unknown'} {opponent?.elo ? `[${opponent.elo} ELO]` : ''}</span>
            <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{gameState.opponentCodeLength} chars</span>
          </div>
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <pre className="absolute inset-0 p-3 text-xs font-mono leading-5 overflow-hidden select-none" style={{ background: '#1e1e1e', color: '#444', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {dummyText}
            </pre>
            {!isRevealed && (
              <div className="absolute inset-0 fog-blur flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(8,8,16,0.5)' }}>
                <span className="text-4xl">🔒</span>
                <p className="text-xs font-mono" style={{ color: 'var(--accent-purple)' }}>
                  {gameState.opponentCodeLength > 0 ? `${gameState.opponentCodeLength} chars` : 'Waiting…'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Revealed by AI on time's up</p>
              </div>
            )}
            {isRevealed && revealedOpponent && (
              <div className="absolute inset-0">
                <MonacoEditor height="100%" language={revealedOpponent.language} value={revealedOpponent.code} theme="vs-dark" options={{ ...editorOptions, readOnly: true }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="shrink-0 flex flex-col" style={{ height: 120, borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1">
          {gameState.chatMessages.map((msg, i) => (
            <div key={i} className="text-xs break-words">
              <span className="font-mono" style={{ color: msg.userId === userId ? 'var(--accent-green)' : 'var(--accent-purple)' }}>{msg.username}: </span>
              <span className="text-slate-200" dangerouslySetInnerHTML={{ __html: msg.message }} />
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleChat} className="flex gap-2 px-3 pb-2">
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Chat…" maxLength={200}
            className="flex-1 px-3 py-1.5 rounded text-xs text-white outline-none" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} />
          <button type="submit" className="px-3 py-1.5 rounded text-xs font-semibold text-black" style={{ background: 'var(--accent-green)' }}>Send</button>
        </form>
      </div>
    </div>
  );
}
