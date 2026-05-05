'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HubScanner() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 'root' | 'create' | 'join'
  const [mode, setMode] = useState<'root' | 'create' | 'join'>('root');

  // Create Mode State
  const [newCommName, setNewCommName] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Join Mode State
  const [communities, setCommunities] = useState<any[]>([]);
  const [selectedComm, setSelectedComm] = useState<any>(null); // the community they clicked 'join' on
  const [credentialInput, setCredentialInput] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

  useEffect(() => {
    const savedUserId = localStorage.getItem('cw_userId');
    if (savedUserId) setUserId(savedUserId);
    else setError('AUTH_ERR: No active session. Return to lobby.');
  }, []);

  // --- CREATE FLOW ---
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !newCommName.trim()) return;
    
    setLoading(true);
    setError('');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

    try {
      const res = await fetch(`${API_URL}/api/nodes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code, name: newCommName.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Network connection failed.');
        setLoading(false);
        return;
      }

      setGeneratedCode(code);
      setLoading(false);
    } catch {
      setError('CRITICAL: Server unreachable.');
      setLoading(false);
    }
  }

  // --- JOIN FLOW ---
  async function fetchCommunities(uid: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/nodes?userId=${uid}`);
      const data = await res.json();
      if (res.ok) {
        setCommunities(data);
      }
    } catch {
      setError('Failed to fetch node registry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mode === 'join' && userId) {
      fetchCommunities(userId);
      setSelectedComm(null);
      setCredentialInput('');
      setError('');
    } else if (mode === 'create') {
      setNewCommName('');
      setGeneratedCode(null);
      setError('');
    }
  }, [mode]);

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !selectedComm || !credentialInput.trim()) return;

    setLoading(true);
    setError('');

    try {
      const cleanCode = credentialInput.trim().toUpperCase();
      const res = await fetch(`${API_URL}/api/nodes/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: cleanCode })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Join Failed. Incorrect Credential.');
        setLoading(false);
        return;
      }

      router.push(`/hub/${cleanCode}`);
    } catch {
      setError('CRITICAL: Server unreachable.');
      setLoading(false);
    }
  }

  // --- RENDERERS ---
  const renderRoot = () => (
    <div className="flex flex-col items-center gap-12 w-full max-w-lg">
      <div className="text-center">
        <div className="text-6xl font-black tracking-widest font-mono mb-2 text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
          COMMUNITY
        </div>
        <div className="text-[12px] tracking-[0.6em] uppercase font-mono" style={{ color: 'var(--text-muted)' }}>
          Select Network Action
        </div>
      </div>

      <div className="flex flex-col gap-6 w-full">
        <button
          onClick={() => setMode('create')}
          disabled={!userId}
          className="w-full py-6 font-mono font-black text-white text-xl tracking-[0.3em] uppercase transition-all hover:bg-green-500/10 border disabled:opacity-30 disabled:hover:bg-transparent"
          style={{ borderColor: 'rgba(0,204,106,0.4)', background: 'linear-gradient(90deg, rgba(0,204,106,0.1), transparent)' }}
        >
          CREATE
        </button>
        <button
          onClick={() => setMode('join')}
          disabled={!userId}
          className="w-full py-6 font-mono font-black text-white text-xl tracking-[0.3em] uppercase transition-all hover:bg-blue-500/10 border disabled:opacity-30 disabled:hover:bg-transparent"
          style={{ borderColor: 'rgba(0,106,204,0.4)', background: 'linear-gradient(90deg, transparent, rgba(0,106,204,0.1))' }}
        >
          JOIN
        </button>
      </div>
{error && <div className="text-red-500 text-xs font-mono tracking-widest">{error}</div>}
    </div>
  );

  const renderCreate = () => (
    <div className="flex flex-col items-center w-full max-w-xl gap-8">
      <div className="w-full text-left font-mono mb-4 text-xs tracking-widest text-slate-500 cursor-pointer hover:text-white transition-colors" onClick={() => setMode('root')}>
        &lt;&lt; BACK TO DIRECTORY
      </div>

      {!generatedCode ? (
        <>
          <div className="text-3xl font-black tracking-widest font-mono text-white w-full text-center">INITIALIZE NODE</div>
          <form onSubmit={handleCreate} className="w-full flex flex-col gap-6 p-8 border bg-black/40" style={{ borderColor: 'rgba(0,204,106,0.3)' }}>
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-widest font-mono text-green-500">Community Name</label>
              <input
                type="text"
                maxLength={30}
                required
                placeholder="e.g. ALPHA SQUAD"
                value={newCommName}
                onChange={e => setNewCommName(e.target.value.toUpperCase())}
                disabled={loading}
                className="w-full px-6 py-4 text-xl tracking-[0.2em] font-mono font-bold text-white outline-none uppercase transition-all bg-black"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                onFocus={e => e.target.style.borderColor = '#00ff88'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>
            {error && <div className="text-[10px] font-mono text-red-500 p-3 bg-red-500/10 border border-red-500/30">{error}</div>}
            <button
              type="submit"
              disabled={loading || !newCommName.trim()}
              className="w-full py-4 font-mono font-bold text-white text-base tracking-[0.2em] uppercase transition-all hover:brightness-125 disabled:opacity-30"
              style={{ background: '#00cc6a', boxShadow: '0 0 20px rgba(0,204,106,0.2)' }}
            >
              {loading ? 'PROCESSING...' : 'INITIALIZE'}
            </button>
          </form>
        </>
      ) : (
        <div className="w-full flex flex-col items-center gap-6 p-8 border bg-green-500/5 shadow-[0_0_30px_rgba(0,204,106,0.1)]" style={{ borderColor: '#00cc6a' }}>
           <div className="text-green-500 animate-pulse font-mono flex items-center gap-2">
             <div className="w-2 h-2 bg-green-500 rounded-full" /> NODE SECURED
           </div>
           
           <div className="text-center font-mono text-slate-400 text-xs">Transmit this exact Credential to your recruits.</div>
           <div className="text-5xl font-black font-mono tracking-widest text-white border-y border-dashed py-6 w-full text-center" style={{ borderColor: 'rgba(0,204,106,0.4)' }}>
             {generatedCode}
           </div>

           <button
             onClick={() => router.push(`/hub/${generatedCode}`)}
             className="w-full py-4 mt-6 font-mono font-bold text-black text-base tracking-[0.2em] uppercase transition-all hover:brightness-125"
             style={{ background: '#00cc6a' }}
           >
             ENTER COMMAND CENTER
           </button>
        </div>
      )}
    </div>
  );

  const renderJoin = () => {
    if (selectedComm) {
      return (
        <div className="flex flex-col items-center w-full max-w-xl gap-8">
           <div className="w-full text-left font-mono mb-4 text-xs tracking-widest text-slate-500 cursor-pointer hover:text-white transition-colors" onClick={() => setSelectedComm(null)}>
             &lt;&lt; BACK TO LIST
           </div>
           
           <div className="text-3xl font-black tracking-widest font-mono text-white w-full text-center">JOIN: {selectedComm.name}</div>
           
           <form onSubmit={handleJoinSubmit} className="w-full flex flex-col gap-6 p-8 border bg-black/40" style={{ borderColor: 'rgba(0,106,204,0.3)' }}>
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-widest font-mono text-blue-400">Node Credential Code</label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Enter 8-char code"
                  value={credentialInput}
                  onChange={e => setCredentialInput(e.target.value.toUpperCase())}
                  disabled={loading}
                  className="w-full px-6 py-4 text-2xl tracking-[0.3em] font-mono font-bold text-center text-white outline-none uppercase transition-all bg-black"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                  onFocus={e => e.target.style.borderColor = '#00aaff'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
              {error && <div className="text-[10px] font-mono text-red-500 p-3 bg-red-500/10 border border-red-500/30">{error}</div>}
              <button
                type="submit"
                disabled={loading || credentialInput.length !== 8}
                className="w-full py-4 font-mono font-bold text-white text-base tracking-[0.2em] uppercase transition-all hover:brightness-125 disabled:opacity-30"
                style={{ background: '#0066cc', boxShadow: '0 0 20px rgba(0,106,204,0.2)' }}
              >
                {loading ? 'VERIFYING...' : 'DECRYPT & ENTER'}
              </button>
           </form>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center w-full max-w-4xl h-full py-12 gap-6">
        <div className="w-full flex justify-between items-end border-b pb-4 px-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
           <div className="text-2xl font-black tracking-widest font-mono text-white">PUBLIC DIRECTORY</div>
           <div className="text-xs tracking-widest text-slate-500 cursor-pointer hover:text-white" onClick={() => setMode('root')}>&lt;&lt; HOME</div>
        </div>

        <div className="w-full flex-1 min-h-0 overflow-auto flex flex-col gap-3 font-mono p-2">
           {loading ? (
             <div className="text-slate-500 text-sm animate-pulse tracking-widest">SCANNING NETWORK...</div>
           ) : communities.length === 0 ? (
             <div className="text-slate-500 text-sm tracking-widest">NO EXTERNAL NODES FOUND.</div>
           ) : (
             communities.map(comm => (
               <div key={comm.id} className="flex items-center justify-between p-5 border bg-black/50 hover:bg-white/5 transition-colors" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                 <div className="flex flex-col gap-1">
                   <div className="text-white font-bold tracking-widest text-lg">{comm.name}</div>
                   <div className="text-[10px] text-slate-500">INIT: {new Date(comm.created_at).toLocaleDateString()}</div>
                 </div>
                 <button 
                   onClick={() => {
                     if (comm.isMember && comm.code) {
                        router.push(`/hub/${comm.code}`);
                     } else {
                        setSelectedComm(comm);
                     }
                   }}
                   className={`px-6 py-3 border text-xs font-bold tracking-widest uppercase transition-all ${
                     comm.isMember 
                       ? 'text-green-400 hover:bg-green-500/20 border-green-500/40' 
                       : 'text-blue-400 hover:bg-blue-500/20 border-blue-500/40'
                   }`}
                 >
                   {comm.isMember ? 'ENTER NODE' : 'CONNECT'}
                 </button>
               </div>
             ))
           )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col items-center justify-center relative overflow-hidden text-white" style={{ background: '#050505' }}>
      <div className="absolute inset-0 grid-bg opacity-10 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-64 blur-[120px] rounded-full pointer-events-none transition-all duration-1000" 
           style={{ background: mode === 'create' ? 'rgba(0,204,106,0.05)' : mode === 'join' ? 'rgba(0,106,204,0.05)' : 'rgba(255,255,255,0.02)' }} />

      {mode === 'root' && (
        <div className="absolute top-6 left-6 z-50">
          <button
            onClick={() => router.push('/')}
            className="px-5 py-2.5 font-mono text-xs border transition-all hover:text-white uppercase tracking-widest bg-black/40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            &lt; ABORT UPLINK
          </button>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center w-full h-full justify-center">
        {mode === 'root' && renderRoot()}
        {mode === 'create' && renderCreate()}
        {mode === 'join' && renderJoin()}
      </div>
    </div>
  );
}
