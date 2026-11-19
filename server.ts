import crypto from 'crypto';
import fs from 'fs';
import express, { type Response as ExpressResponse } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DEFAULT_UNLOCKED_CLASSES,
  DEFAULT_UNLOCKED_KILLERS,
  KILLER_PRICES,
  SURVIVOR_PRICES,
} from './src/game/constants.ts';
import { type ParticipantConfig, createInitialGameState, stepGame } from './src/game/engine.ts';
import type { BotTier, GameState, KillerId, PlayerInput, SurvivorClassId } from './src/game/types.ts';
import type {
  CompactGameState,
  OnlineChatMessage,
  OnlineMember,
  OnlineRolePreference,
  OnlineRoomConfig,
  OnlineRoomSnapshot,
  PublicRoomSummary,
  ServerEvent,
} from './src/multiplayer/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_CLASSES: SurvivorClassId[] = [
  'doctor',
  'engineer',
  'fighter',
  'trapper',
  'runner',
  'builder',
  'protector',
  'bomber',
  'chaplain',
];
const VALID_ROLES: OnlineRolePreference[] = ['random', 'survivor', 'killer'];
const VALID_KILLERS: (KillerId | 'random')[] = [
  'random',
  'sawblooder',
  'jumper',
  'juggernaut',
  'smile',
  'hungry',
  'darkness',
];
const VALID_BOT_TIERS: (BotTier | 'random')[] = ['random', 'noob', 'normal', 'pro'];

interface InternalMember {
  id: string;
  sessionToken: string;
  authUsernameLower?: string;
  name: string;
  preferredClass: SurvivorClassId;
  preferredRole: OnlineRolePreference;
  preferredKiller: KillerId | 'random';
  ready: boolean;
  ws: WebSocket | null;
  sseRes: ExpressResponse | null;
  lastSeenAt: number;
  input: PlayerInput;
}

interface GameRoom {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'ended';
  config: OnlineRoomConfig;
  members: InternalMember[];
  chat: OnlineChatMessage[];
  state: GameState | null;
  breachedTiles: Set<number>;
  interval: ReturnType<typeof setInterval> | null;
  lastActivityAt: number;
  createdAt: number;
}

const rooms = new Map<string, GameRoom>();

// --- CUSTOM USERNAME + PASSWORD AUTH + ECONOMY STORE (NO EMAIL) ---
interface StoredUser {
  username: string;
  usernameLower: string;
  salt: string;
  hash: string;
  createdAt: number;
  coins: number;
  unlockedClasses: SurvivorClassId[];
  unlockedKillers: KillerId[];
  claimedMatchIds: string[];
  builderPurchased?: boolean;
}

const AUTH_DATA_FILE = path.resolve(__dirname, '.zone51-users.json');
const registeredUsers = new Map<string, StoredUser>(); // key: usernameLower
const authSessions = new Map<string, string>(); // key: token -> username

function normalizeStoredUser(raw: any): StoredUser {
  const clsSet = new Set<SurvivorClassId>(DEFAULT_UNLOCKED_CLASSES);
  if (Array.isArray(raw?.unlockedClasses)) {
    for (const c of raw.unlockedClasses) {
      if (VALID_CLASSES.includes(c)) {
        if (c === 'builder' && raw?.builderPurchased !== true) {
          continue;
        }
        clsSet.add(c);
      }
    }
  }
  for (const [cls, price] of Object.entries(SURVIVOR_PRICES)) {
    if (price === 0) clsSet.add(cls as SurvivorClassId);
  }
  const kilSet = new Set<KillerId>(DEFAULT_UNLOCKED_KILLERS);
  if (Array.isArray(raw?.unlockedKillers)) {
    for (const k of raw.unlockedKillers) {
      if (k !== 'random' && VALID_KILLERS.includes(k)) kilSet.add(k);
    }
  }
  return {
    username: String(raw.username),
    usernameLower: String(raw.usernameLower),
    salt: String(raw.salt),
    hash: String(raw.hash),
    createdAt: Number(raw.createdAt) || Date.now(),
    coins: Math.max(0, Math.floor(Number(raw.coins) || 0)),
    unlockedClasses: Array.from(clsSet),
    unlockedKillers: Array.from(kilSet),
    claimedMatchIds: Array.isArray(raw?.claimedMatchIds)
      ? raw.claimedMatchIds.filter((x: unknown) => typeof x === 'string').slice(-50)
      : [],
    builderPurchased: Boolean(raw?.builderPurchased),
  };
}

function toPublicAuthUser(u: StoredUser) {
  return {
    username: u.username,
    coins: u.coins,
    unlockedClasses: u.unlockedClasses,
    unlockedKillers: u.unlockedKillers,
  };
}

