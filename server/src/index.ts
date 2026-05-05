import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Types ──────────────────────────────────────────────────────────────────

interface PlayerState {
  socketId: string;
  userId: string;
  username: string;
  elo: number;
  codeLength: number;
  code: string;
  language: string;
  lastUpdate: number;
  updateCount: number;
  windowStart: number;
  drawAttempts: number;
}

interface Room {
  roomId: string;
  matchId: string;
  creatorId: string;
  creatorElo: number;
  eloRange: number;
  eloExpandTimer?: ReturnType<typeof setInterval>;
  problem: { id: string; title: string; description: string; examples: string };
  players: Map<string, PlayerState>;
  status: "waiting" | "active" | "completed";
  createdAt: number;
  matchStarted?: number;
  matchTimer?: ReturnType<typeof setTimeout>;
  drawRequestedBy?: string | null;
  finishRequestedBy?: string | null;
}

// ── State ──────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();
const socketToUser = new Map<string, string>();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 1000;
const MATCH_DURATION = (Number(process.env.MATCH_DURATION_MINUTES) || 15) * 60 * 1000;
const ELO_START_RANGE = 200;
const ELO_EXPAND_STEP = 50;
const ELO_EXPAND_INTERVAL = 15_000; // ms
const ELO_MAX_RANGE = 600;

// ── Problems ───────────────────────────────────────────────────────────────

const PROBLEMS = [
  { id: "two-sum", title: "Two Sum", description: "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target. You may assume exactly one solution exists.", examples: "Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n\nInput: nums = [3,2,4], target = 6\nOutput: [1,2]" },
  { id: "reverse-string", title: "Reverse String", description: "Write a function that reverses a string. The input string is given as an array of characters `s`. Modify the input array in-place with O(1) extra memory.", examples: 'Input: s = ["h","e","l","l","o"]\nOutput: ["o","l","l","e","h"]' },
  { id: "fizzbuzz", title: "FizzBuzz", description: 'Given an integer n, return a string array where answer[i] is "FizzBuzz" if divisible by 3 and 5, "Fizz" if by 3, "Buzz" if by 5, otherwise the number as a string.', examples: 'Input: n = 5\nOutput: ["1","2","Fizz","4","Buzz"]' },
  { id: "palindrome", title: "Valid Palindrome", description: "A phrase is a palindrome if, after removing non-alphanumeric chars and lowercasing, it reads the same forward and backward. Return true/false.", examples: 'Input: s = "A man, a plan, a canal: Panama"\nOutput: true' },
  { id: "max-subarray", title: "Maximum Subarray", description: "Given an integer array nums, find the subarray with the largest sum and return its sum.", examples: "Input: nums = [-2,1,-3,4,-1,2,1,-5,4]\nOutput: 6" },
];

// ── Server ─────────────────────────────────────────────────────────────────

const app = express();

// Use wildcard CORS to allow all connections dynamically (for easy Vercel deployments)
const corsOptions = { origin: "*" };
app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("CodeWars/ClashVers WebSocket Backend is actively running!");
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ── Helpers ────────────────────────────────────────────────────────────────

function getRoomBySocket(socketId: string): Room | null {
  const roomId = socketToRoom.get(socketId);
  return roomId ? (rooms.get(roomId) ?? null) : null;
}

function isRateLimited(player: PlayerState): boolean {
  const now = Date.now();
  if (now - player.windowStart > RATE_LIMIT_WINDOW) { player.windowStart = now; player.updateCount = 0; }
  player.updateCount++;
  return player.updateCount > RATE_LIMIT_MAX;
}

function cleanupRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.matchTimer) clearTimeout(room.matchTimer);
  if (room.eloExpandTimer) clearInterval(room.eloExpandTimer);
  for (const [, player] of room.players) {
    socketToRoom.delete(player.socketId);
    socketToUser.delete(player.socketId);
  }
  rooms.delete(roomId);
  console.log(`[cleanup] Room ${roomId} destroyed.`);
}

function getRandomProblem() {
  return PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)];
}

