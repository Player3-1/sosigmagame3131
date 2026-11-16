import type { GameState, KillerId, PlayerInput, SurvivorClassId } from '../game/types.ts';
import type {
  CompactGameState,
  CreateRoomPayload,
  JoinRoomPayload,
  OnlineRolePreference,
  OnlineRoomSnapshot,
  PublicRoomSummary,
  RoomSessionCredentials,
  ServerEvent,
} from './types.ts';

export type TransportKind = 'connecting' | 'ws' | 'sse';

interface StaticMapCache {
  tiles: GameState['tiles'];
  vents: GameState['vents'];
  cages: GameState['cages'];
  rooms: GameState['rooms'];
  appliedBreaches: Set<number>;
}

const SESSION_KEY = 'kk_mp_session_v2';

export function saveRoomSession(creds: RoomSessionCredentials | null) {
  try {
    if (!creds) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(creds));
    }
  } catch {
    // ignore storage errors
  }
}

export function loadRoomSession(): RoomSessionCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.code && parsed?.playerId && parsed?.sessionToken) {
      return parsed as RoomSessionCredentials;
    }
  } catch {
    // ignore
  }
  return null;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const errMsg = body?.error || `Sunucu hatası (${res.status})`;
    throw new Error(errMsg);
  }
  return body as T;
}

export async function listPublicRooms(): Promise<PublicRoomSummary[]> {
  const data = await apiJson<{ rooms: PublicRoomSummary[] }>('/api/rooms', { method: 'GET' });
  return data.rooms ?? [];
}

export async function createOnlineRoom(payload: CreateRoomPayload): Promise<{
  room: OnlineRoomSnapshot;
  creds: RoomSessionCredentials;
}> {
  const data = await apiJson<{
    room: OnlineRoomSnapshot;
    playerId: string;
    sessionToken: string;
  }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const creds: RoomSessionCredentials = {
    code: data.room.code,
    playerId: data.playerId,
    sessionToken: data.sessionToken,
  };
  saveRoomSession(creds);
  return { room: data.room, creds };
}

export async function joinOnlineRoom(
  code: string,
  payload: JoinRoomPayload
): Promise<{
  room: OnlineRoomSnapshot;
  creds: RoomSessionCredentials;
  gameState: GameState | null;
}> {
  const cleanCode = code.trim().toUpperCase();
  const data = await apiJson<{
    room: OnlineRoomSnapshot;
    playerId: string;
    sessionToken: string;
    gameState?: GameState | null;
  }>(`/api/rooms/${encodeURIComponent(cleanCode)}/join`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const creds: RoomSessionCredentials = {
    code: data.room.code,
    playerId: data.playerId,
    sessionToken: data.sessionToken,
  };
  saveRoomSession(creds);
  return {
    room: data.room,
    creds,
    gameState: data.gameState ?? null,
  };
}

export async function leaveOnlineRoom(creds: RoomSessionCredentials): Promise<void> {
  saveRoomSession(null);
  try {
    await apiJson(`/api/rooms/${encodeURIComponent(creds.code)}/leave`, {
      method: 'POST',
      body: JSON.stringify({
        playerId: creds.playerId,
        sessionToken: creds.sessionToken,
      }),
    });
  } catch {
    // Best-effort leave
  }
}

export async function updateOnlineMember(
  creds: RoomSessionCredentials,
  patch: {
    name?: string;
    preferredClass?: SurvivorClassId;
    preferredRole?: OnlineRolePreference;
    preferredKiller?: KillerId | 'random';
    ready?: boolean;
  }
): Promise<OnlineRoomSnapshot> {
  const data = await apiJson<{ room: OnlineRoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(creds.code)}/member`,
    {
      method: 'POST',
      body: JSON.stringify({
        playerId: creds.playerId,
        sessionToken: creds.sessionToken,
        ...patch,
      }),
    }
  );
  return data.room;
}

export async function updateOnlineConfig(
  creds: RoomSessionCredentials,
  patch: { fillWithBots?: boolean; isPublic?: boolean }
): Promise<OnlineRoomSnapshot> {
  const data = await apiJson<{ room: OnlineRoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(creds.code)}/config`,
    {
      method: 'POST',
      body: JSON.stringify({
        playerId: creds.playerId,
        sessionToken: creds.sessionToken,
        ...patch,
      }),
    }
  );
  return data.room;
}

export async function sendOnlineChat(
  creds: RoomSessionCredentials,
  text: string
): Promise<void> {
  await apiJson(`/api/rooms/${encodeURIComponent(creds.code)}/chat`, {
    method: 'POST',
    body: JSON.stringify({
      playerId: creds.playerId,
      sessionToken: creds.sessionToken,
      text,
    }),
  });
}

