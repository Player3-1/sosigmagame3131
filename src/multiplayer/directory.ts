import Peer, { type DataConnection } from 'peerjs';
import type { PublicRoomSummary } from './types.ts';

const HUB_PEER_ID = 'karanlik-kacis-room-hub-v1';
const BC_CHANNEL_NAME = 'kk_public_rooms_bc_v1';
const STORAGE_KEY = 'kk_p2p_public_rooms_v1';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type HubEntry = PublicRoomSummary & {
  updatedAt: number;
  ownerPeerId?: string;
};

type ClientToHubMsg =
  | { type: 'room:upsert'; room: PublicRoomSummary }
  | { type: 'room:remove'; code: string }
  | { type: 'rooms:list' };

type HubToClientMsg = {
  type: 'rooms:sync';
  rooms: PublicRoomSummary[];
};

function sortRooms(list: PublicRoomSummary[]): PublicRoomSummary[] {
  return [...list].sort(
    (a, b) => b.playerCount - a.playerCount || (b.createdAt ?? 0) - (a.createdAt ?? 0)
  );
}

function readLocalRoomsMap(): Record<string, HubEntry> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cleaned: Record<string, HubEntry> = {};
    for (const [code, entry] of Object.entries(parsed || {})) {
      const e = entry as HubEntry;
      if (e && e.code && typeof e.updatedAt === 'number' && now - e.updatedAt < 25000) {
        cleaned[code] = e;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export class GlobalRoomDirectory {
  private disposed = false;
  private listeners = new Set<(rooms: PublicRoomSummary[]) => void>();
  private hostedRoom: PublicRoomSummary | null = null;

  private bc: BroadcastChannel | null = null;
  private peer: Peer | null = null;
  private isHub = false;
  private hubConn: DataConnection | null = null;
  private clientConns = new Map<string, DataConnection>();
  private hubEntries = new Map<string, HubEntry>();
  private remoteRooms = new Map<string, HubEntry>();
  private bcRooms = new Map<string, HubEntry>();

  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private connecting = false;

  constructor() {
    this.setupBroadcastChannel();
    this.syncFromLocalStorage();
    this.connectOrElectHub();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.disposed) return;
      this.tickHeartbeat();
    }, 4500);
  }

  private setupBroadcastChannel() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel(BC_CHANNEL_NAME);
        this.bc.onmessage = (ev) => {
          const msg = ev.data;
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'bc:upsert' && msg.room?.code) {
            this.bcRooms.set(msg.room.code, { ...msg.room, updatedAt: Date.now() });
            this.notify();
          } else if (msg.type === 'bc:remove' && typeof msg.code === 'string') {
            this.bcRooms.delete(msg.code);
            this.remoteRooms.delete(msg.code);
            this.notify();
          } else if (msg.type === 'bc:ping' && this.hostedRoom) {
            this.bc?.postMessage({ type: 'bc:upsert', room: this.hostedRoom });
          }
        };
        this.bc.postMessage({ type: 'bc:ping' });
      }
    } catch {
      // BroadcastChannel unavailable
    }
  }

  private syncFromLocalStorage() {
    const localMap = readLocalRoomsMap();
    const now = Date.now();
    for (const [code, entry] of Object.entries(localMap)) {
      if (entry.status === 'lobby' && now - entry.updatedAt < 25000) {
        this.remoteRooms.set(code, entry);
      }
    }
  }

  private tickHeartbeat() {
    const now = Date.now();

    // Expire stale entries in both hub and client caches
    let hubChanged = false;
    for (const [code, entry] of this.hubEntries.entries()) {
      if (now - entry.updatedAt > 20000 || entry.status !== 'lobby') {
        this.hubEntries.delete(code);
        hubChanged = true;
      }
    }
    if (this.hostedRoom) {
      if (this.isHub) {
        this.hubEntries.set(this.hostedRoom.code, {
          ...this.hostedRoom,
          updatedAt: now,
          ownerPeerId: HUB_PEER_ID,
        });
        hubChanged = true;
      } else if (this.hubConn?.open) {
        try {
          this.hubConn.send({ type: 'room:upsert', room: this.hostedRoom } satisfies ClientToHubMsg);
        } catch {
          // ignore
        }
      }
      try {
        this.bc?.postMessage({ type: 'bc:upsert', room: this.hostedRoom });
      } catch {
        // ignore
      }
    }
    if (this.isHub && hubChanged) {
      this.broadcastHubSync();
    }

    let remoteChanged = false;
    for (const [code, entry] of this.remoteRooms.entries()) {
      if (now - entry.updatedAt > 20000 || entry.status !== 'lobby') {
        this.remoteRooms.delete(code);
        remoteChanged = true;
      }
    }
    for (const [code, entry] of this.bcRooms.entries()) {
      if (now - entry.updatedAt > 20000 || entry.status !== 'lobby') {
        this.bcRooms.delete(code);
        remoteChanged = true;
      }
    }
    if (remoteChanged) {
      this.notify();
    }

    if (!this.isHub && (!this.hubConn || !this.hubConn.open) && !this.connecting) {
      this.connectOrElectHub();
    }
  }

  private cleanupPeer() {
    if (this.hubConn) {
      try {
        this.hubConn.close();
      } catch {
        // ignore
      }
      this.hubConn = null;
    }
    for (const conn of this.clientConns.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.clientConns.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    this.isHub = false;
  }

  private scheduleReconnect(delayMs: number) {
    if (this.disposed || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) {
        this.connectOrElectHub();
      }
    }, delayMs);
  }

  private connectOrElectHub() {
    if (this.disposed || this.connecting) return;
    this.connecting = true;
    this.cleanupPeer();

    let peer: Peer;
    try {
      peer = new Peer({ debug: 0, config: { iceServers: ICE_SERVERS } });
    } catch {
      this.connecting = false;
      this.scheduleReconnect(4000);
      return;
    }
    this.peer = peer;

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        this.connecting = false;
        this.cleanupPeer();
        this.scheduleReconnect(3500);
      }
    }, 6000);

    peer.once('open', () => {
      if (this.disposed || this.peer !== peer) {
        window.clearTimeout(timeout);
        return;
      }
      const conn = peer.connect(HUB_PEER_ID, { reliable: true });
      this.hubConn = conn;

      conn.once('open', () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        this.connecting = false;
        if (this.hostedRoom) {
          try {
            conn.send({ type: 'room:upsert', room: this.hostedRoom } satisfies ClientToHubMsg);
          } catch {
            // ignore
          }
        }
        try {
          conn.send({ type: 'rooms:list' } satisfies ClientToHubMsg);
        } catch {
          // ignore
        }
      });

      conn.on('data', (raw) => {
        const msg = raw as HubToClientMsg;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'rooms:sync' && Array.isArray(msg.rooms)) {
          const now = Date.now();
          const nextMap = new Map<string, HubEntry>();
          for (const r of msg.rooms) {
            if (r?.code && r.status === 'lobby') {
              nextMap.set(r.code, { ...r, updatedAt: now });
            }
          }
          // Preserve locally known BroadcastChannel/localStorage entries
          for (const [code, entry] of Object.entries(readLocalRoomsMap())) {
            if (!nextMap.has(code) && entry.status === 'lobby') {
              nextMap.set(code, entry);
            }
          }
          this.remoteRooms = nextMap;
          this.notify();
        }
      });

      conn.on('close', () => {
        if (this.hubConn === conn) {
          this.hubConn = null;
        }
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          this.connecting = false;
          this.tryBecomeHub();
        } else if (!this.disposed) {
          this.scheduleReconnect(300 + Math.floor(Math.random() * 600));
        }
      });

      conn.on('error', () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          this.connecting = false;
          this.tryBecomeHub();
        }
      });
    });

    peer.on('error', (err: any) => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        this.connecting = false;
        if (err?.type === 'peer-unavailable') {
          this.tryBecomeHub();
        } else {
          this.cleanupPeer();
          this.scheduleReconnect(4000);
        }
      }
    });
  }

  private tryBecomeHub() {
    if (this.disposed || this.connecting) return;
    const delay = 120 + Math.floor(Math.random() * 450);
    window.setTimeout(() => {
      if (this.disposed || this.isHub || this.connecting) return;
      this.connecting = true;
      this.cleanupPeer();

      let hubPeer: Peer;
      try {
        hubPeer = new Peer(HUB_PEER_ID, { debug: 0, config: { iceServers: ICE_SERVERS } });
      } catch {
        this.connecting = false;
        this.scheduleReconnect(3000);
        return;
      }
      this.peer = hubPeer;

      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connecting = false;
          this.cleanupPeer();
          this.scheduleReconnect(3000);
        }
      }, 6000);

      hubPeer.once('open', () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        this.connecting = false;
        this.isHub = true;

        this.hubEntries.clear();
        if (this.hostedRoom) {
          this.hubEntries.set(this.hostedRoom.code, {
            ...this.hostedRoom,
            updatedAt: Date.now(),
            ownerPeerId: HUB_PEER_ID,
          });
        }
        this.broadcastHubSync();
      });

      hubPeer.on('connection', (conn) => {
        const remoteId = conn.peer;
        this.clientConns.set(remoteId, conn);

        conn.on('open', () => {
          this.sendHubSyncTo(conn);
        });

        conn.on('data', (raw) => {
          const msg = raw as ClientToHubMsg;
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'room:upsert' && msg.room?.code) {
            if (msg.room.status !== 'lobby') {
              this.hubEntries.delete(msg.room.code);
            } else {
              this.hubEntries.set(msg.room.code, {
                ...msg.room,
                updatedAt: Date.now(),
                ownerPeerId: remoteId,
              });
            }
            this.broadcastHubSync();
          } else if (msg.type === 'room:remove' && typeof msg.code === 'string') {
            if (this.hubEntries.delete(msg.code)) {
              this.broadcastHubSync();
            }
          } else if (msg.type === 'rooms:list') {
            this.sendHubSyncTo(conn);
          }
        });

        conn.on('close', () => {
          this.clientConns.delete(remoteId);
          let removed = false;
          for (const [code, entry] of this.hubEntries.entries()) {
            if (entry.ownerPeerId === remoteId) {
              this.hubEntries.delete(code);
              removed = true;
            }
          }
          if (removed) {
            this.broadcastHubSync();
          }
        });
      });

      hubPeer.on('error', (err: any) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          this.connecting = false;
          this.cleanupPeer();
          if (err?.type === 'unavailable-id') {
            this.scheduleReconnect(200);
          } else {
            this.scheduleReconnect(3500);
          }
        }
      });
    }, delay);
  }

  private getHubPublicList(): PublicRoomSummary[] {
    const now = Date.now();
    const list: PublicRoomSummary[] = [];
    for (const [code, entry] of this.hubEntries.entries()) {
      if (now - entry.updatedAt > 20000 || entry.status !== 'lobby') {
        this.hubEntries.delete(code);
        continue;
      }
      const { updatedAt: _u, ownerPeerId: _o, ...summary } = entry;
      list.push(summary);
    }
    return sortRooms(list);
  }

  private sendHubSyncTo(conn: DataConnection) {
    if (!conn.open) return;
    try {
      conn.send({
        type: 'rooms:sync',
        rooms: this.getHubPublicList(),
      } satisfies HubToClientMsg);
    } catch {
      // ignore
    }
  }

  private broadcastHubSync() {
    const rooms = this.getHubPublicList();
    const msg: HubToClientMsg = { type: 'rooms:sync', rooms };
    for (const conn of this.clientConns.values()) {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch {
          // ignore
        }
      }
    }
    const now = Date.now();
    const nextRemote = new Map<string, HubEntry>();
    for (const r of rooms) {
      nextRemote.set(r.code, { ...r, updatedAt: now });
    }
    this.remoteRooms = nextRemote;
    this.notify();
  }

  public setHostedRoom(room: PublicRoomSummary | null) {
    const prevCode = this.hostedRoom?.code;
    this.hostedRoom = room && room.status === 'lobby' ? { ...room } : null;

    if (prevCode && (!this.hostedRoom || this.hostedRoom.code !== prevCode)) {
      this.remoteRooms.delete(prevCode);
      if (this.isHub) {
        this.hubEntries.delete(prevCode);
        this.broadcastHubSync();
      } else if (this.hubConn?.open) {
        try {
          this.hubConn.send({ type: 'room:remove', code: prevCode } satisfies ClientToHubMsg);
        } catch {
          // ignore
        }
      }
      try {
        this.bc?.postMessage({ type: 'bc:remove', code: prevCode });
      } catch {
        // ignore
      }
    }

    if (this.hostedRoom) {
      const entry: HubEntry = { ...this.hostedRoom, updatedAt: Date.now() };
      this.remoteRooms.set(this.hostedRoom.code, entry);
      if (this.isHub) {
        this.hubEntries.set(this.hostedRoom.code, { ...entry, ownerPeerId: HUB_PEER_ID });
        this.broadcastHubSync();
      } else if (this.hubConn?.open) {
        try {
          this.hubConn.send({ type: 'room:upsert', room: this.hostedRoom } satisfies ClientToHubMsg);
        } catch {
          // ignore
        }
      }
      try {
        this.bc?.postMessage({ type: 'bc:upsert', room: this.hostedRoom });
      } catch {
        // ignore
      }
    } else if (prevCode) {
      this.notify();
    }
  }

  public refresh() {
    this.syncFromLocalStorage();
    try {
      this.bc?.postMessage({ type: 'bc:ping' });
    } catch {
      // ignore
    }
    if (this.isHub) {
      this.broadcastHubSync();
    } else if (this.hubConn?.open) {
      try {
        this.hubConn.send({ type: 'rooms:list' } satisfies ClientToHubMsg);
      } catch {
        // ignore
      }
    } else if (!this.connecting) {
      this.connectOrElectHub();
    }
    this.notify();
  }

  public getRooms(): PublicRoomSummary[] {
    const now = Date.now();
    const map = new Map<string, PublicRoomSummary>();
    for (const [code, entry] of Object.entries(readLocalRoomsMap())) {
      if (entry.status === 'lobby' && now - entry.updatedAt < 25000) {
        const { updatedAt: _u, ownerPeerId: _o, ...summary } = entry;
        map.set(code, summary);
      }
    }
    for (const [code, entry] of this.bcRooms.entries()) {
      if (entry.status === 'lobby' && now - entry.updatedAt < 25000) {
        const { updatedAt: _u, ownerPeerId: _o, ...summary } = entry;
        map.set(code, summary);
      }
    }
    for (const [code, entry] of this.remoteRooms.entries()) {
      if (entry.status === 'lobby' && now - entry.updatedAt < 25000) {
        const { updatedAt: _u, ownerPeerId: _o, ...summary } = entry;
        map.set(code, summary);
      }
    }
    if (this.hostedRoom && this.hostedRoom.status === 'lobby') {
      map.set(this.hostedRoom.code, this.hostedRoom);
    }
    return sortRooms(Array.from(map.values()));
  }

  public subscribe(fn: (rooms: PublicRoomSummary[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.getRooms());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    const rooms = this.getRooms();
    for (const fn of this.listeners) {
      fn(rooms);
    }
  }

  public dispose() {
    this.disposed = true;
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.hostedRoom) {
      const code = this.hostedRoom.code;
      this.hostedRoom = null;
      if (this.hubConn?.open) {
        try {
          this.hubConn.send({ type: 'room:remove', code } satisfies ClientToHubMsg);
        } catch {
          // ignore
        }
      }
      try {
        this.bc?.postMessage({ type: 'bc:remove', code });
      } catch {
        // ignore
      }
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch {
        // ignore
      }
      this.bc = null;
    }
    this.cleanupPeer();
    this.listeners.clear();
  }
}