/** Hash a password for storage using SHA256 and a simple static salt for simplicity. */
function hashPassword(password: string): string {
  const salt = "codewars_secret_salt_1337";
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}

/** Fetch player ELO from Supabase profiles. Does NOT auto-create anymore. */
async function fetchPlayerElo(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("elo")
      .eq("id", userId)
      .single();
      
    if (error || !data) return 1000;
    return (data as any).elo ?? 1000;
  } catch (err) {
    console.error("[fetch-elo-error]", err);
    return 1000;
  }
}

/**
 * Call the Supabase update_elo_and_stats RPC and return the ELO deltas.
 * For draws, p_winner_id / p_loser_id are still required by the function —
 * we pass p1 as "winner" and p2 as "loser" and set p_is_draw = true.
 */
async function callEloUpdate(
  matchId: string,
  winnerId: string,
  loserId: string,
  isDraw: boolean
): Promise<{ winnerDelta: number; loserDelta: number }> {
  try {
    console.log(`[callEloUpdate] calling RPC with matchId=${matchId} winnerId=${winnerId} loserId=${loserId} isDraw=${isDraw}`);
    const { error } = await supabase.rpc("update_elo_and_stats", {
      p_winner_id: winnerId,
      p_loser_id: loserId,
      p_match_id: matchId,
      p_is_draw: isDraw,
    });
    if (error) {
      console.error("[elo-rpc-error]", error.message, error.details, error.hint);
      return { winnerDelta: 0, loserDelta: 0 };
    }
    console.log("[callEloUpdate] RPC returned successfully, fetching deltas from match row...");
    // Fetch stamped deltas from the match row
    const { data: match, error: fetchErr } = await supabase
      .from("matches")
      .select("player1_elo_delta, player2_elo_delta, player1_id, player2_id")
      .eq("id", matchId)
      .single();
    if (fetchErr) {
      console.error("[callEloUpdate] fetch match deltas error:", fetchErr.message);
      return { winnerDelta: 0, loserDelta: 0 };
    }
    if (!match) {
      console.error("[callEloUpdate] no match row found for id:", matchId);
      return { winnerDelta: 0, loserDelta: 0 };
    }
    const m = match as any;
    console.log(`[callEloUpdate] match row: p1_delta=${m.player1_elo_delta} p2_delta=${m.player2_elo_delta} p1_id=${m.player1_id} p2_id=${m.player2_id}`);
    const winnerDelta = m.player1_id === winnerId ? m.player1_elo_delta : m.player2_elo_delta;
    const loserDelta  = m.player1_id === loserId  ? m.player1_elo_delta : m.player2_elo_delta;
    return { winnerDelta: winnerDelta ?? 0, loserDelta: loserDelta ?? 0 };
  } catch (err) {
    console.error("[elo-update-error]", err);
    return { winnerDelta: 0, loserDelta: 0 };
  }
}

/** Heuristic code scorer — higher = more complete solution */
function scoreCode(code: string): number {
  const lines = code.split("\n").filter((l) => {
    const t = l.trim();
    return t.length > 3 && !t.startsWith("//") && !t.startsWith("#") && t !== "{" && t !== "}" && t !== "};" && t !== "pass";
  });
  const patterns = (code.match(/\b(for|while|if|else|return|map|filter|reduce|forEach|indexOf|includes|sort|slice|splice|push|parseInt|Object\.|Math\.)\b/g) || []).length;
  return lines.length * 2 + patterns * 3;
}

