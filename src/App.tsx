import { useCallback, useEffect, useRef, useState } from 'react';
import { GameView } from './components/GameView';
import { LobbyScreen } from './components/LobbyScreen';
import { soundFX } from './game/audio';
import { SURVIVOR_CLASS_LIST } from './game/constants';
import { ParticipantConfig, createInitialGameState, stepGame } from './game/engine';
import { GameState, KillerId, PlayerInput, SurvivorClassId } from './game/types';
import {
  RoomRealtimeClient,
  TransportKind,
  createOnlineRoom,
  joinOnlineRoom,
  leaveOnlineRoom,
  listPublicRooms,
  loadRoomSession,
  rematchOnlineRoom,
  saveRoomSession,
  sendOnlineChat,
  startOnlineMatch,
  updateOnlineConfig,
  updateOnlineMember,
} from './multiplayer/client';
import {
  OnlineRolePreference,
  OnlineRoomSnapshot,
  PublicRoomSummary,
  RoomSessionCredentials,
} from './multiplayer/types';

const BOT_NAMES = ['Aylin', 'Kerem', 'Mert', 'Zeynep', 'Deniz'];

export default function App() {
  const [playerName, setPlayerName] = useState('Oyuncu');
  const [selectedClass, setSelectedClass] = useState<SurvivorClassId>('runner');
  const [rolePreference, setRolePreference] = useState<'random' | 'survivor' | 'killer'>('random');
  const [killerPreference, setKillerPreference] = useState<KillerId | 'random'>('random');

  const [mode, setMode] = useState<'lobby' | 'solo' | 'online'>('lobby');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState('local_p1');

  // Online multiplayer state
  const rtClientRef = useRef<RoomRealtimeClient | null>(null);
  const credsRef = useRef<RoomSessionCredentials | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState('');
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [transportKind, setTransportKind] = useState<TransportKind>('connecting');
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);

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

  const attachRealtimeClient = useCallback(
    (creds: RoomSessionCredentials, initialState?: GameState | null) => {
      if (rtClientRef.current) {
        rtClientRef.current.dispose();
        rtClientRef.current = null;
      }
      credsRef.current = creds;
      setOnlinePlayerId(creds.playerId);
      setLocalPlayerId(creds.playerId);

      const client = new RoomRealtimeClient(creds, {
        onRoomUpdate: (room) => {
          setOnlineRoom(room);
          setOnlineError(null);
        },
        onGameStarted: (room, state) => {
          setOnlineRoom(room);
          setOnlineError(null);
          setLocalPlayerId(creds.playerId);
          setGameState(state);
          setMode('online');
        },
        onGameState: (state) => {
          setGameState(state);
          const me = state.players.find((p) => p.id === creds.playerId);
          if (me && state.soundEvents.length > 0) {
            soundFX.playEvents(state.soundEvents, me.x, me.y);
          }
        },
        onRematch: (room) => {
          setOnlineRoom(room);
          setGameState(null);
          setMode('lobby');
        },
        onTransportChange: (kind, rtt) => {
          setTransportKind(kind);
          if (rtt !== null) setPingMs(rtt);
        },
        onError: (msg) => {
          setOnlineError(msg);
        },
      });

      if (initialState) {
        client.hydrateFullState(initialState);
        setGameState(initialState);
        setMode('online');
      }

      rtClientRef.current = client;
    },
    []
  );

  const refreshPublicRooms = useCallback(async () => {
    try {
      const list = await listPublicRooms();
      setPublicRooms(list);
    } catch {
      // ignore background refresh error
    }
  }, []);

  // Attempt seamless room session restore on mount
  useEffect(() => {
    void refreshPublicRooms();
    const saved = loadRoomSession();
    if (saved) {
      joinOnlineRoom(saved.code, {
        name: 'Oyuncu',
        preferredClass: 'runner',
        playerId: saved.playerId,
        sessionToken: saved.sessionToken,
      })
        .then(({ room, creds, gameState: st }) => {
          setOnlineRoom(room);
          attachRealtimeClient(creds, st);
        })
        .catch(() => {
          saveRoomSession(null);
        });
    }

    return () => {
      if (rtClientRef.current) {
        rtClientRef.current.dispose();
        rtClientRef.current = null;
      }
    };
  }, [attachRealtimeClient, refreshPublicRooms]);

  // Debounce player name updates while inside an online room
  useEffect(() => {
    const creds = credsRef.current;
    if (!creds || !onlineRoom) return;
    const t = window.setTimeout(() => {
      const trimmed = playerName.trim();
      if (!trimmed) return;
      updateOnlineMember(creds, { name: trimmed })
        .then((room) => setOnlineRoom(room))
        .catch(() => {});
    }, 350);
    return () => window.clearTimeout(t);
  }, [playerName, onlineRoom?.code]);

  const handleSelectClass = useCallback((cls: SurvivorClassId) => {
    setSelectedClass(cls);
    const creds = credsRef.current;
    if (creds) {
      updateOnlineMember(creds, { preferredClass: cls })
        .then((room) => setOnlineRoom(room))
        .catch(() => {});
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      const { room, creds } = await createOnlineRoom({
        name: playerName.trim() || 'Oyuncu 1',
        preferredClass: selectedClass,
        preferredRole: rolePreference,
        preferredKiller: killerPreference,
        fillWithBots: true,
        isPublic: true,
      });
      setOnlineRoom(room);
      attachRealtimeClient(creds);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Oda oluşturulamadı.');
    } finally {
      setOnlineBusy(false);
    }
  }, [attachRealtimeClient, killerPreference, playerName, rolePreference, selectedClass]);

  const handleJoinRoom = useCallback(
    async (code: string) => {
      const clean = code.trim().toUpperCase();
      if (!clean) {
        setOnlineError('Lütfen 4 haneli oda kodunu girin.');
        return;
      }
      setOnlineError(null);
      setOnlineBusy(true);
      try {
        const { room, creds, gameState: st } = await joinOnlineRoom(clean, {
          name: playerName.trim() || 'Oyuncu',
          preferredClass: selectedClass,
          preferredRole: rolePreference,
          preferredKiller: killerPreference,
        });
        setOnlineRoom(room);
        attachRealtimeClient(creds, st);
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Odaya katılınamadı.');
      } finally {
        setOnlineBusy(false);
      }
    },
    [attachRealtimeClient, killerPreference, playerName, rolePreference, selectedClass]
  );

  const handleLeaveRoom = useCallback(async () => {
    const creds = credsRef.current;
    if (rtClientRef.current) {
      rtClientRef.current.dispose();
      rtClientRef.current = null;
    }
    credsRef.current = null;
    setOnlineRoom(null);
    setOnlinePlayerId('');
    setOnlineError(null);
    setPingMs(null);
    setGameState(null);
    setMode('lobby');
    if (creds) {
      await leaveOnlineRoom(creds);
    }
    void refreshPublicRooms();
  }, [refreshPublicRooms]);

  const handleToggleReady = useCallback(async (ready: boolean) => {
    const creds = credsRef.current;
    if (!creds) return;
    try {
      const room = await updateOnlineMember(creds, { ready });
      setOnlineRoom(room);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Durum güncellenemedi.');
    }
  }, []);

  const handleUpdateOnlineConfig = useCallback(
    async (patch: { fillWithBots?: boolean; isPublic?: boolean }) => {
      const creds = credsRef.current;
      if (!creds) return;
      try {
        const room = await updateOnlineConfig(creds, patch);
        setOnlineRoom(room);
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Ayar güncellenemedi.');
      }
    },
    []
  );

  const handleUpdateOnlineRole = useCallback(
    async (role: OnlineRolePreference, killer?: KillerId | 'random') => {
      const creds = credsRef.current;
      if (!creds) return;
      try {
        const room = await updateOnlineMember(creds, {
          preferredRole: role,
          preferredKiller: killer ?? killerPreference,
        });
        setOnlineRoom(room);
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Rol güncellenemedi.');
      }
    },
    [killerPreference]
  );

  const handleSendChat = useCallback(async (text: string) => {
    const creds = credsRef.current;
    if (!creds) return;
    try {
      await sendOnlineChat(creds, text);
    } catch {
      // ignore
    }
  }, []);

  const handleStartRoomMatch = useCallback(async () => {
    const creds = credsRef.current;
    if (!creds) return;
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      const { room, state } = await startOnlineMatch(creds);
      setOnlineRoom(room);
      rtClientRef.current?.hydrateFullState(state);
      setLocalPlayerId(creds.playerId);
      setGameState(state);
      setMode('online');
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Maç başlatılamadı.');
    } finally {
      setOnlineBusy(false);
    }
  }, []);

  const handleRematchOnline = useCallback(async () => {
    const creds = credsRef.current;
    if (!creds) return;
    try {
      const { room } = await rematchOnlineRoom(creds);
      setOnlineRoom(room);
      setGameState(null);
      setMode('lobby');
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Oda lobisine dönülemedi.');
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
      if (mode === 'online' && rtClientRef.current) {
        rtClientRef.current.sendInput(inp);
      }
    },
    [mode]
  );

  const handleExitToLobby = useCallback(() => {
    if (mode === 'online') {
      void handleLeaveRoom();
      return;
    }
    soloStateRef.current = null;
    setGameState(null);
    setMode('lobby');
  }, [handleLeaveRoom, mode]);

  if (mode !== 'lobby' && gameState) {
    const isOnlineHost = Boolean(
      mode === 'online' && onlineRoom && onlineRoom.hostId === onlinePlayerId
    );
    return (
      <GameView
        gameState={gameState}
        localPlayerId={localPlayerId}
        onInputChange={handleInputChange}
        onRestartSolo={mode === 'solo' ? startSoloMatch : undefined}
        onRematchOnline={isOnlineHost ? handleRematchOnline : undefined}
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
      onlinePlayerId={onlinePlayerId}
      onlineError={onlineError}
      onlineBusy={onlineBusy}
      transportKind={transportKind}
      pingMs={pingMs}
      publicRooms={publicRooms}
      onRefreshPublicRooms={refreshPublicRooms}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onLeaveRoom={handleLeaveRoom}
      onToggleReady={handleToggleReady}
      onUpdateOnlineConfig={handleUpdateOnlineConfig}
      onUpdateOnlineRole={handleUpdateOnlineRole}
      onSendChat={handleSendChat}
      onStartRoomMatch={handleStartRoomMatch}
    />
  );
}
