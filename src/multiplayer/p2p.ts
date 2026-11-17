import Peer, { type DataConnection } from 'peerjs';
import { createInitialGameState, stepGame, type ParticipantConfig } from '../game/engine.ts';
import type { GameState, KillerId, PlayerInput, SurvivorClassId } from '../game/types.ts';
import type {
  CompactGameState,
  OnlineChatMessage,
  OnlineMember,
  OnlineRolePreference,
  OnlineRoomSnapshot,
  ServerEvent,
} from './types.ts';

const PEER_PREFIX = 'karanlik-kacis-v2-';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

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
  };
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

type GuestToHostMsg =
  | {
      type: 'hello';
      name: string;
      preferredClass: SurvivorClassId;
      preferredRole: OnlineRolePreference;
      preferredKiller: KillerId | 'random';
    }
  | {
      type: 'member:update';
      patch: {
        name?: string;
        preferredClass?: SurvivorClassId;
        preferredRole?: OnlineRolePreference;
        preferredKiller?: KillerId | 'random';
        ready?: boolean;
      };
    }
  | { type: 'chat:send'; text: string }
  | { type: 'input'; input: PlayerInput }
  | { type: 'ping'; ts: number }
  | { type: 'leave' };

type HostToGuestMsg =
  | { type: 'welcome'; playerId: string; room: OnlineRoomSnapshot }
  | { type: 'rejected'; message: string }
  | ServerEvent;

export interface P2PCallbacks {
  onRoomUpdate: (room: OnlineRoomSnapshot) => void;
  onGameStarted: (room: OnlineRoomSnapshot, state: GameState) => void;
  onGameState: (state: GameState) => void;
  onRematch: (room: OnlineRoomSnapshot) => void;
  onTransportChange: (pingMs: number | null) => void;
  onError: (message: string) => void;
  onHostDisconnected?: () => void;
}

export interface P2PSessionHandle {
  isHost: boolean;
  code: string;
  playerId: string;
  sendInput: (inp: PlayerInput) => void;
  updateMember: (patch: {
    name?: string;
    preferredClass?: SurvivorClassId;
    preferredRole?: OnlineRolePreference;
    preferredKiller?: KillerId | 'random';
    ready?: boolean;
  }) => void;
  updateConfig: (patch: { fillWithBots?: boolean; isPublic?: boolean }) => void;
  sendChat: (text: string) => void;
  startMatch: () => void;
  rematch: () => void;
  dispose: () => void;
}

function openPeerWithId(peerId?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = peerId
      ? new Peer(peerId, { debug: 0, config: { iceServers: ICE_SERVERS } })
      : new Peer({ debug: 0, config: { iceServers: ICE_SERVERS } });

    const timeout = window.setTimeout(() => {
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      reject(new Error('P2P bağlantı sunucusuna zaman aşımına uğradı.'));
    }, 10000);

    peer.once('open', () => {
      window.clearTimeout(timeout);
      resolve(peer);
    });

    peer.once('error', (err) => {
      window.clearTimeout(timeout);
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      reject(err);
    });
  });
}

