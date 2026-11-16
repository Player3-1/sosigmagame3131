import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { ParticipantConfig, createInitialGameState, stepGame } from './src/game/engine';
import { GameState, PlayerInput, SurvivorClassId } from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomMember {
  id: string;
  name: string;
  preferredClass: SurvivorClassId;
  ws: WebSocket;
  input: PlayerInput;
}

interface GameRoom {
  code: string;
  hostId: string;
  members: RoomMember[];
  state: GameState | null;
  interval: ReturnType<typeof setInterval> | null;
}

const rooms = new Map<string, GameRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastRoomLobby(room: GameRoom) {
  const payload = JSON.stringify({
    type: 'room:lobby',
    code: room.code,
    hostId: room.hostId,
    members: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      preferredClass: m.preferredClass,
    })),
  });
  for (const m of room.members) {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(payload);
    }
  }
}

function startRoomMatch(room: GameRoom) {
  if (room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }

  const participants: ParticipantConfig[] = room.members.map((m) => ({
    id: m.id,
    name: m.name,
    isBot: false,
    preferredClass: m.preferredClass,
    preferredRole: 'random',
  }));

  const botClasses: SurvivorClassId[] = ['doctor', 'engineer', 'fighter', 'trapper', 'runner', 'builder'];
  let botIdx = 1;
  while (participants.length < 5) {
    participants.push({
      id: `bot_${botIdx}`,
      name: `Bot ${botIdx}`,
      isBot: true,
      preferredClass: botClasses[(botIdx - 1) % botClasses.length],
      preferredRole: 'random',
    });
    botIdx += 1;
  }

  room.state = createInitialGameState(participants);

  const startMsg = JSON.stringify({
    type: 'room:started',
    state: room.state,
  });
  for (const m of room.members) {
    if (m.ws.readyState === WebSocket.OPEN) {
      m.ws.send(startMsg);
    }
  }

  const TICK_MS = 33; // ~30Hz authoritative server tick
  room.interval = setInterval(() => {
    if (!room.state) return;
    const inputs: Record<string, PlayerInput> = {};
    for (const m of room.members) {
      inputs[m.id] = m.input;
      // Reset single-frame edge triggers after consuming
      m.input = {
        ...m.input,
        attack: false,
        useQ: false,
        useE: false,
        useR: false,
        useCtrl: false,
      };
    }

    stepGame(room.state, inputs, TICK_MS / 1000);

    const stateMsg = JSON.stringify({
      type: 'room:state',
      state: room.state,
    });
    for (const m of room.members) {
      if (m.ws.readyState === WebSocket.OPEN) {
        m.ws.send(stateMsg);
      }
    }

    if (room.state.phase === 'ended' && room.interval) {
      clearInterval(room.interval);
      room.interval = null;
    }
  }, TICK_MS);
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = `p_${Math.random().toString(36).slice(2, 9)}`;
    let currentRoom: GameRoom | null = null;

    ws.send(JSON.stringify({ type: 'connected', playerId: clientId }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'room:create') {
          const code = generateRoomCode();
          const member: RoomMember = {
            id: clientId,
            name: String(msg.name || 'Oyuncu 1').slice(0, 16),
            preferredClass: msg.preferredClass || 'runner',
            ws,
            input: {
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
            },
          };
          const room: GameRoom = {
            code,
            hostId: clientId,
            members: [member],
            state: null,
            interval: null,
          };
          rooms.set(code, room);
          currentRoom = room;
          broadcastRoomLobby(room);
        } else if (msg.type === 'room:join') {
          const code = String(msg.code || '').trim().toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            ws.send(JSON.stringify({ type: 'room:error', message: 'Oda bulunamadı.' }));
            return;
          }
          if (room.members.length >= 5) {
            ws.send(JSON.stringify({ type: 'room:error', message: 'Oda dolu (maksimum 5 oyuncu).' }));
            return;
          }
          if (room.state && room.state.phase === 'playing') {
            ws.send(JSON.stringify({ type: 'room:error', message: 'Bu odada maç zaten başladı.' }));
            return;
          }
          const member: RoomMember = {
            id: clientId,
            name: String(msg.name || `Oyuncu ${room.members.length + 1}`).slice(0, 16),
            preferredClass: msg.preferredClass || 'doctor',
            ws,
            input: {
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
            },
          };
          room.members.push(member);
          currentRoom = room;
          broadcastRoomLobby(room);
        } else if (msg.type === 'room:class' && currentRoom) {
          const m = currentRoom.members.find((x) => x.id === clientId);
          if (m) {
            m.preferredClass = msg.preferredClass;
            broadcastRoomLobby(currentRoom);
          }
        } else if (msg.type === 'room:start' && currentRoom && currentRoom.hostId === clientId) {
          startRoomMatch(currentRoom);
        } else if (msg.type === 'room:input' && currentRoom && currentRoom.state) {
          const m = currentRoom.members.find((x) => x.id === clientId);
          if (m && msg.input) {
            // Preserve edge-triggered ability presses until server tick consumes them
            m.input = {
              ...msg.input,
              attack: m.input.attack || Boolean(msg.input.attack),
              useQ: m.input.useQ || Boolean(msg.input.useQ),
              useE: m.input.useE || Boolean(msg.input.useE),
              useR: m.input.useR || Boolean(msg.input.useR),
              useCtrl: m.input.useCtrl || Boolean(msg.input.useCtrl),
            };
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      if (currentRoom) {
        currentRoom.members = currentRoom.members.filter((m) => m.id !== clientId);
        if (currentRoom.members.length === 0) {
          if (currentRoom.interval) clearInterval(currentRoom.interval);
          rooms.delete(currentRoom.code);
        } else {
          if (currentRoom.hostId === clientId) {
            currentRoom.hostId = currentRoom.members[0].id;
          }
          broadcastRoomLobby(currentRoom);
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