export async function startOnlineMatch(
  creds: RoomSessionCredentials
): Promise<{ room: OnlineRoomSnapshot; state: GameState }> {
  return apiJson<{ room: OnlineRoomSnapshot; state: GameState }>(
    `/api/rooms/${encodeURIComponent(creds.code)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({
        playerId: creds.playerId,
        sessionToken: creds.sessionToken,
      }),
    }
  );
}

export async function rematchOnlineRoom(
  creds: RoomSessionCredentials
): Promise<{ room: OnlineRoomSnapshot }> {
  return apiJson<{ room: OnlineRoomSnapshot }>(
    `/api/rooms/${encodeURIComponent(creds.code)}/rematch`,
    {
      method: 'POST',
      body: JSON.stringify({
        playerId: creds.playerId,
        sessionToken: creds.sessionToken,
      }),
    }
  );
}

export interface RoomConnectionCallbacks {
  onRoomUpdate: (room: OnlineRoomSnapshot) => void;
  onGameStarted: (room: OnlineRoomSnapshot, state: GameState) => void;
  onGameState: (state: GameState) => void;
  onRematch: (room: OnlineRoomSnapshot) => void;
  onTransportChange: (kind: TransportKind, pingMs: number | null) => void;
  onError: (message: string) => void;
}

export class RoomRealtimeClient {
  private creds: RoomSessionCredentials;
  private cb: RoomConnectionCallbacks;
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private closed = false;
  private mapCache: StaticMapCache | null = null;
  private pingTimer: number | null = null;
  private wsFallbackTimer: number | null = null;
  private wsRetryTimer: number | null = null;
  private pendingEdgeInput = {
    attack: false,
    useQ: false,
    useE: false,
    useR: false,
    useCtrl: false,
  };
  private lastHttpInputSentAt = 0;
  private httpInputInFlight = false;
  private latestInput: PlayerInput | null = null;

  constructor(creds: RoomSessionCredentials, callbacks: RoomConnectionCallbacks) {
    this.creds = creds;
    this.cb = callbacks;
    this.cb.onTransportChange('connecting', null);
    this.connectWebSocket();
  }

  public hydrateFullState(state: GameState) {
    this.mapCache = {
      tiles: state.tiles.slice(),
      vents: state.vents,
      cages: state.cages,
      rooms: state.rooms,
      appliedBreaches: new Set(),
    };
  }

  private expandCompactState(compact: CompactGameState): GameState | null {
    if (!this.mapCache) return null;
    for (const idx of compact.breachedTileIndices) {
      if (!this.mapCache.appliedBreaches.has(idx)) {
        this.mapCache.appliedBreaches.add(idx);
        this.mapCache.tiles[idx] = 3;
      }
    }
    return {
      phase: compact.phase,
      winner: compact.winner,
      winReason: compact.winReason,
      timeRemaining: compact.timeRemaining,
      elapsed: compact.elapsed,
      mapWidth: compact.mapWidth,
      mapHeight: compact.mapHeight,
      tileSize: compact.tileSize,
      cols: compact.cols,
      rows: compact.rows,
      tiles: this.mapCache.tiles,
      doors: compact.doors,
      vents: this.mapCache.vents,
      cages: this.mapCache.cages,
      rooms: this.mapCache.rooms,
      traps: compact.traps,
      barricades: compact.barricades,
      turrets: compact.turrets,
      projectiles: compact.projectiles,
      smileMinions: compact.smileMinions,
      effects: compact.effects,
      bloodStains: compact.bloodStains,
      floatingTexts: compact.floatingTexts,
      eventFeed: compact.eventFeed,
      shakeTimer: compact.shakeTimer,
      shakeIntensity: compact.shakeIntensity,
      players: compact.players,
      soundEvents: compact.soundEvents,
    };
  }

  private async handleServerEvent(ev: ServerEvent) {
    if (this.closed) return;
    if (ev.type === 'room:lobby') {
      this.cb.onRoomUpdate(ev.room);
    } else if (ev.type === 'room:started') {
      this.hydrateFullState(ev.state);
      this.cb.onGameStarted(ev.room, ev.state);
    } else if (ev.type === 'room:state') {
      const full = this.expandCompactState(ev.state);
      if (full) {
        this.cb.onGameState(full);
      } else {
        // Missed room:started -> fetch full state once over HTTP
        try {
          const data = await apiJson<{ room: OnlineRoomSnapshot; state: GameState | null }>(
            `/api/rooms/${encodeURIComponent(this.creds.code)}/state?playerId=${encodeURIComponent(
              this.creds.playerId
            )}&token=${encodeURIComponent(this.creds.sessionToken)}`,
            { method: 'GET' }
          );
          if (data.state) {
            this.hydrateFullState(data.state);
            this.cb.onGameStarted(data.room, data.state);
          }
        } catch {
          // ignore
        }
      }
    } else if (ev.type === 'room:rematch') {
      this.mapCache = null;
      this.cb.onRematch(ev.room);
    } else if (ev.type === 'room:error') {
      this.cb.onError(ev.message);
    } else if (ev.type === 'pong') {
      const rtt = Math.max(1, Date.now() - ev.ts);
      this.cb.onTransportChange('ws', rtt);
    }
  }

  private connectWebSocket() {
    if (this.closed) return;
    if (this.wsFallbackTimer) {
      window.clearTimeout(this.wsFallbackTimer);
      this.wsFallbackTimer = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = new URLSearchParams({
      code: this.creds.code,
      playerId: this.creds.playerId,
      token: this.creds.sessionToken,
    });
    const wsUrl = `${proto}//${window.location.host}/ws?${qs.toString()}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.activateSseFallback();
      return;
    }
    this.ws = ws;

    // If WS doesn't open within 1.8s (e.g. restrictive proxy), switch to SSE seamlessly
    this.wsFallbackTimer = window.setTimeout(() => {
      if (!this.closed && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.activateSseFallback();
      }
    }, 1800);

    ws.onopen = () => {
      if (this.closed) {
        ws.close();
        return;
      }
      if (this.wsFallbackTimer) {
        window.clearTimeout(this.wsFallbackTimer);
        this.wsFallbackTimer = null;
      }
      // Close SSE fallback if active since WS succeeded
      if (this.sse) {
        this.sse.close();
        this.sse = null;
      }
      this.cb.onTransportChange('ws', null);
      ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));

      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, 5000);
    };

    ws.onmessage = (msgEv) => {
      try {
        const parsed = JSON.parse(msgEv.data) as ServerEvent;
        void this.handleServerEvent(parsed);
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      if (!this.closed) {
        this.activateSseFallback();
      }
    };

    ws.onclose = () => {
      if (this.pingTimer) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.ws === ws) {
        this.ws = null;
      }
      if (!this.closed) {
        this.activateSseFallback();
        // Periodically try upgrading back to WebSocket
        if (!this.wsRetryTimer) {
          this.wsRetryTimer = window.setTimeout(() => {
            this.wsRetryTimer = null;
            if (!this.closed && !this.ws) {
              this.connectWebSocket();
            }
          }, 5000);
        }
      }
    };
  }

  private activateSseFallback() {
    if (this.closed || this.sse) return;
    const qs = new URLSearchParams({
      playerId: this.creds.playerId,
      token: this.creds.sessionToken,
    });
    const url = `/api/rooms/${encodeURIComponent(this.creds.code)}/stream?${qs.toString()}`;
    const sse = new EventSource(url);
    this.sse = sse;

    sse.onopen = () => {
      if (!this.closed && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.cb.onTransportChange('sse', null);
      }
    };

    sse.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as ServerEvent;
        void this.handleServerEvent(parsed);
      } catch {
        // ignore
      }
    };

    sse.onerror = () => {
      // EventSource automatically retries on network blips
    };
  }

  public sendInput(inp: PlayerInput) {
    if (this.closed) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:input', input: inp }));
      return;
    }

    // Fallback HTTP input path when SSE mode is active
    this.pendingEdgeInput.attack = this.pendingEdgeInput.attack || inp.attack;
    this.pendingEdgeInput.useQ = this.pendingEdgeInput.useQ || inp.useQ;
    this.pendingEdgeInput.useE = this.pendingEdgeInput.useE || inp.useE;
    this.pendingEdgeInput.useR = this.pendingEdgeInput.useR || inp.useR;
    this.pendingEdgeInput.useCtrl = this.pendingEdgeInput.useCtrl || inp.useCtrl;
    this.latestInput = inp;

    const hasEdge =
      this.pendingEdgeInput.attack ||
      this.pendingEdgeInput.useQ ||
      this.pendingEdgeInput.useE ||
      this.pendingEdgeInput.useR ||
      this.pendingEdgeInput.useCtrl;

    const now = performance.now();
    if (!hasEdge && now - this.lastHttpInputSentAt < 38) return;
    if (this.httpInputInFlight) return;

    this.flushHttpInput();
  }

  private async flushHttpInput() {
    if (this.closed || !this.latestInput) return;
    this.httpInputInFlight = true;
    this.lastHttpInputSentAt = performance.now();
    const payload: PlayerInput = {
      ...this.latestInput,
      attack: this.pendingEdgeInput.attack,
      useQ: this.pendingEdgeInput.useQ,
      useE: this.pendingEdgeInput.useE,
      useR: this.pendingEdgeInput.useR,
      useCtrl: this.pendingEdgeInput.useCtrl,
    };
    this.pendingEdgeInput = {
      attack: false,
      useQ: false,
      useE: false,
      useR: false,
      useCtrl: false,
    };
    try {
      await fetch(`/api/rooms/${encodeURIComponent(this.creds.code)}/input`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: this.creds.playerId,
          sessionToken: this.creds.sessionToken,
          input: payload,
        }),
      });
    } catch {
      // ignore transient network errors
    } finally {
      this.httpInputInFlight = false;
    }
  }

  public dispose() {
    this.closed = true;
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    if (this.wsFallbackTimer) window.clearTimeout(this.wsFallbackTimer);
    if (this.wsRetryTimer) window.clearTimeout(this.wsRetryTimer);
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disposed');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
  }
}