export async function createP2PHostRoom(
  opts: {
    name: string;
    preferredClass: SurvivorClassId;
    preferredRole: OnlineRolePreference;
    preferredKiller: KillerId | 'random';
    fillWithBots: boolean;
  },
  cb: P2PCallbacks
): Promise<{ room: OnlineRoomSnapshot; playerId: string; handle: P2PSessionHandle }> {
  let code = generateCode();
  let peer: Peer | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      peer = await openPeerWithId(`${PEER_PREFIX}${code}`);
      break;
    } catch (err: any) {
      if (err?.type === 'unavailable-id' && attempt < 4) {
        code = generateCode();
        continue;
      }
      throw new Error('P2P oda oluşturulamadı. İnternet bağlantını kontrol edip tekrar dene.');
    }
  }
  if (!peer) {
    throw new Error('P2P oda oluşturulamadı.');
  }

  const hostId = 'p_host';
  const room: OnlineRoomSnapshot = {
    code,
    hostId,
    status: 'lobby',
    config: {
      fillWithBots: opts.fillWithBots,
      isPublic: false,
    },
    members: [
      {
        id: hostId,
        name: opts.name.trim().slice(0, 16) || 'Kurucu',
        preferredClass: opts.preferredClass,
        preferredRole: opts.preferredRole,
        preferredKiller: opts.preferredKiller,
        ready: true,
        connected: true,
      },
    ],
    chat: [],
  };

  const guestConns = new Map<string, DataConnection>(); // memberId -> DataConnection
  const memberInputs = new Map<string, PlayerInput>();
  memberInputs.set(hostId, emptyInput());

  let gameState: GameState | null = null;
  let breachedTiles = new Set<number>();
  let tickInterval: number | null = null;
  let disposed = false;

  const cloneRoom = (): OnlineRoomSnapshot => ({
    ...room,
    config: { ...room.config },
    members: room.members.map((m) => ({ ...m })),
    chat: room.chat.slice(-30),
  });

  const broadcast = (msg: HostToGuestMsg) => {
    for (const conn of guestConns.values()) {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch {
          // ignore
        }
      }
    }
  };

  const syncLobby = () => {
    const snap = cloneRoom();
    cb.onRoomUpdate(snap);
    broadcast({ type: 'room:lobby', room: snap });
  };

  const toCompact = (st: GameState): CompactGameState => {
    for (let i = 0; i < st.tiles.length; i++) {
      if (st.tiles[i] === 3 && !breachedTiles.has(i)) {
        breachedTiles.add(i);
      }
    }
    return {
      phase: st.phase,
      winner: st.winner,
      winReason: st.winReason,
      timeRemaining: st.timeRemaining,
      elapsed: st.elapsed,
      mapWidth: st.mapWidth,
      mapHeight: st.mapHeight,
      tileSize: st.tileSize,
      cols: st.cols,
      rows: st.rows,
      breachedTileIndices: Array.from(breachedTiles),
      doors: st.doors,
      traps: st.traps,
      barricades: st.barricades,
      turrets: st.turrets,
      projectiles: st.projectiles,
      smileMinions: st.smileMinions,
      effects: st.effects,
      bloodStains: st.bloodStains,
      floatingTexts: st.floatingTexts,
      eventFeed: st.eventFeed,
      shakeTimer: st.shakeTimer,
      shakeIntensity: st.shakeIntensity,
      players: st.players,
      soundEvents: st.soundEvents,
    };
  };

  const removeGuest = (memberId: string) => {
    const conn = guestConns.get(memberId);
    if (conn) {
      guestConns.delete(memberId);
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    memberInputs.delete(memberId);
    const idx = room.members.findIndex((m) => m.id === memberId);
    if (idx !== -1) {
      const [removed] = room.members.splice(idx, 1);
      room.chat.push({
        id: `sys_${Date.now()}`,
        senderId: 'system',
        senderName: 'Sistem',
        text: `${removed.name} odadan ayrıldı.`,
        ts: Date.now(),
      });
      syncLobby();
    }
  };

  peer.on('connection', (conn) => {
    if (disposed) {
      conn.close();
      return;
    }
    let boundMemberId: string | null = null;

    conn.on('data', (raw) => {
      const msg = raw as GuestToHostMsg;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'hello') {
        if (room.status === 'playing') {
          conn.send({ type: 'rejected', message: 'Bu odada maç şu anda oynanıyor.' } satisfies HostToGuestMsg);
          window.setTimeout(() => conn.close(), 100);
          return;
        }
        if (room.members.length >= 5) {
          conn.send({ type: 'rejected', message: 'Oda dolu (maksimum 5 gerçek oyuncu).' } satisfies HostToGuestMsg);
          window.setTimeout(() => conn.close(), 100);
          return;
        }

        const memberId = `p_${Math.random().toString(36).slice(2, 9)}`;
        boundMemberId = memberId;
        const newMember: OnlineMember = {
          id: memberId,
          name: String(msg.name || `Oyuncu ${room.members.length + 1}`).trim().slice(0, 16) || 'Oyuncu',
          preferredClass: msg.preferredClass || 'doctor',
          preferredRole: msg.preferredRole || 'random',
          preferredKiller: msg.preferredKiller || 'random',
          ready: false,
          connected: true,
        };
        room.members.push(newMember);
        guestConns.set(memberId, conn);
        memberInputs.set(memberId, emptyInput());
        room.chat.push({
          id: `sys_${Date.now()}`,
          senderId: 'system',
          senderName: 'Sistem',
          text: `${newMember.name} odaya katıldı.`,
          ts: Date.now(),
        });

        conn.send({ type: 'welcome', playerId: memberId, room: cloneRoom() } satisfies HostToGuestMsg);
        syncLobby();
        return;
      }

      if (!boundMemberId) return;
      const member = room.members.find((m) => m.id === boundMemberId);
      if (!member) return;

      if (msg.type === 'ping') {
        conn.send({ type: 'pong', ts: msg.ts } satisfies HostToGuestMsg);
      } else if (msg.type === 'member:update') {
        if (msg.patch.name !== undefined) {
          const s = msg.patch.name.trim().slice(0, 16);
          if (s) member.name = s;
        }
        if (msg.patch.preferredClass !== undefined) member.preferredClass = msg.patch.preferredClass;
        if (msg.patch.preferredRole !== undefined) member.preferredRole = msg.patch.preferredRole;
        if (msg.patch.preferredKiller !== undefined) member.preferredKiller = msg.patch.preferredKiller;
        if (typeof msg.patch.ready === 'boolean') member.ready = msg.patch.ready;
        syncLobby();
      } else if (msg.type === 'chat:send') {
        const text = String(msg.text || '').trim().slice(0, 140);
        if (text) {
          const chatMsg: OnlineChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            senderId: member.id,
            senderName: member.name,
            text,
            ts: Date.now(),
          };
          room.chat.push(chatMsg);
          if (room.chat.length > 40) room.chat.shift();
          syncLobby();
        }
      } else if (msg.type === 'input' && gameState) {
        const prev = memberInputs.get(boundMemberId) ?? emptyInput();
        memberInputs.set(boundMemberId, {
          ...msg.input,
          attackHeld: Boolean(msg.input.attackHeld),
          attack: prev.attack || Boolean(msg.input.attack),
          useQ: prev.useQ || Boolean(msg.input.useQ),
          useE: prev.useE || Boolean(msg.input.useE),
          useR: prev.useR || Boolean(msg.input.useR),
          useCtrl: prev.useCtrl || Boolean(msg.input.useCtrl),
        });
      } else if (msg.type === 'leave') {
        removeGuest(boundMemberId);
      }
    });

    conn.on('close', () => {
      if (boundMemberId) {
        removeGuest(boundMemberId);
      }
    });
  });

  cb.onTransportChange(0);

  const handle: P2PSessionHandle = {
    isHost: true,
    code,
    playerId: hostId,
    sendInput: (inp) => {
      const prev = memberInputs.get(hostId) ?? emptyInput();
      memberInputs.set(hostId, {
        ...inp,
        attackHeld: Boolean(inp.attackHeld),
        attack: prev.attack || Boolean(inp.attack),
        useQ: prev.useQ || Boolean(inp.useQ),
        useE: prev.useE || Boolean(inp.useE),
        useR: prev.useR || Boolean(inp.useR),
        useCtrl: prev.useCtrl || Boolean(inp.useCtrl),
      });
    },
    updateMember: (patch) => {
      const host = room.members.find((m) => m.id === hostId);
      if (!host) return;
      if (patch.name !== undefined) {
        const s = patch.name.trim().slice(0, 16);
        if (s) host.name = s;
      }
      if (patch.preferredClass !== undefined) host.preferredClass = patch.preferredClass;
      if (patch.preferredRole !== undefined) host.preferredRole = patch.preferredRole;
      if (patch.preferredKiller !== undefined) host.preferredKiller = patch.preferredKiller;
      if (typeof patch.ready === 'boolean') host.ready = patch.ready;
      syncLobby();
    },
    updateConfig: (patch) => {
      if (typeof patch.fillWithBots === 'boolean') room.config.fillWithBots = patch.fillWithBots;
      if (typeof patch.isPublic === 'boolean') room.config.isPublic = patch.isPublic;
      syncLobby();
    },
    sendChat: (text) => {
      const clean = text.trim().slice(0, 140);
      if (!clean) return;
      const host = room.members.find((m) => m.id === hostId);
      room.chat.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderId: hostId,
        senderName: host?.name || 'Kurucu',
        text: clean,
        ts: Date.now(),
      });
      if (room.chat.length > 40) room.chat.shift();
      syncLobby();
    },
    startMatch: () => {
      if (!room.config.fillWithBots && room.members.length < 2) {
        cb.onError('Botlar kapalıyken başlamak için en az 2 gerçek oyuncu gerekir (veya Bot Doldur’u açın).');
        return;
      }
      if (tickInterval) {
        window.clearInterval(tickInterval);
        tickInterval = null;
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

      breachedTiles = new Set();
      gameState = createInitialGameState(participants);
      room.status = 'playing';

      for (const m of room.members) {
        memberInputs.set(m.id, emptyInput());
      }

      const snap = cloneRoom();
      broadcast({ type: 'room:started', room: snap, state: gameState });
      cb.onGameStarted(snap, { ...gameState });

      let lastTs = performance.now();
      tickInterval = window.setInterval(() => {
        if (!gameState || disposed) return;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.01, (now - lastTs) / 1000));
        lastTs = now;

        const inputs: Record<string, PlayerInput> = {};
        for (const m of room.members) {
          const inp = memberInputs.get(m.id) ?? emptyInput();
          inputs[m.id] = { ...inp };
          inp.attack = false;
          inp.useQ = false;
          inp.useE = false;
          inp.useR = false;
          inp.useCtrl = false;
        }

        stepGame(gameState, inputs, dt);
        const compact = toCompact(gameState);
        broadcast({ type: 'room:state', state: compact });
        cb.onGameState({ ...gameState });

        if (gameState.phase === 'ended') {
          room.status = 'ended';
          if (tickInterval) {
            window.clearInterval(tickInterval);
            tickInterval = null;
          }
          syncLobby();
        }
      }, 33);
    },
    rematch: () => {
      if (tickInterval) {
        window.clearInterval(tickInterval);
        tickInterval = null;
      }
      gameState = null;
      room.status = 'lobby';
      breachedTiles.clear();
      for (const m of room.members) {
        memberInputs.set(m.id, emptyInput());
        m.ready = m.id === hostId;
      }
      const snap = cloneRoom();
      broadcast({ type: 'room:rematch', room: snap });
      cb.onRematch(snap);
    },
    dispose: () => {
      disposed = true;
      if (tickInterval) {
        window.clearInterval(tickInterval);
        tickInterval = null;
      }
      for (const conn of guestConns.values()) {
        try {
          conn.close();
        } catch {
          // ignore
        }
      }
      guestConns.clear();
      try {
        peer?.destroy();
      } catch {
        // ignore
      }
    },
  };

  return { room: cloneRoom(), playerId: hostId, handle };
}

