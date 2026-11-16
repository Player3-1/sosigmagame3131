import { useCallback, useEffect, useRef, useState } from 'react';
import { GameView } from './components/GameView';
import { LobbyScreen, OnlineRoomInfo } from './components/LobbyScreen';
import { soundFX } from './game/audio';
import { SURVIVOR_CLASS_LIST } from './game/constants';
import { ParticipantConfig, createInitialGameState, stepGame } from './game/engine';
import { GameState, KillerId, PlayerInput, SurvivorClassId } from './game/types';

const BOT_NAMES = ['Aylin', 'Kerem', 'Mert', 'Zeynep', 'Deniz'];

export default function App() {
  const [playerName, setPlayerName] = useState('Oyuncu');
  const [selectedClass, setSelectedClass] = useState<SurvivorClassId>('runner');
  const [rolePreference, setRolePreference] = useState<'random' | 'survivor' | 'killer'>('random');
  const [killerPreference, setKillerPreference] = useState<KillerId | 'random'>('random');

  const [mode, setMode] = useState<'lobby' | 'solo' | 'online'>('lobby');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState('local_p1');

  // Online WebSocket room state
  const wsRef = useRef<WebSocket | null>(null);
  const myWsIdRef = useRef<string>('');
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomInfo | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const soloStateRef = useRef<GameState | null>(null);
  const localInputRef = useRef<PlayerInput>({
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
  });

  // Connect WebSocket lazily when creating/joining online room
  const ensureSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'connected') {
            myWsIdRef.current = msg.playerId;
            setLocalPlayerId(msg.playerId);
            resolve(ws);
          } else if (msg.type === 'room:lobby') {
            setOnlineError(null);
            setOnlineRoom({
              code: msg.code,
              hostId: msg.hostId,
              playerId: myWsIdRef.current,
              members: msg.members,
            });
          } else if (msg.type === 'room:error') {
            setOnlineError(msg.message);
          } else if (msg.type === 'room:started') {
            setMode('online');
            setGameState(msg.state);
          } else if (msg.type === 'room:state') {
            const st: GameState = msg.state;
            setGameState(st);
            const me = st.players.find((p) => p.id === myWsIdRef.current);
            if (me && st.soundEvents.length > 0) {
              soundFX.playEvents(st.soundEvents, me.x, me.y);
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setOnlineError('Sunucuya bağlanılamadı.');
        reject(new Error('WS error'));
      };
    });
  }, []);

  const handleSelectClass = useCallback((cls: SurvivorClassId) => {
    setSelectedClass(cls);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:class', preferredClass: cls }));
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setOnlineError(null);
    const ws = await ensureSocket();
    ws.send(
      JSON.stringify({
        type: 'room:create',
        name: playerName || 'Oyuncu',
        preferredClass: selectedClass,
      })
    );
  }, [ensureSocket, playerName, selectedClass]);

  const handleJoinRoom = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        setOnlineError('Lütfen 4 haneli oda kodunu girin.');
        return;
      }
      setOnlineError(null);
      const ws = await ensureSocket();
      ws.send(
        JSON.stringify({
          type: 'room:join',
          code: code.trim(),
          name: playerName || 'Oyuncu',
          preferredClass: selectedClass,
        })
      );
    },
    [ensureSocket, playerName, selectedClass]
  );

  const handleStartRoomMatch = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'room:start' }));
    }
  }, []);

  const startSoloMatch = useCallback(() => {
    const otherClasses = SURVIVOR_CLASS_LIST.filter((c) => c.id !== selectedClass);
    const participants: ParticipantConfig[] = [
      {
        id: 'local_p1',
        name: playerName.trim() || 'Sen',
        isBot: false,
        preferredClass: selectedClass,
        preferredRole: rolePreference,
        preferredKiller: killerPreference,
      },
    ];

    for (let i = 0; i < 4; i++) {
      participants.push({
        id: `bot_${i + 1}`,
        name: BOT_NAMES[i],
        isBot: true,
        preferredClass: otherClasses[i % otherClasses.length].id,
        preferredRole: rolePreference === 'killer' ? 'survivor' : 'random',
      });
    }

    const initial = createInitialGameState(participants);
    soloStateRef.current = initial;
    setLocalPlayerId('local_p1');
    setGameState({ ...initial });
    setMode('solo');
  }, [killerPreference, playerName, rolePreference, selectedClass]);

  // Solo 60fps simulation loop
  useEffect(() => {
    if (mode !== 'solo') return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = soloStateRef.current;
      if (st && st.phase === 'playing') {
        const inp = { ...localInputRef.current };
        stepGame(st, { local_p1: inp }, dt);
        // Consume one-shot triggers after tick
        localInputRef.current.useQ = false;
        localInputRef.current.useE = false;
        localInputRef.current.useR = false;
        localInputRef.current.useCtrl = false;
        localInputRef.current.attack = false;

        const me = st.players.find((p) => p.id === 'local_p1');
        if (me && st.soundEvents.length > 0) {
          soundFX.playEvents(st.soundEvents, me.x, me.y);
        }
        setGameState({ ...st });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const handleInputChange = useCallback(
    (inp: PlayerInput) => {
      localInputRef.current = {
        ...inp,
        useQ: localInputRef.current.useQ || inp.useQ,
        useE: localInputRef.current.useE || inp.useE,
        useR: localInputRef.current.useR || inp.useR,
        useCtrl: localInputRef.current.useCtrl || inp.useCtrl,
        attack: localInputRef.current.attack || inp.attack,
      };
      if (mode === 'online' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'room:input', input: inp }));
      }
    },
    [mode]
  );

  const handleExitToLobby = useCallback(() => {
    soloStateRef.current = null;
    setGameState(null);
    setMode('lobby');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setOnlineRoom(null);
  }, []);

  if (mode !== 'lobby' && gameState) {
    return (
      <GameView
        gameState={gameState}
        localPlayerId={localPlayerId}
        onInputChange={handleInputChange}
        onRestartSolo={mode === 'solo' ? startSoloMatch : undefined}
        onExitToLobby={handleExitToLobby}
      />
    );
  }

  return (
    <LobbyScreen
      playerName={playerName}
      onChangePlayerName={setPlayerName}
      selectedClass={selectedClass}
      onSelectClass={handleSelectClass}
      rolePreference={rolePreference}
      onChangeRolePreference={setRolePreference}
      killerPreference={killerPreference}
      onChangeKillerPreference={setKillerPreference}
      onStartSolo={startSoloMatch}
      onlineRoom={onlineRoom}
      onlineError={onlineError}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onStartRoomMatch={handleStartRoomMatch}
    />
  );
}
