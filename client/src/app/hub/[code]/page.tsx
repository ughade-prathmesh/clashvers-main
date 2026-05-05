'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface HubMember {
  userId: string;
  username: string;
  role: 'ADMIN' | 'USER';
  elo: number;
}

interface Broadcast {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

interface ChatMessage {
  username: string;
  message: string;
  timestamp: number;
}

export default function HubDashboard({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [nodeData, setNodeData] = useState<any>(null);
  const [members, setMembers] = useState<HubMember[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [broadcastInput, setBroadcastInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeUsers, setActiveUsers] = useState<Set<string>>(new Set());
  const [showMembers, setShowMembers] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const API_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

  const nodeCode = resolvedParams.code.toUpperCase();

  const mRole = members.find(m => m.userId === userId)?.role || 'USER';

  useEffect(() => {
    const savedUserId = localStorage.getItem('cw_userId');
    const savedUsername = localStorage.getItem('cw_username');
    if (!savedUserId) {
      router.push('/hub');
      return;
    }
    setUserId(savedUserId);
    setUsername(savedUsername);
    fetchNodeData(savedUserId);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  async function fetchNodeData(uid: string) {
    try {
      const res = await fetch(`${API_URL}/api/nodes/${nodeCode}`);
      if (!res.ok) {
        setError('NODE NOT FOUND OR ACCESS DENIED');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setNodeData(data.node);
      setMembers(data.members);
      setBroadcasts(data.broadcasts);
      setLoading(false);

      if (data.node) {
        initSocket(localStorage.getItem('cw_username') || 'Unknown');
      }
    } catch {
      setError('CRITICAL NETWORK FAILURE');
      setLoading(false);
    }
  }

  function initSocket(uname: string) {
    if (socketRef.current) return;
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.emit('join_node_chat', { code: nodeCode, username: uname });

    socket.on('node_activity', (payload: { username: string; status: string }) => {
      setActiveUsers(prev => {
        const next = new Set(prev);
        if (payload.status === 'online') next.add(payload.username);
        else next.delete(payload.username);
        return next;
      });
    });

    socket.on('node_chat_message', (msg: ChatMessage) => {
      setChatLog(prev => [...prev, msg].slice(-100));
    });

    socket.on('node_broadcast_update', () => {
      fetch(`${API_URL}/api/nodes/${nodeCode}`)
        .then(r => r.json())
        .then(d => {
           if(d.broadcasts) setBroadcasts(d.broadcasts);
           if(d.members) setMembers(d.members);
        }).catch(()=>{});
    });
  }

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastInput.trim() || mRole !== 'ADMIN') return;
    const content = broadcastInput.trim();
    setBroadcastInput('');

    try {
      const res = await fetch(`${API_URL}/api/nodes/${nodeCode}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, content })
      });
      if (res.ok && socketRef.current) {
        socketRef.current.emit('node_broadcast_update', { code: nodeCode });
      }
    } catch (err) {
      console.error(err);
    }
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('node_chat_message', { code: nodeCode, username, message: chatInput.trim() });
    setChatInput('');
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#36393f]">
        <div className="text-white animate-pulse text-sm">ESTABLISHING SECURE CONNECTION...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#36393f] text-red-500 font-sans">
        <div className="text-4xl mb-4 font-black">ACCESS DENIED</div>
        <div>{error}</div>
        <button onClick={() => router.push('/hub')} className="mt-8 px-6 py-2 border border-red-500 hover:bg-red-500/10 rounded">RETURN</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-[#dcddde] font-sans" style={{ background: '#36393f' }}>
       {/* HEADER */}
       <header className="h-14 shrink-0 flex items-center justify-between px-6 shadow-md relative z-50" style={{ background: '#2f3136' }}>
          <div className="flex items-center gap-4">
             <button onClick={() => router.push('/hub')} className="text-[#8e9297] hover:text-white transition-colors pb-1 text-xl font-black">&lt;</button>
             <h1 className="text-lg font-bold text-white tracking-wide" style={{ wordBreak: 'break-all' }}>{nodeData?.name}</h1>
             {mRole === 'ADMIN' && (
                <div className="ml-2 flex items-center gap-2 bg-[#202225] px-3 py-1 rounded border border-[#18191c]">
                   <span className="text-[10px] text-[#72767d] uppercase tracking-wider font-bold">Invite Credential:</span>
                   <span className="text-sm font-mono text-[#5865F2] font-black tracking-widest">{nodeCode}</span>
                </div>
             )}
          </div>
          
          <div className="relative">
             <button 
               onClick={() => setShowMembers(!showMembers)} 
               className="px-4 py-1.5 rounded bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-sm transition-colors shadow"
             >
                MEMBERS
             </button>
             
             {showMembers && (
               <div className="absolute top-10 right-0 w-72 bg-[#2f3136] rounded-md shadow-2xl border border-[#202225] flex flex-col overflow-hidden z-50 max-h-[70vh]">
                  <div className="p-3 border-b border-[#202225] bg-[#202225] text-xs font-bold text-[#b9bbbe] uppercase tracking-wider">
                     Members — {members.length}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                     {members.map(m => {
                       const isOnline = activeUsers.has(m.username) || m.username === username;
                       return (
                         <div key={m.userId} className="flex items-center gap-3 p-2 rounded hover:bg-[#3ba55c]/10 cursor-default transition-colors">
                            <div className="relative">
                               <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-bold select-none">
                                 {m.username.charAt(0).toUpperCase()}
                               </div>
                               <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-[#2f3136] rounded-full ${isOnline ? 'bg-[#3ba55c]' : 'bg-[#747f8d]'}`} />
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                               <div className="flex items-center justify-between">
                                 <span className="text-sm font-semibold text-slate-200 truncate">{m.username}</span>
                                 {m.role === 'ADMIN' && <span className="text-[9px] text-[#faa61a] font-bold bg-[#faa61a]/10 px-1 rounded">ADMIN</span>}
                               </div>
                            </div>
                         </div>
                       )
                     })}
                  </div>
               </div>
             )}
          </div>
       </header>

