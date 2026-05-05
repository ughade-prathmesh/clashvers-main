export interface Player {
  userId: string;
  username: string;
  language: string;
  codeLength?: number;
  elo?: number;
}

export interface Problem {
  id: string;
  title: string;
  description: string;
  examples: string;
}

export interface RevealedPlayer {
  userId: string;
  username: string;
  code: string;
  language: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  matchId: string;
  problem: Problem;
  status: 'waiting' | 'active' | 'completed';
  players: Player[];
}

export interface MatchStartPayload {
  players: Player[];
  problem: Problem;
}

export interface OpponentCodeLengthPayload {
  userId: string;
  codeLength: number;
  language: string;
}

export interface RevealPayload {
  winner: 'player1' | 'player2' | 'draw';
  explanation: string;
  evaluations?: {
    [userId: string]: { feedback: string; improvements: string };
  };
  eloDeltas?: Record<string, number>;
  players: RevealedPlayer[];
}

export interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: number;
}

export type GameStatus = 'idle' | 'waiting' | 'active' | 'revealed';