function getAuthUserFromRequest(req: express.Request): StoredUser | null {
  const authHeader = String(req.headers.authorization ?? '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const username = token ? authSessions.get(token) : undefined;
  if (!username) return null;
  return registeredUsers.get(username.toLowerCase()) ?? null;
}

function clampMemberUnlocks(
  user: StoredUser | null,
  preferredClass: SurvivorClassId,
  preferredKiller: KillerId | 'random'
): { preferredClass: SurvivorClassId; preferredKiller: KillerId | 'random' } {
  if (!user) return { preferredClass, preferredKiller };
  const safeClass = user.unlockedClasses.includes(preferredClass) ? preferredClass : 'runner';
  const safeKiller =
    preferredKiller === 'random' || user.unlockedKillers.includes(preferredKiller)
      ? preferredKiller
      : 'random';
  return { preferredClass: safeClass, preferredKiller: safeKiller };
}

function loadAuthData() {
  try {
    if (!fs.existsSync(AUTH_DATA_FILE)) return;
    const raw = fs.readFileSync(AUTH_DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.users)) {
      for (const u of parsed.users) {
        if (u?.username && u?.usernameLower && u?.salt && u?.hash) {
          registeredUsers.set(String(u.usernameLower), normalizeStoredUser(u));
        }
      }
    }
    if (parsed?.sessions && typeof parsed.sessions === 'object') {
      for (const [tok, uname] of Object.entries(parsed.sessions)) {
        if (typeof tok === 'string' && typeof uname === 'string') {
          authSessions.set(tok, uname);
        }
      }
    }
  } catch {
    // Ignore corrupted auth cache and start clean
  }
}

