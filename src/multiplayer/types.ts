import type { GameState, KillerId, PlayerInput, SurvivorClassId } from '../game/types.ts';

export type OnlineRolePreference = 'random' | 'survivor' | 'killer';

export interface OnlineMember {
  id: string;
  name: string;
  preferredClass: SurvivorClassId;
  preferredRole: OnlineRolePreference;
  preferredKiller: KillerId | 'random';
  ready: boolean;
  connected: boolean;
}

export interface OnlineRoomConfig {
  fillWithBots: boolean;
  isPublic: boolean;
}

export interface OnlineChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
}

export interface OnlineRoomSnapshot {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'ended';
  config: OnlineRoomConfig;
  members: OnlineMember[];
  chat: OnlineChatMessage[];
}

export interface PublicRoomSummary {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  fillWithBots: boolean;
  status: 'lobby' | 'playing' | 'ended';
}

export interface CompactGameState {
  phase: GameState['phase'];
  winner: GameState['winner'];
  winReason: GameState['winReason'];
  timeRemaining: number;
  elapsed: number;
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  cols: number;
  rows: number;
  breachedTileIndices: number[];
  doors: GameState['doors'];
  traps: GameState['traps'];
  barricades: GameState['barricades'];
  turrets: GameState['turrets'];
  projectiles: GameState['projectiles'];
  smileMinions: GameState['smileMinions'];
  effects: GameState['effects'];
  bloodStains: GameState['bloodStains'];
  floatingTexts: GameState['floatingTexts'];
  eventFeed: GameState['eventFeed'];
  shakeTimer: number;
  shakeIntensity: number;
  players: GameState['players'];
  soundEvents: GameState['soundEvents'];
}

export type ServerEvent =
  | { type: 'connected'; playerId: string }
  | { type: 'room:lobby'; room: OnlineRoomSnapshot }
  | { type: 'room:started'; room: OnlineRoomSnapshot; state: GameState }
  | { type: 'room:state'; state: CompactGameState }
  | { type: 'room:rematch'; room: OnlineRoomSnapshot }
  | { type: 'room:error'; message: string }
  | { type: 'pong'; ts: number };

export interface RoomSessionCredentials {
  code: string;
  playerId: string;
  sessionToken: string;
}

export interface CreateRoomPayload {
  name: string;
  preferredClass: SurvivorClassId;
  preferredRole?: OnlineRolePreference;
  preferredKiller?: KillerId | 'random';
  fillWithBots?: boolean;
  isPublic?: boolean;
}

export interface JoinRoomPayload {
  name: string;
  preferredClass: SurvivorClassId;
  preferredRole?: OnlineRolePreference;
  preferredKiller?: KillerId | 'random';
  playerId?: string;
  sessionToken?: string;
}

export interface InputEnvelope {
  playerId: string;
  sessionToken: string;
  input: PlayerInput;
}