       {/* MAIN GRID */}
       <div className="flex-1 flex overflow-hidden bg-[#36393f]">
          
          {/* LEFT SIDE: EVENTS SECTION */}
          <div className="w-1/2 flex flex-col items-center max-w-3xl p-6 relative h-full">
             <div className="w-full flex-1 flex flex-col bg-[#2f3136] rounded-lg overflow-hidden shadow-lg border border-[#202225]">
                <div className="p-4 bg-[#202225] border-b border-[#18191c]">
                   <h2 className="text-lg font-bold text-white flex items-center gap-2">
                     <span className="text-[#5865F2]">📅</span> Community Events
                   </h2>
                   <p className="text-xs text-[#b9bbbe] mt-1">Updates and announcements mapped from Admins.</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                   {broadcasts.length === 0 ? (
                     <div className="text-center text-[#72767d] italic mt-10">No events found in this community.</div>
                   ) : (
                     broadcasts.map(b => (
                       <div key={b.id} className="bg-[#36393f] rounded-md p-4 border border-[#202225] shadow drop-shadow-md relative">
                         <div className="flex flex-col items-start gap-1 mb-3 border-b border-[#4f545c] pb-2">
                            <span className="text-[14px] font-bold text-[#5865F2]">{b.author}</span>
                            <span className="text-[10px] text-[#72767d] font-semibold">
                               {new Date(b.createdAt).toLocaleDateString()} at {new Date(b.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                         </div>
                         <div className="text-[#dcddde] text-sm whitespace-pre-wrap leading-relaxed">{b.content}</div>
                       </div>
                     ))
                   )}
                </div>

                {/* ADMIN EVENT POST BOX */}
                {mRole === 'ADMIN' && (
                  <div className="p-4 bg-[#202225] border-t border-[#18191c]">
                     <form onSubmit={handleBroadcast} className="flex gap-2">
                       <input 
                         type="text" 
                         value={broadcastInput}
                         onChange={e => setBroadcastInput(e.target.value)}
                         placeholder="Announce a new event..."
                         className="flex-1 bg-[#40444b] rounded px-4 py-2 text-sm text-[#dcddde] placeholder-[#72767d] outline-none transition-all"
                       />
                       <button type="submit" disabled={!broadcastInput.trim()} className="px-5 bg-[#3ba55c] hover:bg-[#349251] disabled:opacity-50 disabled:hover:bg-[#3ba55c] text-white font-bold rounded text-sm transition-colors shadow">Post Event</button>
                     </form>
                  </div>
                )}
             </div>
          </div>

          {/* RIGHT SIDE: DISCORD STYLE CHAT */}
          <div className="w-1/2 flex flex-col h-full bg-[#36393f] border-l border-[#202225] relative">
             
             {/* Chat Header inside the chat box */}
             <div className="py-4 px-6 border-b border-[#202225] shadow-sm flex flex-col bg-[#36393f] z-10 shrink-0">
               <h3 className="text-white font-bold flex items-center gap-2 text-xl tracking-tight">
                 <span className="text-[#8e9297] text-2xl font-light">#</span> general-chat
               </h3>
               <p className="text-xs text-[#b9bbbe] mt-1 pl-6">Welcome to the beginning of the #{nodeData?.name} channel.</p>
             </div>

             {/* Chat Log */}
             <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
               {chatLog.length === 0 ? (
                 <div className="my-auto text-center text-[#72767d]">Say hello to the community!</div>
               ) : (
                 chatLog.map((chat, i) => {
                   const isMe = chat.username === username;
                   return (
                     <div key={i} className={`flex gap-4 px-2 py-1 -mx-2 rounded hover:bg-[#32353b] transition-colors`}>
                       <div className={`w-10 h-10 mt-0.5 shrink-0 rounded-full flex items-center justify-center text-white font-bold select-none ${isMe ? 'bg-[#5865F2]' : 'bg-[#4f545c]'}`}>
                         {chat.username.charAt(0).toUpperCase()}
                       </div>
                       <div className="flex flex-col min-w-0 flex-1">
                         <div className="flex items-baseline gap-2">
                           <span className={`text-[15px] font-semibold cursor-pointer hover:underline ${isMe ? 'text-white' : 'text-[#f2f3f5]'}`}>{chat.username}</span>
                           <span className="text-xs text-[#72767d] font-semibold">
                             {new Date(chat.timestamp || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </span>
                         </div>
                         <div className="text-[#dcddde] text-[15px] leading-relaxed break-words">{chat.message}</div>
                       </div>
                     </div>
                   );
                 })
               )}
               <div ref={chatEndRef} />
             </div>

             {/* Chat Input */}
             <form onSubmit={sendChat} className="mt-auto px-4 relative mb-6 shrink-0">
               <input 
                 type="text" 
                 value={chatInput}
                 onChange={e => setChatInput(e.target.value)}
                 className="w-full bg-[#383a40] rounded-lg px-4 py-3 placeholder-[#72767d] outline-none text-[#dcddde]"
                 placeholder={`Message #general-chat`}
               />
             </form>
          </div>
       </div>
    </div>
  );
}
