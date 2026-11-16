import { useCallback, useEffect, useRef, useState } from 'react';
import { GameView } from './components/GameView';
import { LobbyScreen } from './components/LobbyScreen';
import { TutorialArena } from './components/TutorialArena';
import { soundFX } from './game/audio';
import { SURVIVOR_CLASS_LIST } from './game/constants';
import { ParticipantConfig, createInitialGameState, stepGame } from './game/engine';
import { GameState, KillerId, PlayerInput, SurvivorClassId } from './game/types';
import {
  RoomRealtimeClient,
  TransportKind,
  createOnlineRoom,
  hasNodeBackend,
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
  P2PCallbacks,
  P2PSessionHandle,
  createP2PHostRoom,
  joinP2PRoom,
} from './multiplayer/p2p';
import {
  OnlineRolePreference,
  OnlineRoomSnapshot,
  PublicRoomSummary,
  RoomSessionCredentials,
} from './multiplayer/types';

const BOT_NAMES = ['Aylin', 'Kerem', 'Mert', 'Zeynep', 'Deniz'];
const STORAGE_TUTORIAL_KEY = 'kk_tutorial_completed';
const STORAGE_NAME_KEY = 'kk_player_name';
const STORAGE_CLASS_KEY = 'kk_selected_class';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, val: string) {
  try {
    window.localStorage.setItem(key, val);
  } catch {
    // ignore storage restrictions
  }
}

function getInitialClass(): SurvivorClassId {
  const saved = readStorage(STORAGE_CLASS_KEY);
  if (saved && SURVIVOR_CLASS_LIST.some((c) => c.id === saved)) {
    return saved as SurvivorClassId;
  }
  return 'runner';
}