export async function joinP2PRoom(
  codeRaw: string,
  opts: {
    name: string;
    preferredClass: SurvivorClassId;
    preferredRole: OnlineRolePreference;
    preferredKiller: KillerId | 'random';
  },
  cb: P2PCallbacks
): Promise<{ room: OnlineRoomSnapshot; playerId: string; handle: P2PSessionHandle }> {
  const code = codeRaw.trim().toUpperCase();
  const peer = await openPeerWithId();

  return new Promise((resolve, reject) => {
    let settled = false;
    let disposed = false;
    let myPlayerId = '';
    let pingTimer: number | null = null;
    let staticTiles: GameState['tiles'] | null = null;
    let staticVents: GameState['vents'] = [];
    let staticCages: GameState['cages'] = [];
    let staticRooms: GameState['rooms'] = [];
    const appliedBreaches = new Set<number>();

    const conn = peer.connect(`${PEER_PREFIX}${code}`, { reliable: true });

    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        reject(new Error(`"${code}" kodlu odaya bağlanılamadı. Oda kodunu kontrol et.`));
      }
    }, 12000);

    peer.on('error', (err: any) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        if (err?.type === 'peer-unavailable') {
          reject(new Error(`"${code}" kodlu oda bulunamadı veya kurucu odadan ayrıldı.`));
        } else {
          reject(new Error('Odaya bağlanırken ağ hatası oluştu.'));
        }
      }
    });

    conn.on('open', () => {
      conn.send({
        type: 'hello',
        name: opts.name,
        preferredClass: opts.preferredClass,
        preferredRole: opts.preferredRole,
        preferredKiller: opts.preferredKiller,
      } satisfies GuestToHostMsg);
    });

    conn.on('data', (raw) => {
      const msg = raw as HostToGuestMsg;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'rejected') {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          try {
            peer.destroy();
          } catch {
            // ignore
          }
          reject(new Error(msg.message));
        }
        return;
      }

      if (msg.type === 'welcome') {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          myPlayerId = msg.playerId;

          pingTimer = window.setInterval(() => {
            if (conn.open) {
              conn.send({ type: 'ping', ts: Date.now() } satisfies GuestToHostMsg);
            }
          }, 5000);
          conn.send({ type: 'ping', ts: Date.now() } satisfies GuestToHostMsg);

          const handle: P2PSessionHandle = {
            isHost: false,
            code,
            playerId: myPlayerId,
            sendInput: (inp) => {
              if (conn.open && !disposed) {
                conn.send({ type: 'input', input: inp } satisfies GuestToHostMsg);
              }
            },
            updateMember: (patch) => {
              if (conn.open && !disposed) {
                conn.send({ type: 'member:update', patch } satisfies GuestToHostMsg);
              }
            },
            updateConfig: () => {
              // Only host modifies config
            },
            sendChat: (text) => {
              if (conn.open && !disposed) {
                conn.send({ type: 'chat:send', text } satisfies GuestToHostMsg);
              }
            },
            startMatch: () => {},
            rematch: () => {},
            dispose: () => {
              disposed = true;
              if (pingTimer) window.clearInterval(pingTimer);
              if (conn.open) {
                try {
                  conn.send({ type: 'leave' } satisfies GuestToHostMsg);
                  conn.close();
                } catch {
                  // ignore
                }
              }
              try {
                peer.destroy();
              } catch {
                // ignore
              }
            },
          };

          resolve({ room: msg.room, playerId: myPlayerId, handle });
        }
        return;
      }

      if (msg.type === 'room:lobby') {
        cb.onRoomUpdate(msg.room);
      } else if (msg.type === 'room:started') {
        staticTiles = msg.state.tiles.slice();
        staticVents = msg.state.vents;
        staticCages = msg.state.cages;
        staticRooms = msg.state.rooms;
        appliedBreaches.clear();
        cb.onGameStarted(msg.room, msg.state);
      } else if (msg.type === 'room:state') {
        if (!staticTiles) return;
        for (const idx of msg.state.breachedTileIndices) {
          if (!appliedBreaches.has(idx)) {
            appliedBreaches.add(idx);
            staticTiles[idx] = 3;
          }
        }
        const full: GameState = {
          phase: msg.state.phase,
          winner: msg.state.winner,
          winReason: msg.state.winReason,
          timeRemaining: msg.state.timeRemaining,
          elapsed: msg.state.elapsed,
          mapWidth: msg.state.mapWidth,
          mapHeight: msg.state.mapHeight,
          tileSize: msg.state.tileSize,
          cols: msg.state.cols,
          rows: msg.state.rows,
          tiles: staticTiles,
          doors: msg.state.doors,
          vents: staticVents,
          cages: staticCages,
          rooms: staticRooms,
          traps: msg.state.traps,
          barricades: msg.state.barricades,
          turrets: msg.state.turrets,
          projectiles: msg.state.projectiles,
          smileMinions: msg.state.smileMinions,
          effects: msg.state.effects,
          bloodStains: msg.state.bloodStains,
          floatingTexts: msg.state.floatingTexts,
          eventFeed: msg.state.eventFeed,
          shakeTimer: msg.state.shakeTimer,
          shakeIntensity: msg.state.shakeIntensity,
          players: msg.state.players,
          soundEvents: msg.state.soundEvents,
        };
        cb.onGameState(full);
      } else if (msg.type === 'room:rematch') {
        staticTiles = null;
        cb.onRematch(msg.room);
      } else if (msg.type === 'room:error') {
        cb.onError(msg.message);
      } else if (msg.type === 'pong') {
        cb.onTransportChange(Math.max(1, Date.now() - msg.ts));
      }
    });

    conn.on('close', () => {
      if (pingTimer) window.clearInterval(pingTimer);
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        reject(new Error('Oda kurucusuyla bağlantı kurulamadı.'));
      } else if (!disposed) {
        cb.onHostDisconnected?.();
      }
    });
  });
}