function saveAuthData() {
  try {
    const payload = {
      users: Array.from(registeredUsers.values()),
      sessions: Object.fromEntries(authSessions.entries()),
    };
    fs.writeFileSync(AUTH_DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // Ignore write failures in read-only environments
  }
}

function hashPasswordScrypt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPasswordScrypt(password: string, salt: string, expectedHex: string): boolean {
  try {
    const actual = Buffer.from(hashPasswordScrypt(password, salt), 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

loadAuthData();

function emptyInput(): PlayerInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    angle: 0,
    attack: false,
    attackHeld: false,
    useQ: false,
    useE: false,
    useR: false,
    useCtrl: false,
    holdF: false,
    aimX: 0,
    aimY: 0,
  };
}

function sanitizeClass(val: unknown, fallback: SurvivorClassId = 'runner'): SurvivorClassId {
  return VALID_CLASSES.includes(val as SurvivorClassId) ? (val as SurvivorClassId) : fallback;
}

function sanitizeRole(val: unknown): OnlineRolePreference {
  return VALID_ROLES.includes(val as OnlineRolePreference) ? (val as OnlineRolePreference) : 'random';
}

function sanitizeKiller(val: unknown): KillerId | 'random' {
  return VALID_KILLERS.includes(val as KillerId | 'random') ? (val as KillerId | 'random') : 'random';
}

function sanitizeBotTier(val: unknown): BotTier | 'random' {
  return VALID_BOT_TIERS.includes(val as BotTier | 'random') ? (val as BotTier | 'random') : 'random';
}

function sanitizeName(val: unknown, fallback: string): string {
  const s = String(val ?? '').trim().slice(0, 16);
  return s || fallback;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

function isMemberConnected(m: InternalMember): boolean {
  const wsAlive = m.ws !== null && m.ws.readyState === WebSocket.OPEN;
  const sseAlive = m.sseRes !== null && !m.sseRes.writableEnded;
  return wsAlive || sseAlive || Date.now() - m.lastSeenAt < 12000;
}

function toPublicMember(m: InternalMember): OnlineMember {
  return {
    id: m.id,
    name: m.name,
    preferredClass: m.preferredClass,
    preferredRole: m.preferredRole,
    preferredKiller: m.preferredKiller,
    ready: m.ready,
    connected: isMemberConnected(m),
  };
}

function toRoomSnapshot(room: GameRoom): OnlineRoomSnapshot {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    config: { ...room.config },
    members: room.members.map(toPublicMember),
    chat: room.chat.slice(-30),
  };
}

function toCompactState(room: GameRoom, state: GameState, forRole?: 'survivor' | 'killer'): CompactGameState {
  // Track any newly breached walls (tile === 3) so clients patch their cached tiles array
  for (let i = 0; i < state.tiles.length; i++) {
    if (state.tiles[i] === 3 && !room.breachedTiles.has(i)) {
      room.breachedTiles.add(i);
    }
  }
  return {
    phase: state.phase,
    winner: state.winner,
    winReason: state.winReason,
    timeRemaining: state.timeRemaining,
    elapsed: state.elapsed,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    tileSize: state.tileSize,
    cols: state.cols,
    rows: state.rows,
    breachedTileIndices: Array.from(room.breachedTiles),
    doors: state.doors,
    traps: state.traps,
    barricades: state.barricades,
    turrets: state.turrets,
    projectiles: state.projectiles,
    smileMinions: state.smileMinions,
    effects: state.effects,
    bloodStains: state.bloodStains,
    floatingTexts: state.floatingTexts,
    eventFeed: state.eventFeed,
    shakeTimer: state.shakeTimer,
    shakeIntensity: state.shakeIntensity,
    players: state.players,
    soundEvents: state.soundEvents,
    survivorChat: forRole === 'killer' ? [] : (state.survivorChat ? state.survivorChat.slice(-30) : []),
  };
}

function sendEventToMember(m: InternalMember, event: ServerEvent, serialized?: string) {
  const payload = serialized ?? JSON.stringify(event);
  if (m.ws && m.ws.readyState === WebSocket.OPEN) {
    try {
      m.ws.send(payload);
    } catch {
      // Ignore send errors on closing socket
    }
  }
  if (m.sseRes && !m.sseRes.writableEnded) {
    try {
      m.sseRes.write(`data: ${payload}\n\n`);
    } catch {
      m.sseRes = null;
    }
  }
}

function broadcastEvent(room: GameRoom, event: ServerEvent) {
  const serialized = JSON.stringify(event);
  for (const m of room.members) {
    sendEventToMember(m, event, serialized);
  }
}

function broadcastLobby(room: GameRoom) {
  room.lastActivityAt = Date.now();
  broadcastEvent(room, {
    type: 'room:lobby',
    room: toRoomSnapshot(room),
  });
}

function destroyRoom(room: GameRoom) {
  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }
  for (const m of room.members) {
    if (m.ws && m.ws.readyState === WebSocket.OPEN) {
      try {
        m.ws.close(1000, 'Room closed');
      } catch {
        // ignore
      }
    }
    if (m.sseRes && !m.sseRes.writableEnded) {
      try {
        m.sseRes.end();
      } catch {
        // ignore
      }
    }
  }
  rooms.delete(room.code);
}

function removeMemberFromRoom(room: GameRoom, memberId: string) {
  const idx = room.members.findIndex((m) => m.id === memberId);
  if (idx === -1) return;
  const [removed] = room.members.splice(idx, 1);
  if (removed.sseRes && !removed.sseRes.writableEnded) {
    try {
      removed.sseRes.end();
    } catch {
      // ignore
    }
  }
  if (room.members.length === 0) {
    destroyRoom(room);
    return;
  }
  if (room.hostId === memberId) {
    room.hostId = room.members[0].id;
    room.members[0].ready = true;
  }
  broadcastLobby(room);
}

function mergeMemberInput(m: InternalMember, rawInput: Partial<PlayerInput>) {
  m.lastSeenAt = Date.now();
  m.input = {
    up: Boolean(rawInput.up),
    down: Boolean(rawInput.down),
    left: Boolean(rawInput.left),
    right: Boolean(rawInput.right),
    sprint: Boolean(rawInput.sprint),
    angle: Number.isFinite(rawInput.angle) ? Number(rawInput.angle) : m.input.angle,
    holdF: Boolean(rawInput.holdF),
    attack: m.input.attack || Boolean(rawInput.attack),
    attackHeld: Boolean(rawInput.attackHeld),
    useQ: m.input.useQ || Boolean(rawInput.useQ),
    useE: m.input.useE || Boolean(rawInput.useE),
    useR: m.input.useR || Boolean(rawInput.useR),
    useCtrl: m.input.useCtrl || Boolean(rawInput.useCtrl),
    aimX: Number.isFinite(rawInput.aimX) ? Number(rawInput.aimX) : m.input.aimX,
    aimY: Number.isFinite(rawInput.aimY) ? Number(rawInput.aimY) : m.input.aimY,
    ventTargetId: typeof rawInput.ventTargetId === 'string' ? rawInput.ventTargetId : m.input.ventTargetId,
    chatTextToSend: typeof rawInput.chatTextToSend === 'string' && rawInput.chatTextToSend.trim()
      ? rawInput.chatTextToSend.trim().slice(0, 140)
      : m.input.chatTextToSend,
  };
}

function startRoomMatch(room: GameRoom): { ok: true } | { ok: false; error: string } {
  if (!room.config.fillWithBots && room.members.length < 2) {
    return {
      ok: false,
      error: 'Botlar kapalıyken başlamak için en az 2 gerçek oyuncu gerekir (veya bot doldurmayı açın).',
    };
  }

  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }

  const participants: ParticipantConfig[] = room.members.map((m) => ({
    id: m.id,
    name: m.name,
    isBot: false,
    preferredClass: m.preferredClass,
    preferredRole: m.preferredRole,
    preferredKiller: m.preferredKiller,
  }));

  if (room.config.fillWithBots) {
    const botNames = ['Aylin (Bot)', 'Kerem (Bot)', 'Mert (Bot)', 'Zeynep (Bot)', 'Deniz (Bot)'];
    const anyExplicitKiller = participants.some((p) => p.preferredRole === 'killer');
    let botIdx = 1;
    while (participants.length < 5) {
      const botName = botNames[(botIdx - 1) % botNames.length];
      participants.push({
        id: `bot_${botIdx}`,
        name: botName,
        isBot: true,
        preferredClass: botName.startsWith('Aylin') ? 'doctor' : undefined,
        preferredRole: anyExplicitKiller ? 'survivor' : 'random',
      });
      botIdx += 1;
    }
  }

  room.breachedTiles.clear();
  room.state = createInitialGameState(participants, {
    killerBotTier: room.config.killerBotTier ?? 'random',
  });
  room.status = 'playing';
  room.lastActivityAt = Date.now();

  for (const m of room.members) {
    m.input = emptyInput();
  }

  broadcastEvent(room, {
    type: 'room:started',
    room: toRoomSnapshot(room),
    state: room.state,
  });

  const TICK_MS = 33; // ~30Hz authoritative tick
  room.interval = setInterval(() => {
    if (!room.state) return;
    const inputs: Record<string, PlayerInput> = {};
    for (const m of room.members) {
      inputs[m.id] = { ...m.input };
      m.input.attack = false;
      m.input.useQ = false;
      m.input.useE = false;
      m.input.useR = false;
      m.input.useCtrl = false;
      m.input.ventTargetId = undefined;
      m.input.chatTextToSend = undefined;
    }

    stepGame(room.state, inputs, TICK_MS / 1000);
    room.lastActivityAt = Date.now();

    const compactSurvivor = toCompactState(room, room.state, 'survivor');
    const compactKiller = toCompactState(room, room.state, 'killer');
    const serSurvivor = JSON.stringify({ type: 'room:state', state: compactSurvivor });
    const serKiller = JSON.stringify({ type: 'room:state', state: compactKiller });

    for (const m of room.members) {
      const ps = room.state.players.find((pl) => pl.id === m.id);
      const isKiller = ps?.role === 'killer';
      sendEventToMember(m, { type: 'room:state', state: isKiller ? compactKiller : compactSurvivor }, isKiller ? serKiller : serSurvivor);
    }

    if (room.state.phase === 'ended') {
      room.status = 'ended';
      const matchId = room.state.matchId;
      let changedAuth = false;
      for (const m of room.members) {
        if (!m.authUsernameLower || !matchId) continue;
        const user = registeredUsers.get(m.authUsernameLower);
        if (!user || user.claimedMatchIds.includes(matchId)) continue;
        const ps = room.state.players.find((pl) => pl.id === m.id);
        const earned = Math.max(0, Math.floor(ps?.coinsEarned ?? 0));
        user.coins += earned;
        user.claimedMatchIds.push(matchId);
        if (user.claimedMatchIds.length > 50) user.claimedMatchIds.shift();
        changedAuth = true;
      }
      if (changedAuth) saveAuthData();

      if (room.interval) {
        clearInterval(room.interval);
        room.interval = null;
      }
      broadcastLobby(room);
    }
  }, TICK_MS);

  return { ok: true };
}