export default function App() {
  const [playerName, setPlayerName] = useState(() => readStorage(STORAGE_NAME_KEY) || 'Oyuncu');
  const [selectedClass, setSelectedClass] = useState<SurvivorClassId>(getInitialClass);
  const [rolePreference, setRolePreference] = useState<'random' | 'survivor' | 'killer'>('random');
  const [killerPreference, setKillerPreference] = useState<KillerId | 'random'>('random');
  const [showTutorial, setShowTutorial] = useState(() => readStorage(STORAGE_TUTORIAL_KEY) !== '1');

  const [mode, setMode] = useState<'lobby' | 'solo' | 'online'>('lobby');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState('local_p1');

  const backendAvailable = hasNodeBackend();

  // Online multiplayer state (supports both Node Server + Vercel WebRTC P2P)
  const rtClientRef = useRef<RoomRealtimeClient | null>(null);
  const p2pRef = useRef<P2PSessionHandle | null>(null);
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

  useEffect(() => {
    const trimmed = playerName.trim();
    if (trimmed) writeStorage(STORAGE_NAME_KEY, trimmed);
  }, [playerName]);

  useEffect(() => {
    writeStorage(STORAGE_CLASS_KEY, selectedClass);
  }, [selectedClass]);

  const attachRealtimeClient = useCallback(
    (creds: RoomSessionCredentials, initialState?: GameState | null) => {
      if (rtClientRef.current) {
        rtClientRef.current.dispose();
        rtClientRef.current = null;
      }
      if (p2pRef.current) {
        p2pRef.current.dispose();
        p2pRef.current = null;
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

  const makeP2PCallbacks = useCallback(
    (myIdGetter: () => string): P2PCallbacks => ({
      onRoomUpdate: (room) => {
        setOnlineRoom(room);
        setOnlineError(null);
      },
      onGameStarted: (room, state) => {
        setOnlineRoom(room);
        setOnlineError(null);
        setLocalPlayerId(myIdGetter());
        setGameState(state);
        setMode('online');
      },
      onGameState: (state) => {
        setGameState(state);
        const me = state.players.find((p) => p.id === myIdGetter());
        if (me && state.soundEvents.length > 0) {
          soundFX.playEvents(state.soundEvents, me.x, me.y);
        }
      },
      onRematch: (room) => {
        setOnlineRoom(room);
        setGameState(null);
        setMode('lobby');
      },
      onTransportChange: (rtt) => {
        setTransportKind('p2p');
        if (rtt !== null) setPingMs(rtt);
      },
      onError: (msg) => {
        setOnlineError(msg);
      },
      onHostDisconnected: () => {
        if (p2pRef.current) {
          p2pRef.current.dispose();
          p2pRef.current = null;
        }
        setOnlineRoom(null);
        setOnlinePlayerId('');
        setGameState(null);
        setMode('lobby');
        setOnlineError('Oda kurucusu odadan ayrıldı.');
      },
    }),
    []
  );

  const refreshPublicRooms = useCallback(async () => {
    if (!backendAvailable) return;
    try {
      const list = await listPublicRooms();
      setPublicRooms(list);
    } catch {
      // ignore background refresh error
    }
  }, [backendAvailable]);

  // Attempt seamless room session restore on mount (only when Node backend is active)
  useEffect(() => {
    if (backendAvailable) {
      void refreshPublicRooms();
      const saved = loadRoomSession();
      if (saved) {
        joinOnlineRoom(saved.code, {
          name: readStorage(STORAGE_NAME_KEY) || 'Oyuncu',
          preferredClass: getInitialClass(),
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
    }

    return () => {
      if (rtClientRef.current) {
        rtClientRef.current.dispose();
        rtClientRef.current = null;
      }
      if (p2pRef.current) {
        p2pRef.current.dispose();
        p2pRef.current = null;
      }
    };
  }, [attachRealtimeClient, backendAvailable, refreshPublicRooms]);

  // Debounce player name updates while inside an online room
  useEffect(() => {
    if (!onlineRoom) return;
    const t = window.setTimeout(() => {
      const trimmed = playerName.trim();
      if (!trimmed) return;
      if (p2pRef.current) {
        p2pRef.current.updateMember({ name: trimmed });
      } else if (credsRef.current) {
        updateOnlineMember(credsRef.current, { name: trimmed })
          .then((room) => setOnlineRoom(room))
          .catch(() => {});
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [playerName, onlineRoom?.code]);

  const handleSelectClass = useCallback((cls: SurvivorClassId) => {
    setSelectedClass(cls);
    if (p2pRef.current) {
      p2pRef.current.updateMember({ preferredClass: cls });
    } else if (credsRef.current) {
      updateOnlineMember(credsRef.current, { preferredClass: cls })
        .then((room) => setOnlineRoom(room))
        .catch(() => {});
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      if (backendAvailable) {
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
      } else {
        if (p2pRef.current) {
          p2pRef.current.dispose();
          p2pRef.current = null;
        }
        let assignedId = 'p_host';
        const { room, playerId, handle } = await createP2PHostRoom(
          {
            name: playerName.trim() || 'Oyuncu 1',
            preferredClass: selectedClass,
            preferredRole: rolePreference,
            preferredKiller: killerPreference,
            fillWithBots: true,
          },
          makeP2PCallbacks(() => assignedId)
        );
        assignedId = playerId;
        p2pRef.current = handle;
        setTransportKind('p2p');
        setPingMs(0);
        setOnlinePlayerId(playerId);
        setLocalPlayerId(playerId);
        setOnlineRoom(room);
      }
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Oda oluşturulamadı.');
    } finally {
      setOnlineBusy(false);
    }
  }, [
    attachRealtimeClient,
    backendAvailable,
    killerPreference,
    makeP2PCallbacks,
    playerName,
    rolePreference,
    selectedClass,
  ]);

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
        if (backendAvailable) {
          const { room, creds, gameState: st } = await joinOnlineRoom(clean, {
            name: playerName.trim() || 'Oyuncu',
            preferredClass: selectedClass,
            preferredRole: rolePreference,
            preferredKiller: killerPreference,
          });
          setOnlineRoom(room);
          attachRealtimeClient(creds, st);
        } else {
          if (p2pRef.current) {
            p2pRef.current.dispose();
            p2pRef.current = null;
          }
          let assignedId = '';
          const { room, playerId, handle } = await joinP2PRoom(
            clean,
            {
              name: playerName.trim() || 'Oyuncu',
              preferredClass: selectedClass,
              preferredRole: rolePreference,
              preferredKiller: killerPreference,
            },
            makeP2PCallbacks(() => assignedId)
          );
          assignedId = playerId;
          p2pRef.current = handle;
          setTransportKind('p2p');
          setOnlinePlayerId(playerId);
          setLocalPlayerId(playerId);
          setOnlineRoom(room);
        }
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Odaya katılınamadı.');
      } finally {
        setOnlineBusy(false);
      }
    },
    [
      attachRealtimeClient,
      backendAvailable,
      killerPreference,
      makeP2PCallbacks,
      playerName,
      rolePreference,
      selectedClass,
    ]
  );

  const handleLeaveRoom = useCallback(async () => {
    const creds = credsRef.current;
    if (rtClientRef.current) {
      rtClientRef.current.dispose();
      rtClientRef.current = null;
    }
    if (p2pRef.current) {
      p2pRef.current.dispose();
      p2pRef.current = null;
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
    if (p2pRef.current) {
      p2pRef.current.updateMember({ ready });
      return;
    }
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
      if (p2pRef.current) {
        p2pRef.current.updateConfig(patch);
        return;
      }
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
      setRolePreference(role);
      if (killer !== undefined) {
        setKillerPreference(killer);
      }
      const nextKiller = killer ?? killerPreference;
      if (p2pRef.current) {
        p2pRef.current.updateMember({
          preferredRole: role,
          preferredKiller: nextKiller,
        });
        return;
      }
      const creds = credsRef.current;
      if (!creds) return;
      try {
        const room = await updateOnlineMember(creds, {
          preferredRole: role,
          preferredKiller: nextKiller,
        });
        setOnlineRoom(room);
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Rol güncellenemedi.');
      }
    },
    [killerPreference]
  );

  const handleSendChat = useCallback(async (text: string) => {
    if (p2pRef.current) {
      p2pRef.current.sendChat(text);
      return;
    }
    const creds = credsRef.current;
    if (!creds) return;
    try {
      await sendOnlineChat(creds, text);
    } catch {
      // ignore
    }
  }, []);

  const handleStartRoomMatch = useCallback(async () => {
    if (p2pRef.current) {
      setOnlineError(null);
      p2pRef.current.startMatch();
      return;
    }
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
    if (p2pRef.current) {
      p2pRef.current.rematch();
      return;
    }
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
      if (mode === 'online') {
        if (p2pRef.current) {
          p2pRef.current.sendInput(inp);
        } else if (rtClientRef.current) {
          rtClientRef.current.sendInput(inp);
        }
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

  const handleCompleteTutorial = useCallback(() => {
    setShowTutorial(false);
    writeStorage(STORAGE_TUTORIAL_KEY, '1');
  }, []);

  if (showTutorial && mode === 'lobby') {
    return (
      <TutorialArena
        playerName={playerName.trim() || 'Oyuncu'}
        preferredClass={selectedClass}
        onComplete={handleCompleteTutorial}
      />
    );
  }

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
      hasBackend={backendAvailable}
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
      onOpenTutorial={() => setShowTutorial(true)}
    />
  );
}