async function callGeminiEvaluation(problem: string, p1Code: string, p2Code: string) {
  try {
    const prompt = `You are an expert technical interviewer evaluating two candidates.
The problem is:
${problem}

Candidate 1 Code (player1):
\`\`\`
${p1Code}
\`\`\`

Candidate 2 Code (player2):
\`\`\`
${p2Code}
\`\`\`

Evaluate both candidates based on Correctness, Time/Space Complexity, and Line-by-Line Code Cleanliness.
Explain everything in VERY SIMPLE, beginner-friendly terms. Avoid overly complex jargon and explain any concept (like Big-O) using easy analogies if needed.
Decide who wins. Return ONLY parseable JSON matching exactly this schema, without markdown wrappers:
{
  "winner": "player1" | "player2" | "draw",
  "overall_verdict": "Short 1-2 sentence summary in simple terms of why the winner was chosen.",
  "p1_evaluation": {
    "feedback": "Simple, beginner-friendly review of their logic and time complexity.",
    "improvements": "Easy-to-understand advice or optimizations on where they could improve."
  },
  "p2_evaluation": {
    "feedback": "Simple, beginner-friendly review of their logic and time complexity.",
    "improvements": "Easy-to-understand advice or optimizations on where they could improve."
  }
}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
    });
    const data = await res.json();
    
    if (!(data as any).candidates || (data as any).candidates.length === 0) {
      console.error("[gemini-data-error] No candidates returned from Gemini API. Raw Data:", JSON.stringify(data));
      throw new Error("No candidates returned");
    }

    let text = (data as any).candidates[0].content.parts[0].text;
    
    // Fallback: strip markdown json wrappers if present
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/,"").trim();
    }
    
    return JSON.parse(text);
  } catch (err) {
    console.error("[gemini-error]", err);
    return { winner: "draw", overall_verdict: "AI Evaluation failed. Defaulting to draw.", p1_evaluation: null, p2_evaluation: null };
  }
}

async function evaluateAndReveal(room: Room, forcedWinner?: "player1" | "player2" | "draw") {
  if (room.status === "completed") return;
  room.status = "completed";
  if (room.matchTimer) { clearTimeout(room.matchTimer); room.matchTimer = undefined; }
  if (room.eloExpandTimer) { clearInterval(room.eloExpandTimer); room.eloExpandTimer = undefined; }

  const players = Array.from(room.players.values());
  if (players.length < 2) return;
  const [p1, p2] = players;

  // Tell clients AI is thinking
  io.to(room.roomId).emit("ai_evaluating");
  await new Promise((res) => setTimeout(res, 2500));

  let winner: "player1" | "player2" | "draw";
  let explanation = "";
  let evaluations = {};

  if (forcedWinner) {
    winner = forcedWinner;
    explanation = "Match ended early via mutual agreement or connection forfeit.";
  } else if (process.env.GEMINI_API_KEY) {
    const aiResult = await callGeminiEvaluation(room.problem.description, p1.code, p2.code);
    winner = aiResult.winner;
    explanation = aiResult.overall_verdict;
    if (aiResult.p1_evaluation && aiResult.p2_evaluation) {
      evaluations = { [p1.userId]: aiResult.p1_evaluation, [p2.userId]: aiResult.p2_evaluation };
    }
    console.log(`[ai-judge] Gemini judged: ${winner}`);
  } else {
    const s1 = scoreCode(p1.code);
    const s2 = scoreCode(p2.code);
    if (s1 === 0 && s2 === 0) winner = "draw";
    else if (s1 > s2 * 1.15) winner = "player1";
    else if (s2 > s1 * 1.15) winner = "player2";
    else winner = "draw";
    explanation = `Evaluation fallback used (No GEMINI_API_KEY). Player 1 Score: ${s1}, Player 2 Score: ${s2}.`;
    console.log(`[ai-judge] p1_score=${s1} p2_score=${s2} winner=${winner}`);
  }

  console.log(`[evaluate] matchId=${room.matchId} winner=${winner}`);
  console.log(`[evaluate] p1=${p1.username}(${p1.userId}) p2=${p2.username}(${p2.userId})`);

  try {
    const { error: matchUpdateError } = await supabase.from("matches").update({ status: "completed", player1_code: p1.code, player2_code: p2.code, player1_lang: p1.language, player2_lang: p2.language, winner, ended_at: new Date().toISOString() }).eq("id", room.matchId);
    if (matchUpdateError) console.error("[match-update-error]", matchUpdateError.message);
    else console.log("[match-update] ✓ match marked completed");
  } catch (err) {
    console.error("[match-update-exception]", err);
  }

  // ── ELO Update ─────────────────────────────────────────────────────────
  const eloDeltas: Record<string, number> = {};
  try {
    const isDraw = winner === "draw";
    const winnerId = isDraw ? p1.userId : (winner === "player1" ? p1.userId : p2.userId);
    const loserId  = isDraw ? p2.userId : (winner === "player1" ? p2.userId : p1.userId);
    console.log(`[elo] calling RPC: matchId=${room.matchId} winnerId=${winnerId} loserId=${loserId} isDraw=${isDraw}`);

    const { winnerDelta, loserDelta } = await callEloUpdate(room.matchId, winnerId, loserId, isDraw);
    eloDeltas[winnerId] = winnerDelta;
    eloDeltas[loserId]  = loserDelta;
    console.log(`[elo] result → ${p1.username}: ${eloDeltas[p1.userId] >= 0 ? "+" : ""}${eloDeltas[p1.userId]}  |  ${p2.username}: ${eloDeltas[p2.userId] >= 0 ? "+" : ""}${eloDeltas[p2.userId]}`);
    
    if (winnerDelta === 0 && loserDelta === 0 && !isDraw) {
      console.error("[elo] ⚠ BOTH DELTAS ARE ZERO for a non-draw — RPC likely failed silently!");
    }
  } catch (err) {
    console.error("[elo-update-error]", err);
  }

  io.to(room.roomId).emit("reveal", {
    winner,
    explanation,
    evaluations,
    eloDeltas,
    players: [
      { userId: p1.userId, username: p1.username, code: p1.code, language: p1.language, elo: p1.elo },
      { userId: p2.userId, username: p2.username, code: p2.code, language: p2.language, elo: p2.elo },
    ],
  });

  setTimeout(() => cleanupRoom(room.roomId), 30_000);
}

// ── REST ───────────────────────────────────────────────────────────────────

app.get("/health", (_, res) => res.json({ status: "ok", rooms: rooms.size }));
app.get("/problems", (_, res) => res.json(PROBLEMS));

/** Leaderboard — top 20 players by ELO */
app.get("/leaderboard", async (_, res) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, elo, wins, losses, avatar_url")
      .order("elo", { ascending: false })
      .limit(20);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  } catch {
    res.status(500).json({ error: "Leaderboard unavailable" });
  }
});

/** Single player profile */
app.get("/profile/:userId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, elo, wins, losses")
      .eq("id", req.params.userId)
      .single();
    if (error || !data) { res.json({ elo: 1000, wins: 0, losses: 0 }); return; }
    res.json(data);
  } catch {
    res.json({ elo: 1000, wins: 0, losses: 0 });
  }
});

/** Match history for a player — last 20 completed matches */
app.get("/matches/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const { data, error } = await supabase
      .from("matches")
      .select("id, status, problem_title, winner, player1_id, player2_id, player1_elo_delta, player2_elo_delta, ended_at, created_at")
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(20);
    if (error) { res.status(500).json({ error: error.message }); return; }

    // Resolve usernames for display
    const playerIds = new Set<string>();
    for (const m of data ?? []) {
      if (m.player1_id) playerIds.add(m.player1_id);
      if (m.player2_id) playerIds.add(m.player2_id);
    }
    const usernameMap: Record<string, string> = {};
    if (playerIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", Array.from(playerIds));
      for (const p of profiles ?? []) usernameMap[(p as any).id] = (p as any).username;
    }

    const enriched = (data ?? []).map((m: any) => ({
      ...m,
      player1_username: usernameMap[m.player1_id] ?? "Unknown",
      player2_username: m.player2_id ? (usernameMap[m.player2_id] ?? "Unknown") : null,
    }));

    res.json(enriched);
  } catch {
    res.status(500).json({ error: "Match history unavailable" });
  }
});

// ── HUB (Nodes) ────────────────────────────────────────────────────────────

/** Get all active nodes (Directory) */
app.get("/api/nodes", async (req, res) => {
  const { userId } = req.query;
  try {
    const { data: nodes, error } = await supabase.from("nodes").select("id, name, created_at, code").order("created_at", { ascending: false });
    if (error) { res.status(500).json({ error: error.message }); return; }

    let memberships: any[] = [];
    if (userId) {
      const { data: mems } = await supabase.from("node_memberships").select("node_id").eq("user_id", userId);
      memberships = mems || [];
    }
    const memSet = new Set(memberships.map((m: any) => m.node_id));

    const enriched = (nodes ?? []).map((n: any) => ({
      id: n.id,
      name: n.name,
      created_at: n.created_at,
      isMember: memSet.has(n.id),
      code: memSet.has(n.id) ? n.code : undefined
    }));

    res.json(enriched);
  } catch {
    res.status(500).json({ error: "Failed to fetch Nodes" });
  }
});

/** Create a new Node */
app.post("/api/nodes/create", async (req, res) => {
  const { userId, code, name } = req.body;
  if (!userId || !code || !name) { res.status(400).json({ error: "Missing fields" }); return; }
  try {
    const codeUpper = code.toUpperCase();
    const { data: newNode, error: createError } = await supabase.from("nodes")
      .insert({ code: codeUpper, name, description: "Encrypted Local Network" })
      .select().single();
    if (createError || !newNode) { res.status(500).json({ error: "Failed to initialize Node. Integrity error." }); return; }
    
    await supabase.from("node_memberships").insert({ node_id: newNode.id, user_id: userId, role: "ADMIN" });
    res.json({ node: newNode, role: "ADMIN" });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** Join an existing Node via Credential */
app.post("/api/nodes/join", async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) { res.status(400).json({ error: "userId and credential required" }); return; }

  try {
    const codeUpper = code.toUpperCase();
    let { data: node, error: eqErr } = await supabase.from("nodes").select("*").eq("code", codeUpper).maybeSingle();
    
    if (!node) {
      res.status(404).json({ error: "Invalid Credential Code" });
      return;
    }

    // Check membership
    const { data: membership } = await supabase.from("node_memberships")
      .select("*").eq("node_id", node.id).eq("user_id", userId).maybeSingle();

    let role = "USER";
    if (!membership) {
      const { error: memErr } = await supabase.from("node_memberships")
        .insert({ node_id: node.id, user_id: userId, role });
      if (memErr) { res.status(500).json({ error: "Failed to join Node" }); return; }
    } else {
      role = membership.role;
    }

    res.json({ node, role });
  } catch (err) {
    console.error("[node-join-error]", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/** Get Node Data (Members & Broadcasts) */
app.get("/api/nodes/:code", async (req, res) => {
  try {
    const { data: node, error: nErr } = await supabase.from("nodes").select("*").eq("code", req.params.code).single();
    if (nErr || !node) { res.status(404).json({ error: "Node offline" }); return; }

    const { data: membersRows } = await supabase.from("node_memberships")
      .select("user_id, role, profiles!inner(username, elo)")
      .eq("node_id", node.id);

    const members = (membersRows ?? []).map((m: any) => ({
      userId: m.user_id,
      role: m.role,
      username: m.profiles?.username || "Unknown Unit",
      elo: m.profiles?.elo || 1000
    }));

    const { data: broadcastRows } = await supabase.from("broadcasts")
      .select("id, content, created_at, profiles!inner(username)")
      .eq("node_id", node.id)
      .order("created_at", { ascending: false });

    const broadcasts = (broadcastRows ?? []).map((b: any) => ({
      id: b.id,
      content: b.content,
      createdAt: b.created_at,
      author: b.profiles?.username || "SYSADMIN"
    }));

    res.json({ node, members, broadcasts });
  } catch (err) {
    console.error("[node-fetch-error]", err);
    res.status(500).json({ error: "Failed to fetch Node data" });
  }
});

/** Publish Broadcast (Admin Only) */
app.post("/api/nodes/:code/broadcast", async (req, res) => {
  const { userId, content } = req.body;
  if (!userId || !content) { res.status(400).json({ error: "Missing fields" }); return; }

  try {
    const { data: node } = await supabase.from("nodes").select("id").eq("code", req.params.code).single();
    if (!node) { res.status(404).json({ error: "Node offline" }); return; }

    const { data: membership } = await supabase.from("node_memberships")
      .select("role").eq("node_id", node.id).eq("user_id", userId).single();
    
    if (!membership || membership.role !== "ADMIN") {
      res.status(403).json({ error: "Clearance Level Insufficient" }); return;
    }

    const { data: broadcast } = await supabase.from("broadcasts")
      .insert({ node_id: node.id, author_id: userId, content })
      .select("id, content, created_at, profiles!inner(username)").single();

    res.json({ success: true, broadcast });
  } catch (err) {
    console.error("[broadcast-error]", err);
    res.status(500).json({ error: "Failed to broadcast" });
  }
});

app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and Password required" });

  try {
    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    
    // Check if username already exists
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) return res.status(400).json({ error: "Username already taken" });

    const { error } = await supabase.from("profiles").insert({
      id: userId,
      username,
      password_hash: passwordHash,
      elo: 1000,
      wins: 0,
      losses: 0
    });

    if (error) throw error;
    res.json({ userId, username, elo: 1000 });
  } catch (err: any) {
    console.error("[register-error]", err);
    res.status(500).json({ error: "Failed to create account" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and Password required" });

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, password_hash, elo")
      .eq("username", username)
      .single();

    if (error || !data) return res.status(401).json({ error: "Invalid username or password" });

    const user = data as any;
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({ userId: user.id, username: user.username, elo: user.elo });
  } catch (err: any) {
    console.error("[login-error]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/room/create", async (req, res) => {
  const { userId, username } = req.body as { userId: string; username: string };
  if (!userId || !username) { res.status(400).json({ error: "Missing userId or username" }); return; }

  // Fetch this player's ELO for matchmaking
  const playerElo = await fetchPlayerElo(userId);
  console.log(`[matchmaking] ${username} ELO=${playerElo} searching for room…`);

  // Find a compatible waiting room within ELO range
  for (const [, room] of rooms) {
    if (
      room.status === "waiting" &&
      room.creatorId !== userId &&
      room.players.size < 2 &&
      Math.abs(playerElo - room.creatorElo) <= room.eloRange
    ) {
      console.log(`[matchmaking] ${username} (${playerElo}) joined room created by ELO ${room.creatorElo} (range ±${room.eloRange})`);
      res.json({ roomId: room.roomId, joined: true, playerElo });
      return;
    }
  }

  // No compatible room found — create a new one synchronously in memory FIRST
  const problem = getRandomProblem();
  const matchId: string = crypto.randomUUID();

  const newRoom: Room = {
    roomId: matchId,
    matchId,
    creatorId: userId,
    creatorElo: playerElo,
    eloRange: ELO_START_RANGE,
    problem,
    players: new Map(),
    status: "waiting",
    createdAt: Date.now(),
    drawRequestedBy: null,
    finishRequestedBy: null,
  };

  // Expand ELO range every 15 seconds to avoid infinite queuing
  newRoom.eloExpandTimer = setInterval(() => {
    if (newRoom.status !== "waiting") {
      clearInterval(newRoom.eloExpandTimer);
      return;
    }
    newRoom.eloRange = Math.min(newRoom.eloRange + ELO_EXPAND_STEP, ELO_MAX_RANGE);
    console.log(`[matchmaking] Room ${matchId} ELO range expanded → ±${newRoom.eloRange}`);
  }, ELO_EXPAND_INTERVAL);

  rooms.set(matchId, newRoom); // Atomic synchronous addition
  console.log(`[matchmaking] ${username} (${playerElo}) created room ${matchId} (range ±${ELO_START_RANGE})`);
  
  // Asynchronously register match to Database without yielding loop locally
  try {
    supabase.from("matches").insert({ id: matchId, player1_id: userId, problem_id: problem.id, problem_title: problem.title, status: "waiting" }).then(({error}) => {
      if (error) console.error("[Match Insert Error]:", error);
    });
  } catch (err) {
    console.error("[Match Insert Exception]:", err);
  }

  res.json({ roomId: matchId, joined: false, playerElo });
});

// ── Sockets ────────────────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  // JOIN ROOM
  socket.on("join_room", async ({ roomId, userId, username, language = "javascript" }: { roomId: string; userId: string; username: string; language?: string }) => {
    const room = rooms.get(roomId);
    if (!room) { socket.emit("error_msg", { message: "Room not found" }); return; }
    if (room.players.size >= 2) { socket.emit("error_msg", { message: "Room is full" }); return; }
    if (room.status === "completed") { socket.emit("error_msg", { message: "Match already over" }); return; }

    if (room.players.has(userId)) {
      const old = room.players.get(userId)!;
      socketToRoom.delete(old.socketId);
      socketToUser.delete(old.socketId);
    }

    const playerElo = await fetchPlayerElo(userId);
    const playerState: PlayerState = { socketId: socket.id, userId, username, elo: playerElo, codeLength: 0, code: "", language, lastUpdate: 0, updateCount: 0, windowStart: Date.now(), drawAttempts: 0 };
    room.players.set(userId, playerState);
    socketToRoom.set(socket.id, roomId);
    socketToUser.set(socket.id, userId);
    socket.join(roomId);
    console.log(`[join] ${username} (ELO ${playerElo}) → room ${roomId}`);

    socket.emit("room_joined", {
      roomId, matchId: room.matchId, problem: room.problem, status: room.status,
      players: Array.from(room.players.values()).map((p) => ({ userId: p.userId, username: p.username, language: p.language, codeLength: p.codeLength, elo: p.elo })),
    });

    if (room.players.size === 2) {
      room.status = "active";
      if (room.eloExpandTimer) { clearInterval(room.eloExpandTimer); room.eloExpandTimer = undefined; }
      const playerList = Array.from(room.players.values());
      try { await supabase.from("matches").update({ status: "active", player2_id: playerList[1].userId, started_at: new Date().toISOString() }).eq("id", room.matchId); } catch { /* local */ }

      const startedAt = Date.now();
      room.matchStarted = startedAt;

      io.to(roomId).emit("match_start", {
        players: playerList.map((p) => ({ userId: p.userId, username: p.username, language: p.language, elo: p.elo })),
        problem: room.problem, duration: MATCH_DURATION, startedAt,
      });

      room.matchTimer = setTimeout(async () => {
        if (room.status === "active") {
          console.log(`[timer] Room ${roomId} time up — AI evaluating`);
          await evaluateAndReveal(room);
        }
      }, MATCH_DURATION);

      console.log(`[match_start] Room ${roomId} — ${MATCH_DURATION / 60000}min | ELO: ${playerList[0].elo} vs ${playerList[1].elo}`);
    } else {
      socket.emit("waiting_for_opponent");
    }
  });

  // CODE UPDATE (anti-cheat: only broadcast length)
  socket.on("code_update", ({ code, language }: { code: string; language: string }) => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    if (!room || !userId || room.status !== "active") return;
    const player = room.players.get(userId);
    if (!player) return;
    if (isRateLimited(player)) { socket.emit("rate_limited", { message: "Max 5 updates/sec" }); return; }
    player.code = code; player.codeLength = code.length; player.language = language; player.lastUpdate = Date.now();
    socket.to(room.roomId).emit("opponent_code_length", { userId, codeLength: code.length, language });
  });

  // REQUEST DRAW
  socket.on("request_draw", () => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    if (!room || !userId || room.status !== "active" || room.drawRequestedBy) return;
    const player = room.players.get(userId);
    if (!player) return;
    if (player.drawAttempts >= 3) {
      socket.emit("error_msg", { message: "Maximum 3 draw attempts allowed per match." });
      return;
    }
    player.drawAttempts++;
    room.drawRequestedBy = userId;
    socket.to(room.roomId).emit("draw_requested", { userId, username: player.username });
    setTimeout(() => {
      if (room.drawRequestedBy === userId) { room.drawRequestedBy = null; io.to(room.roomId).emit("draw_expired"); }
    }, 30_000);
  });

  // CONFIRM DRAW
  socket.on("confirm_draw", async () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== "active" || !room.drawRequestedBy) return;
    room.drawRequestedBy = null;
    await evaluateAndReveal(room, "draw");
  });

  // REJECT DRAW
  socket.on("reject_draw", () => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    if (!room) return;
    room.drawRequestedBy = null;
    const player = room.players.get(userId!);
    io.to(room.roomId).emit("draw_rejected", { username: player?.username ?? "Opponent" });
  });

  // REQUEST FINISH EARLY
  socket.on("request_finish", () => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    if (!room || !userId || room.status !== "active" || room.finishRequestedBy) return;
    room.finishRequestedBy = userId;
    const player = room.players.get(userId);
    socket.to(room.roomId).emit("finish_requested", { userId, username: player?.username ?? "Opponent" });
    setTimeout(() => {
      if (room.finishRequestedBy === userId) { room.finishRequestedBy = null; io.to(room.roomId).emit("finish_expired"); }
    }, 30_000);
  });

  // CONFIRM FINISH EARLY
  socket.on("confirm_finish", async () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== "active" || !room.finishRequestedBy) return;
    room.finishRequestedBy = null;
    console.log(`[match_end] Room ${room.roomId} ended early by mutual agreement.`);
    await evaluateAndReveal(room);
  });

  // REJECT FINISH EARLY
  socket.on("reject_finish", () => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    if (!room) return;
    room.finishRequestedBy = null;
    const player = room.players.get(userId!);
    io.to(room.roomId).emit("finish_rejected", { username: player?.username ?? "Opponent" });
  });

  // CHAT
  socket.on("chat_message", ({ message }: { message: string }) => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    if (!room || !userId) return;
    const player = room.players.get(userId);
    if (!player) return;
    const safe = message.slice(0, 200).replace(/</g, "&lt;");
    io.to(room.roomId).emit("chat_message", { userId, username: player.username, message: safe, timestamp: Date.now() });
  });

  // HUB CHAT
  socket.on("join_node_chat", ({ code, username }: { code: string; username: string }) => {
    const nodeRoom = `node_${code}`;
    socket.join(nodeRoom);
    console.log(`[hub] ${username} joined socket channel ${nodeRoom}`);
    // Emit purely for Live User Directory tracking in real-time, although we use DB for standard members
    socket.to(nodeRoom).emit("node_activity", { username, status: "online" });
  });

  socket.on("node_chat_message", ({ code, username, message }: { code: string; username: string; message: string }) => {
    const nodeRoom = `node_${code}`;
    const safe = message.slice(0, 500).replace(/</g, "&lt;");
    io.to(nodeRoom).emit("node_chat_message", { username, message: safe, timestamp: Date.now() });
  });

  socket.on("node_broadcast_update", ({ code }: { code: string }) => {
    // Admin sent a broadcast via REST, now ping clients to refetch
    io.to(`node_${code}`).emit("node_broadcast_update");
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    const room = getRoomBySocket(socket.id);
    const userId = socketToUser.get(socket.id);
    console.log(`[disconnect] ${socket.id}`);
    if (room && userId) {
      const player = room.players.get(userId);
      room.players.delete(userId);
      socketToRoom.delete(socket.id);
      socketToUser.delete(socket.id);
      if (room.status === "active" && player) {
        socket.to(room.roomId).emit("opponent_disconnected", { username: player.username, message: `${player.username} disconnected. You win by forfeit!` });
        setTimeout(async () => {
          if (room.status !== "completed") {
            room.status = "completed";
            try { await supabase.from("matches").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", room.matchId); } catch { /* local */ }
            cleanupRoom(room.roomId);
          }
        }, 5000);
      } else if (room.players.size === 0) {
        cleanupRoom(room.roomId);
      }
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`\n🚀 clashvers server started → http://localhost:${PORT}\n`));