function authenticateMember(
  room: GameRoom | undefined,
  playerId: unknown,
  sessionToken: unknown
): InternalMember | null {
  if (!room || typeof playerId !== 'string' || typeof sessionToken !== 'string') return null;
  const member = room.members.find((m) => m.id === playerId && m.sessionToken === sessionToken);
  if (member) {
    member.lastSeenAt = Date.now();
    room.lastActivityAt = Date.now();
  }
  return member ?? null;
}

// Sweep stale idle rooms & ghost lobby members every 15s
setInterval(() => {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    if (room.status === 'lobby') {
      const staleIds = room.members
        .filter((m) => {
          const wsAlive = m.ws !== null && m.ws.readyState === WebSocket.OPEN;
          const sseAlive = m.sseRes !== null && !m.sseRes.writableEnded;
          return !wsAlive && !sseAlive && now - m.lastSeenAt > 45000;
        })
        .map((m) => m.id);
      for (const id of staleIds) {
        removeMemberFromRoom(room, id);
      }
      if (!rooms.has(room.code)) continue;
    }

    const anySocket = room.members.some(
      (m) =>
        (m.ws !== null && m.ws.readyState === WebSocket.OPEN) ||
        (m.sseRes !== null && !m.sseRes.writableEnded)
    );
    const maxIdle = anySocket ? 15 * 60 * 1000 : 45 * 1000;
    if (now - room.lastActivityAt > maxIdle) {
      destroyRoom(room);
    }
  }
}, 15000);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrades cleanly ONLY on /ws
  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, url);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, url: URL) => {
    let boundRoom: GameRoom | null = null;
    let boundMember: InternalMember | null = null;
    let isAlive = true;

    const bindSession = (codeRaw: unknown, playerIdRaw: unknown, tokenRaw: unknown) => {
      const code = String(codeRaw || '').trim().toUpperCase();
      const room = rooms.get(code);
      const member = authenticateMember(room, playerIdRaw, tokenRaw);
      if (!room || !member) {
        ws.send(JSON.stringify({ type: 'room:error', message: 'Oda oturumu geçersiz veya süresi dolmuş.' }));
        return false;
      }
      if (member.ws && member.ws !== ws && member.ws.readyState === WebSocket.OPEN) {
        try {
          member.ws.close(1000, 'Replaced by newer connection');
        } catch {
          // ignore
        }
      }
      boundRoom = room;
      boundMember = member;
      member.ws = ws;
      member.lastSeenAt = Date.now();

      ws.send(JSON.stringify({ type: 'connected', playerId: member.id }));
      ws.send(JSON.stringify({ type: 'room:lobby', room: toRoomSnapshot(room) }));
      if (room.state && (room.status === 'playing' || room.status === 'ended')) {
        ws.send(
          JSON.stringify({
            type: 'room:started',
            room: toRoomSnapshot(room),
            state: room.state,
          })
        );
      }
      broadcastLobby(room);
      return true;
    };

    const qCode = url.searchParams.get('code');
    const qPlayerId = url.searchParams.get('playerId');
    const qToken = url.searchParams.get('token');
    if (qCode && qPlayerId && qToken) {
      bindSession(qCode, qPlayerId, qToken);
    }

    const pingInterval = setInterval(() => {
      if (!isAlive) {
        ws.terminate();
        return;
      }
      isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 15000);

    ws.on('pong', () => {
      isAlive = true;
      if (boundMember) boundMember.lastSeenAt = Date.now();
      if (boundRoom) boundRoom.lastActivityAt = Date.now();
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Number(msg.ts) || Date.now() }));
          if (boundMember) boundMember.lastSeenAt = Date.now();
          if (boundRoom) boundRoom.lastActivityAt = Date.now();
          return;
        }
        if (msg.type === 'auth') {
          bindSession(msg.code, msg.playerId, msg.token);
          return;
        }
        if (msg.type === 'room:input' && boundRoom && boundMember && boundRoom.state) {
          if (msg.input) {
            mergeMemberInput(boundMember, msg.input);
          }
        }
      } catch {
        // ignore malformed packets
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      if (boundMember && boundMember.ws === ws) {
        boundMember.ws = null;
        if (boundRoom) {
          broadcastLobby(boundRoom);
        }
      }
    });
  });

  // --- HTTP REST + SSE API FOR 100% RELIABLE MULTIPLAYER ---
  const api = express.Router();
  api.use(express.json({ limit: '256kb' }));

  api.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ ok: true, rooms: rooms.size });
  });

  // --- CUSTOM AUTH + ECONOMY ENDPOINTS (USERNAME + PASSWORD ONLY) ---
  api.post('/auth/register', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (username.length < 3 || username.length > 16) {
      res.status(400).json({ error: 'Kullanıcı adı 3 ile 16 karakter arasında olmalıdır.' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır.' });
      return;
    }
    const lower = username.toLowerCase();
    if (registeredUsers.has(lower)) {
      res.status(409).json({ error: 'Bu kullanıcı adı zaten kayıtlı.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPasswordScrypt(password, salt);
    const createdUser: StoredUser = {
      username,
      usernameLower: lower,
      salt,
      hash,
      createdAt: Date.now(),
      coins: 0,
      unlockedClasses: [...DEFAULT_UNLOCKED_CLASSES],
      unlockedKillers: [...DEFAULT_UNLOCKED_KILLERS],
      claimedMatchIds: [],
    };
    registeredUsers.set(lower, createdUser);
    const token = crypto.randomBytes(24).toString('hex');
    authSessions.set(token, username);
    saveAuthData();
    res.status(201).json({
      user: toPublicAuthUser(createdUser),
      token,
    });
  });

  api.post('/auth/login', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir.' });
      return;
    }
    const found = registeredUsers.get(username.toLowerCase());
    if (!found || !verifyPasswordScrypt(password, found.salt, found.hash)) {
      res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    authSessions.set(token, found.username);
    saveAuthData();
    res.json({
      user: toPublicAuthUser(found),
      token,
    });
  });

  api.get('/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const user = getAuthUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Oturum bulunamadı.' });
      return;
    }
    res.json({ user: toPublicAuthUser(user) });
  });

  api.post('/auth/logout', (req, res) => {
    const authHeader = String(req.headers.authorization ?? '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token && authSessions.has(token)) {
      authSessions.delete(token);
      saveAuthData();
    }
    res.json({ ok: true });
  });

  api.get('/economy/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const user = getAuthUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Oturum bulunamadı.' });
      return;
    }
    res.json({ user: toPublicAuthUser(user) });
  });

  api.post('/economy/buy', (req, res) => {
    const user = getAuthUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Satın almak için giriş yapmalısın.' });
      return;
    }
    const kind = req.body?.kind;
    const id = req.body?.id;
    if (kind === 'survivor') {
      if (!VALID_CLASSES.includes(id as SurvivorClassId)) {
        res.status(400).json({ error: 'Geçersiz hayatta kalan sınıfı.' });
        return;
      }
      const clsId = id as SurvivorClassId;
      if (user.unlockedClasses.includes(clsId)) {
        res.json({ user: toPublicAuthUser(user) });
        return;
      }
      const price = SURVIVOR_PRICES[clsId] ?? 0;
      if (user.coins < price) {
        res.status(400).json({ error: `Yetersiz para! (${price} para gerekli)` });
        return;
      }
      user.coins -= price;
      user.unlockedClasses.push(clsId);
      if (clsId === 'builder') {
        user.builderPurchased = true;
      }
      saveAuthData();
      res.json({ user: toPublicAuthUser(user) });
      return;
    }

    if (kind === 'killer') {
      if (id === 'random' || !VALID_KILLERS.includes(id as KillerId)) {
        res.status(400).json({ error: 'Geçersiz katil.' });
        return;
      }
      const kilId = id as KillerId;
      if (user.unlockedKillers.includes(kilId)) {
        res.json({ user: toPublicAuthUser(user) });
        return;
      }
      const price = KILLER_PRICES[kilId] ?? 0;
      if (user.coins < price) {
        res.status(400).json({ error: `Yetersiz para! (${price} para gerekli)` });
        return;
      }
      user.coins -= price;
      user.unlockedKillers.push(kilId);
      saveAuthData();
      res.json({ user: toPublicAuthUser(user) });
      return;
    }

    res.status(400).json({ error: 'Geçersiz ürün türü.' });
  });

  api.post('/economy/claim', (req, res) => {
    const user = getAuthUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Oturum bulunamadı.' });
      return;
    }
    const matchId = String(req.body?.matchId ?? '').trim();
    const rawAmount = Number(req.body?.amount ?? 0);
    const amount = Number.isFinite(rawAmount) ? Math.max(0, Math.min(800, Math.floor(rawAmount))) : 0;
    if (!matchId) {
      res.status(400).json({ error: 'Geçersiz maç kimliği.' });
      return;
    }
    if (user.claimedMatchIds.includes(matchId)) {
      res.json({ user: toPublicAuthUser(user), awarded: 0 });
      return;
    }
    user.coins += amount;
    user.claimedMatchIds.push(matchId);
    if (user.claimedMatchIds.length > 50) user.claimedMatchIds.shift();
    saveAuthData();
    res.json({ user: toPublicAuthUser(user), awarded: amount });
  });

  api.get('/rooms', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const now = Date.now();
    const list: PublicRoomSummary[] = [];
    for (const room of rooms.values()) {
      if (!room.config.isPublic) continue;
      if (room.status !== 'lobby') continue;
      if (room.members.length === 0) continue;
      if (now - room.createdAt > 4 * 3600 * 1000) continue;
      const host = room.members.find((m) => m.id === room.hostId);
      list.push({
        code: room.code,
        hostName: host?.name || 'Kurucu',
        playerCount: room.members.length,
        maxPlayers: 5,
        fillWithBots: room.config.fillWithBots,
        killerBotTier: room.config.killerBotTier ?? 'random',
        status: room.status,
        memberNames: room.members.map((m) => m.name),
        createdAt: room.createdAt,
      });
    }
    list.sort((a, b) => (b.playerCount - a.playerCount) || ((b.createdAt ?? 0) - (a.createdAt ?? 0)));
    res.json({ rooms: list });
  });

  api.post('/rooms', (req, res) => {
    const code = generateRoomCode();
    const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
    const sessionToken = crypto.randomBytes(16).toString('hex');
    const authUser = getAuthUserFromRequest(req);
    const safeSelections = clampMemberUnlocks(
      authUser,
      sanitizeClass(req.body?.preferredClass, 'runner'),
      sanitizeKiller(req.body?.preferredKiller)
    );

    const member: InternalMember = {
      id: playerId,
      sessionToken,
      authUsernameLower: authUser?.usernameLower,
      name: sanitizeName(req.body?.name, authUser?.username || 'Oyuncu 1'),
      preferredClass: safeSelections.preferredClass,
      preferredRole: sanitizeRole(req.body?.preferredRole),
      preferredKiller: safeSelections.preferredKiller,
      ready: true,
      ws: null,
      sseRes: null,
      lastSeenAt: Date.now(),
      input: emptyInput(),
    };

    const now = Date.now();
    const room: GameRoom = {
      code,
      hostId: playerId,
      status: 'lobby',
      config: {
        fillWithBots: req.body?.fillWithBots !== false,
        isPublic: req.body?.isPublic !== false,
        killerBotTier: sanitizeBotTier(req.body?.killerBotTier),
      },
      members: [member],
      chat: [],
      state: null,
      breachedTiles: new Set(),
      interval: null,
      lastActivityAt: now,
      createdAt: now,
    };

    rooms.set(code, room);
    res.status(201).json({
      room: toRoomSnapshot(room),
      playerId,
      sessionToken,
    });
  });

  api.post('/rooms/:code/join', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: `"${code}" kodlu oda bulunamadı.` });
      return;
    }

    const authUser = getAuthUserFromRequest(req);

    // Reconnect existing member if matching credentials supplied
    const existing = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (existing) {
      if (authUser && !existing.authUsernameLower) {
        existing.authUsernameLower = authUser.usernameLower;
      }
      const memberOwner =
        authUser ??
        (existing.authUsernameLower ? registeredUsers.get(existing.authUsernameLower) ?? null : null);
      const safeSelections = clampMemberUnlocks(
        memberOwner,
        sanitizeClass(req.body?.preferredClass, existing.preferredClass),
        sanitizeKiller(req.body?.preferredKiller ?? existing.preferredKiller)
      );
      existing.name = sanitizeName(req.body?.name, existing.name);
      existing.preferredClass = safeSelections.preferredClass;
      existing.preferredRole = sanitizeRole(req.body?.preferredRole ?? existing.preferredRole);
      existing.preferredKiller = safeSelections.preferredKiller;
      broadcastLobby(room);
      res.json({
        room: toRoomSnapshot(room),
        playerId: existing.id,
        sessionToken: existing.sessionToken,
        gameState: room.state,
      });
      return;
    }

    if (room.status === 'playing') {
      res.status(409).json({ error: 'Bu odada maç şu anda oynanıyor.' });
      return;
    }
    if (room.members.length >= 5) {
      res.status(409).json({ error: 'Oda dolu (maksimum 5 gerçek oyuncu).' });
      return;
    }

    const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
    const sessionToken = crypto.randomBytes(16).toString('hex');
    const safeSelections = clampMemberUnlocks(
      authUser,
      sanitizeClass(req.body?.preferredClass, 'runner'),
      sanitizeKiller(req.body?.preferredKiller)
    );
    const member: InternalMember = {
      id: playerId,
      sessionToken,
      authUsernameLower: authUser?.usernameLower,
      name: sanitizeName(req.body?.name, authUser?.username || `Oyuncu ${room.members.length + 1}`),
      preferredClass: safeSelections.preferredClass,
      preferredRole: sanitizeRole(req.body?.preferredRole),
      preferredKiller: safeSelections.preferredKiller,
      ready: false,
      ws: null,
      sseRes: null,
      lastSeenAt: Date.now(),
      input: emptyInput(),
    };

    room.members.push(member);
    room.chat.push({
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'Sistem',
      text: `${member.name} odaya katıldı.`,
      ts: Date.now(),
    });
    broadcastLobby(room);

    res.json({
      room: toRoomSnapshot(room),
      playerId,
      sessionToken,
      gameState: null,
    });
  });

  api.post('/rooms/:code/leave', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.json({ ok: true });
      return;
    }
    room.chat.push({
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'Sistem',
      text: `${member.name} odadan ayrıldı.`,
      ts: Date.now(),
    });
    removeMemberFromRoom(room, member.id);
    res.json({ ok: true });
  });

  api.post('/rooms/:code/member', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }
    const authUser = getAuthUserFromRequest(req);
    if (authUser && !member.authUsernameLower) {
      member.authUsernameLower = authUser.usernameLower;
    }
    const memberOwner =
      authUser ??
      (member.authUsernameLower ? registeredUsers.get(member.authUsernameLower) ?? null : null);

    if (req.body?.name !== undefined) {
      member.name = sanitizeName(req.body.name, member.name);
    }
    if (req.body?.preferredClass !== undefined) {
      const nextClass = sanitizeClass(req.body.preferredClass, member.preferredClass);
      member.preferredClass = clampMemberUnlocks(
        memberOwner,
        nextClass,
        member.preferredKiller
      ).preferredClass;
    }
    if (req.body?.preferredRole !== undefined) {
      member.preferredRole = sanitizeRole(req.body.preferredRole);
    }
    if (req.body?.preferredKiller !== undefined) {
      const nextKiller = sanitizeKiller(req.body.preferredKiller);
      member.preferredKiller = clampMemberUnlocks(
        memberOwner,
        member.preferredClass,
        nextKiller
      ).preferredKiller;
    }
    if (typeof req.body?.ready === 'boolean') {
      member.ready = req.body.ready;
    }
    broadcastLobby(room);
    res.json({ room: toRoomSnapshot(room) });
  });

  api.post('/rooms/:code/config', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }
    if (room.hostId !== member.id) {
      res.status(403).json({ error: 'Sadece oda kurucusu ayarları değiştirebilir.' });
      return;
    }
    if (typeof req.body?.fillWithBots === 'boolean') {
      room.config.fillWithBots = req.body.fillWithBots;
    }
    if (typeof req.body?.isPublic === 'boolean') {
      room.config.isPublic = req.body.isPublic;
    }
    if (req.body?.killerBotTier !== undefined) {
      room.config.killerBotTier = sanitizeBotTier(req.body.killerBotTier);
    }
    broadcastLobby(room);
    res.json({ room: toRoomSnapshot(room) });
  });

  api.post('/rooms/:code/chat', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }
    const text = String(req.body?.text ?? '').trim().slice(0, 140);
    if (!text) {
      res.json({ ok: true });
      return;
    }
    room.chat.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: member.id,
      senderName: member.name,
      text,
      ts: Date.now(),
    });
    if (room.chat.length > 40) room.chat.shift();
    broadcastLobby(room);
    res.json({ ok: true });
  });

  api.post('/rooms/:code/start', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }
    if (room.hostId !== member.id) {
      res.status(403).json({ error: 'Sadece oda kurucusu maçı başlatabilir.' });
      return;
    }
    const started = startRoomMatch(room);
    if (!started.ok) {
      res.status(400).json({ error: started.error });
      return;
    }
    res.json({ ok: true, room: toRoomSnapshot(room), state: room.state });
  });

  api.post('/rooms/:code/rematch', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }
    if (room.hostId !== member.id) {
      res.status(403).json({ error: 'Sadece oda kurucusu yeni tur başlatabilir.' });
      return;
    }
    if (room.interval) {
      clearInterval(room.interval);
      room.interval = null;
    }
    room.state = null;
    room.status = 'lobby';
    room.breachedTiles.clear();
    for (const m of room.members) {
      m.input = emptyInput();
      m.ready = m.id === room.hostId;
    }
    const snap = toRoomSnapshot(room);
    broadcastEvent(room, { type: 'room:rematch', room: snap });
    res.json({ ok: true, room: snap });
  });

  api.post('/rooms/:code/input', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }
    if (room.state && req.body?.input) {
      mergeMemberInput(member, req.body.input);
    }
    res.json({ ok: true });
  });

  api.get('/rooms/:code/state', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.query.playerId, req.query.token);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda bulunamadı veya oturum geçersiz.' });
      return;
    }
    res.json({
      room: toRoomSnapshot(room),
      state: room.state,
    });
  });

  api.get('/rooms/:code/stream', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    const member = authenticateMember(room, req.query.playerId, req.query.token);
    if (!room || !member) {
      res.status(401).json({ error: 'Oda oturumu geçersiz.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    if (member.sseRes && member.sseRes !== res && !member.sseRes.writableEnded) {
      try {
        member.sseRes.end();
      } catch {
        // ignore
      }
    }
    member.sseRes = res;

    // Initial snapshot over SSE
    const initEvent: ServerEvent = { type: 'room:lobby', room: toRoomSnapshot(room) };
    res.write(`data: ${JSON.stringify(initEvent)}\n\n`);
    if (room.state && (room.status === 'playing' || room.status === 'ended')) {
      const startedEvent: ServerEvent = {
        type: 'room:started',
        room: toRoomSnapshot(room),
        state: room.state,
      };
      res.write(`data: ${JSON.stringify(startedEvent)}\n\n`);
    }

    const keepAlive = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAlive);
        return;
      }
      member.lastSeenAt = Date.now();
      room.lastActivityAt = Date.now();
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      if (member.sseRes === res) {
        member.sseRes = null;
        broadcastLobby(room);
      }
    });
  });

  app.use('/api', api);

  if (process.env.NODE_ENV !== 'production') {
    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return { accept(){}, dispose(){}, prune(){}, invalidate(){}, on(){}, off(){}, send(){} };
}
export function injectQuery(url) { return url; }
`);
      });
    }
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get(['/', '/index.html'], async (req, res, next) => {
      try {
        const rawHtml = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        const withFlag = transformed.replace(
          '</head>',
          '<script>window.__KK_BACKEND__=true;</script></head>'
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(withFlag);
      } catch (e) {
        next(e);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    const getProdHtml = () => {
      const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
      return raw.replace('</head>', '<script>window.__KK_BACKEND__=true;</script></head>');
    };
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => {
      res.status(200).set({ 'Content-Type': 'text/html' }).send(getProdHtml());
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
