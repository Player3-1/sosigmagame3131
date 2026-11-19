import Peer, { type DataConnection } from 'peerjs';
import type { KillerId, PlayerInput, SurvivorClassId } from '../game/types.ts';
import {
  RoomRealtimeClient,
  joinOnlineRoom,
  leaveOnlineRoom,
  sendOnlineChat,
  updateOnlineMember,
} from './client.ts';
import type {
  OnlineRolePreference,
  OnlineRoomSnapshot,
  RoomSessionCredentials,
  ServerEvent,
} from './types.ts';

const PEER_PREFIX = 'karanlik-kacis-v2-';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

interface BridgedGuest {
  creds: RoomSessionCredentials;
  rt: RoomRealtimeClient;
  conn: DataConnection;
}

/**
 * Passive PeerJS bridge opened by the host browser of a Node-server room so that
 * guests on another origin/instance (e.g. Shared App URL vs Dev URL) can still
 * join and play seamlessly via WebRTC when their local /api/rooms/:code/join returns 404.
 */
export class ServerRoomP2PBridge {
  public readonly code: string;
  private peer: Peer | null = null;
  private disposed = false;
  private retriedUnavailable = false;
  private guests = new Map<DataConnection, BridgedGuest>();

  constructor(code: string) {
    this.code = code.trim().toUpperCase();
    this.initPeer();
  }

  private initPeer() {
    if (this.disposed) return;
    let peer: Peer;
    try {
      peer = new Peer(`${PEER_PREFIX}${this.code}`, {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      });
    } catch {
      return;
    }
    this.peer = peer;

    peer.on('error', (err: any) => {
      if (!this.disposed && err?.type === 'unavailable-id' && !this.retriedUnavailable) {
        this.retriedUnavailable = true;
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        window.setTimeout(() => this.initPeer(), 1500);
      }
    });

    peer.on('connection', (conn) => {
      if (this.disposed) {
        try {
          conn.close();
        } catch {
          // ignore
        }
        return;
      }
      this.handleGuestConnection(conn);
    });
  }

  private handleGuestConnection(conn: DataConnection) {
    let joining = false;

    const sendSafe = (msg: HostToGuestMsg) => {
      if (!conn.open || this.disposed) return;
      try {
        conn.send(msg);
      } catch {
        // ignore
      }
    };

    const cleanupGuest = () => {
      const entry = this.guests.get(conn);
      if (!entry) return;
      this.guests.delete(conn);
      entry.rt.dispose();
      void leaveOnlineRoom(entry.creds, { persistSession: false, skipAuth: true });
    };

    conn.on('data', async (raw) => {
      if (this.disposed) return;
      const msg = raw as GuestToHostMsg;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'ping') {
        sendSafe({ type: 'pong', ts: msg.ts });
        return;
      }

      if (msg.type === 'hello') {
        if (joining || this.guests.has(conn)) return;
        joining = true;
        try {
          const { room, creds } = await joinOnlineRoom(
            this.code,
            {
              name: msg.name,
              preferredClass: msg.preferredClass,
              preferredRole: msg.preferredRole,
              preferredKiller: msg.preferredKiller,
            },
            { persistSession: false, skipAuth: true }
          );

          if (this.disposed || !conn.open) {
            void leaveOnlineRoom(creds, { persistSession: false, skipAuth: true });
            return;
          }

          const rt = new RoomRealtimeClient(creds, {
            onRoomUpdate: (r) => sendSafe({ type: 'room:lobby', room: r }),
            onGameStarted: (r, st) => sendSafe({ type: 'room:started', room: r, state: st }),
            onGameState: () => {},
            onRawCompactState: (compact) => sendSafe({ type: 'room:state', state: compact }),
            onRematch: (r) => sendSafe({ type: 'room:rematch', room: r }),
            onTransportChange: () => {},
            onError: (message) => sendSafe({ type: 'room:error', message }),
          });

          this.guests.set(conn, { creds, rt, conn });
          sendSafe({ type: 'welcome', playerId: creds.playerId, room });
        } catch (err) {
          sendSafe({
            type: 'rejected',
            message: err instanceof Error ? err.message : 'Odaya katılınamadı.',
          });
          window.setTimeout(() => {
            try {
              conn.close();
            } catch {
              // ignore
            }
          }, 100);
        } finally {
          joining = false;
        }
        return;
      }

      const entry = this.guests.get(conn);
      if (!entry) return;

      if (msg.type === 'input') {
        entry.rt.sendInput(msg.input);
      } else if (msg.type === 'member:update') {
        void updateOnlineMember(entry.creds, msg.patch, { skipAuth: true }).catch(() => {});
      } else if (msg.type === 'chat:send') {
        void sendOnlineChat(entry.creds, msg.text, { skipAuth: true }).catch(() => {});
      } else if (msg.type === 'leave') {
        cleanupGuest();
        try {
          conn.close();
        } catch {
          // ignore
        }
      }
    });

    conn.on('close', cleanupGuest);
    conn.on('error', cleanupGuest);
  }

  public dispose() {
    this.disposed = true;
    for (const [conn, entry] of this.guests.entries()) {
      entry.rt.dispose();
      void leaveOnlineRoom(entry.creds, { persistSession: false, skipAuth: true });
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.guests.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
  }
}
