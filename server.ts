import crypto from 'crypto';
import express, { type Response as ExpressResponse } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { type ParticipantConfig, createInitialGameState, stepGame } from './src/game/engine.ts';
import type { GameState, KillerId, PlayerInput, SurvivorClassId } from './src/game/types.ts';
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
];
const VALID_ROLES: OnlineRolePreference[] = ['random', 'survivor', 'killer'];
const VALID_KILLERS: (KillerId | 'random')[] = ['random', 'jumper', 'juggernaut', 'smile', 'hungry'];

interface InternalMember {
  id: string;
  sessionToken: string;
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
}

const rooms = new Map<string, GameRoom>();

function emptyInput(): PlayerInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    angle: 0,
    attack: false,
    useQ: false,
    useE: false,
    useR: false,
    useCtrl: false,
    holdF: false,
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

function toCompactState(room: GameRoom, state: GameState): CompactGameState {
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
    useQ: m.input.useQ || Boolean(rawInput.useQ),
    useE: m.input.useE || Boolean(rawInput.useE),
    useR: m.input.useR || Boolean(rawInput.useR),
    useCtrl: m.input.useCtrl || Boolean(rawInput.useCtrl),
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
    const botClasses: SurvivorClassId[] = ['doctor', 'engineer', 'fighter', 'trapper', 'runner', 'builder'];
    const botNames = ['Aylin (Bot)', 'Kerem (Bot)', 'Mert (Bot)', 'Zeynep (Bot)', 'Deniz (Bot)'];
    const anyExplicitKiller = participants.some((p) => p.preferredRole === 'killer');
    let botIdx = 1;
    while (participants.length < 5) {
      participants.push({
        id: `bot_${botIdx}`,
        name: botNames[(botIdx - 1) % botNames.length],
        isBot: true,
        preferredClass: botClasses[(botIdx - 1) % botClasses.length],
        preferredRole: anyExplicitKiller ? 'survivor' : 'random',
      });
      botIdx += 1;
    }
  }

  room.breachedTiles.clear();
  room.state = createInitialGameState(participants);
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
    }

    stepGame(room.state, inputs, TICK_MS / 1000);
    room.lastActivityAt = Date.now();

    const compact = toCompactState(room, room.state);
    broadcastEvent(room, {
      type: 'room:state',
      state: compact,
    });

    if (room.state.phase === 'ended') {
      room.status = 'ended';
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

// Sweep stale idle rooms every 60s
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anySocket = room.members.some(
      (m) =>
        (m.ws !== null && m.ws.readyState === WebSocket.OPEN) ||
        (m.sseRes !== null && !m.sseRes.writableEnded)
    );
    const maxIdle = anySocket ? 15 * 60 * 1000 : 2 * 60 * 1000;
    if (now - room.lastActivityAt > maxIdle) {
      destroyRoom(room);
    }
  }
}, 60000);

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
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Number(msg.ts) || Date.now() }));
          if (boundMember) boundMember.lastSeenAt = Date.now();
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
    res.json({ ok: true, rooms: rooms.size });
  });

  api.get('/rooms', (_req, res) => {
    const list: PublicRoomSummary[] = [];
    for (const room of rooms.values()) {
      if (!room.config.isPublic) continue;
      if (room.status !== 'lobby') continue;
      const host = room.members.find((m) => m.id === room.hostId);
      list.push({
        code: room.code,
        hostName: host?.name || 'Kurucu',
        playerCount: room.members.length,
        maxPlayers: 5,
        fillWithBots: room.config.fillWithBots,
        status: room.status,
      });
    }
    res.json({ rooms: list });
  });

  api.post('/rooms', (req, res) => {
    const code = generateRoomCode();
    const playerId = `p_${crypto.randomBytes(4).toString('hex')}`;
    const sessionToken = crypto.randomBytes(16).toString('hex');

    const member: InternalMember = {
      id: playerId,
      sessionToken,
      name: sanitizeName(req.body?.name, 'Oyuncu 1'),
      preferredClass: sanitizeClass(req.body?.preferredClass, 'runner'),
      preferredRole: sanitizeRole(req.body?.preferredRole),
      preferredKiller: sanitizeKiller(req.body?.preferredKiller),
      ready: true,
      ws: null,
      sseRes: null,
      lastSeenAt: Date.now(),
      input: emptyInput(),
    };

    const room: GameRoom = {
      code,
      hostId: playerId,
      status: 'lobby',
      config: {
        fillWithBots: req.body?.fillWithBots !== false,
        isPublic: req.body?.isPublic !== false,
      },
      members: [member],
      chat: [],
      state: null,
      breachedTiles: new Set(),
      interval: null,
      lastActivityAt: Date.now(),
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

    // Reconnect existing member if matching credentials supplied
    const existing = authenticateMember(room, req.body?.playerId, req.body?.sessionToken);
    if (existing) {
      existing.name = sanitizeName(req.body?.name, existing.name);
      existing.preferredClass = sanitizeClass(req.body?.preferredClass, existing.preferredClass);
      existing.preferredRole = sanitizeRole(req.body?.preferredRole ?? existing.preferredRole);
      existing.preferredKiller = sanitizeKiller(req.body?.preferredKiller ?? existing.preferredKiller);
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
    const member: InternalMember = {
      id: playerId,
      sessionToken,
      name: sanitizeName(req.body?.name, `Oyuncu ${room.members.length + 1}`),
      preferredClass: sanitizeClass(req.body?.preferredClass, 'doctor'),
      preferredRole: sanitizeRole(req.body?.preferredRole),
      preferredKiller: sanitizeKiller(req.body?.preferredKiller),
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
    if (req.body?.name !== undefined) {
      member.name = sanitizeName(req.body.name, member.name);
    }
    if (req.body?.preferredClass !== undefined) {
      member.preferredClass = sanitizeClass(req.body.preferredClass, member.preferredClass);
    }
    if (req.body?.preferredRole !== undefined) {
      member.preferredRole = sanitizeRole(req.body.preferredRole);
    }
    if (req.body?.preferredKiller !== undefined) {
      member.preferredKiller = sanitizeKiller(req.body.preferredKiller);
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
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
