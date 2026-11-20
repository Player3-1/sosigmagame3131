import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuthUser,
  buyUnlock,
  claimMatchCoins,
  logoutAccount,
  refreshAuthUser,
  restoreAuthSession,
} from './auth/customAuth';
import { AuthScreen } from './components/AuthScreen';
import { GameView } from './components/GameView';
import { LobbyScreen } from './components/LobbyScreen';
import { TutorialArena } from './components/TutorialArena';
import { musicPlayer, soundFX } from './game/audio';
import {
  DEFAULT_UNLOCKED_CLASSES,
  DEFAULT_UNLOCKED_KILLERS,
  SURVIVOR_CLASS_LIST,
} from './game/constants';
import {
  ParticipantConfig,
  createInitialGameState,
  createTestArenaState,
  stepGame,
} from './game/engine';
import { BotTier, GameState, KillerId, PlayerInput, SurvivorClassId } from './game/types';
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
  listLocalP2PRooms,
} from './multiplayer/p2p';
import { GlobalRoomDirectory } from './multiplayer/directory';
import { ServerRoomP2PBridge } from './multiplayer/p2pBridge';
import {
  OnlineRolePreference,
  OnlineRoomSnapshot,
  PublicRoomSummary,
  RoomSessionCredentials,
} from './multiplayer/types';

const BOT_NAMES = ['Aylin', 'Kerem', 'Mert', 'Zeynep', 'Deniz'];
const STORAGE_TUTORIAL_KEY = 'kk_tutorial_completed';
const STORAGE_CLASS_KEY = 'kk_selected_class';
const STORAGE_KILLER_KEY = 'kk_selected_killer';

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

function getInitialKiller(): KillerId | 'random' {
  const saved = readStorage(STORAGE_KILLER_KEY);
  if (
    saved &&
    (saved === 'random' ||
      saved === 'sawblooder' ||
      saved === 'jumper' ||
      saved === 'juggernaut' ||
      saved === 'smile' ||
      saved === 'hungry' ||
      saved === 'darkness')
  ) {
    return saved as KillerId | 'random';
  }
  return 'random';
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [selectedClass, setSelectedClass] = useState<SurvivorClassId>(getInitialClass);
  const [rolePreference, setRolePreference] = useState<'random' | 'survivor' | 'killer'>('random');
  const [killerPreference, setKillerPreference] = useState<KillerId | 'random'>(getInitialKiller);
  const [killerBotTier, setKillerBotTier] = useState<BotTier | 'random'>('random');
  const [showTutorial, setShowTutorial] = useState(() => readStorage(STORAGE_TUTORIAL_KEY) !== '1');

  const [mode, setMode] = useState<'lobby' | 'solo' | 'online'>('lobby');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState('local_p1');

  const [backendAvailable, setBackendAvailable] = useState<boolean>(() => hasNodeBackend());

  // Online multiplayer state (supports both Node Server + WebRTC P2P + Global Directory)
  const rtClientRef = useRef<RoomRealtimeClient | null>(null);
  const p2pRef = useRef<P2PSessionHandle | null>(null);
  const p2pBridgeRef = useRef<ServerRoomP2PBridge | null>(null);
  const directoryRef = useRef<GlobalRoomDirectory | null>(null);
  const serverRoomsRef = useRef<PublicRoomSummary[]>([]);
  const hostedCreatedAtRef = useRef<{ code: string; ts: number } | null>(null);
  const credsRef = useRef<RoomSessionCredentials | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState('');
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [transportKind, setTransportKind] = useState<TransportKind>('connecting');
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(false);

  const soloStateRef = useRef<GameState | null>(null);
  const lastTestOptsRef = useRef<{
    role: 'survivor' | 'killer';
    survivorClass: SurvivorClassId;
    killerId: KillerId;
  } | null>(null);
  const claimedMatchesRef = useRef<Set<string>>(new Set());
  const localInputRef = useRef<PlayerInput>({
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
  });

  const playerName = authUser?.username || 'Oyuncu';

  // Restore auth session and probe /api/health dynamically on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.ok && active) {
            (window as any).__KK_BACKEND__ = true;
            setBackendAvailable(true);
          }
        }
      } catch {
        // Static / P2P mode
      }

      const restored = await restoreAuthSession();
      if (active) {
        setAuthUser(restored);
        setAuthChecked(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    writeStorage(STORAGE_CLASS_KEY, selectedClass);
  }, [selectedClass]);

  useEffect(() => {
    writeStorage(STORAGE_KILLER_KEY, killerPreference);
  }, [killerPreference]);

  // Keep selected class/killer strictly within unlocked items for the signed-in user
  useEffect(() => {
    if (!authUser) return;
    if (!authUser.unlockedClasses.includes(selectedClass)) {
      setSelectedClass(authUser.unlockedClasses[0] ?? DEFAULT_UNLOCKED_CLASSES[0]);
    }
    if (
      killerPreference !== 'random' &&
      !authUser.unlockedKillers.includes(killerPreference)
    ) {
      setKillerPreference('random');
    }
  }, [authUser, killerPreference, selectedClass]);

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

  const mergeAndSetPublicRooms = useCallback(
    (serverList: PublicRoomSummary[], dirList: PublicRoomSummary[]) => {
      const localList = listLocalP2PRooms();
      const map = new Map<string, PublicRoomSummary>();
      for (const r of localList) map.set(r.code, r);
      for (const r of dirList) map.set(r.code, r);
      for (const r of serverList) map.set(r.code, r);
      const combined = Array.from(map.values()).sort(
        (a, b) => b.playerCount - a.playerCount || (b.createdAt ?? 0) - (a.createdAt ?? 0)
      );
      setPublicRooms(combined);
    },
    []
  );

  const refreshPublicRooms = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setPublicRoomsLoading(true);
      directoryRef.current?.refresh();
      try {
        let serverList: PublicRoomSummary[] = [];
        if (backendAvailable) {
          try {
            serverList = await listPublicRooms();
          } catch {
            // ignore server error
          }
        }
        serverRoomsRef.current = serverList;
        mergeAndSetPublicRooms(serverList, directoryRef.current?.getRooms() ?? []);
      } catch {
        mergeAndSetPublicRooms(serverRoomsRef.current, directoryRef.current?.getRooms() ?? []);
      } finally {
        if (showSpinner) setPublicRoomsLoading(false);
      }
    },
    [backendAvailable, mergeAndSetPublicRooms]
  );

  // Maintain GlobalRoomDirectory for cross-device / cross-origin / P2P public room discovery
  useEffect(() => {
    if (!authUser) {
      if (directoryRef.current) {
        directoryRef.current.dispose();
        directoryRef.current = null;
      }
      serverRoomsRef.current = [];
      setPublicRooms([]);
      return;
    }

    const dir = new GlobalRoomDirectory();
    directoryRef.current = dir;
    const unsub = dir.subscribe((dirRooms) => {
      mergeAndSetPublicRooms(serverRoomsRef.current, dirRooms);
    });

    return () => {
      unsub();
      dir.dispose();
      if (directoryRef.current === dir) {
        directoryRef.current = null;
      }
    };
  }, [authUser, mergeAndSetPublicRooms]);

  // Publish active hosted public lobby room & keep passive P2P bridge alive for cross-instance joins
  useEffect(() => {
    const isHostingLobby = Boolean(
      onlineRoom &&
        onlineRoom.hostId === onlinePlayerId &&
        onlineRoom.config.isPublic &&
        onlineRoom.status === 'lobby'
    );

    if (directoryRef.current) {
      if (onlineRoom && isHostingLobby) {
        if (!hostedCreatedAtRef.current || hostedCreatedAtRef.current.code !== onlineRoom.code) {
          hostedCreatedAtRef.current = { code: onlineRoom.code, ts: Date.now() };
        }
        const host = onlineRoom.members.find((m) => m.id === onlineRoom.hostId);
        directoryRef.current.setHostedRoom({
          code: onlineRoom.code,
          hostName: host?.name || playerName,
          playerCount: onlineRoom.members.length,
          maxPlayers: 5,
          fillWithBots: onlineRoom.config.fillWithBots,
          killerBotTier: onlineRoom.config.killerBotTier ?? 'random',
          status: onlineRoom.status,
          memberNames: onlineRoom.members.map((m) => m.name),
          createdAt: hostedCreatedAtRef.current.ts,
        });
      } else {
        if (!onlineRoom) hostedCreatedAtRef.current = null;
        directoryRef.current.setHostedRoom(null);
      }
    }

    const shouldBridge = Boolean(
      backendAvailable &&
        !p2pRef.current &&
        onlineRoom &&
        onlineRoom.hostId === onlinePlayerId
    );
    if (shouldBridge && onlineRoom) {
      if (!p2pBridgeRef.current || p2pBridgeRef.current.code !== onlineRoom.code) {
        p2pBridgeRef.current?.dispose();
        p2pBridgeRef.current = new ServerRoomP2PBridge(onlineRoom.code);
      }
    } else if (p2pBridgeRef.current) {
      p2pBridgeRef.current.dispose();
      p2pBridgeRef.current = null;
    }
  }, [backendAvailable, onlinePlayerId, onlineRoom, playerName]);

  // Poll open rooms continuously while in lobby (even inside an open room so list stays live)
  useEffect(() => {
    if (!authUser || mode !== 'lobby') return;
    void refreshPublicRooms(false);
    const id = window.setInterval(() => {
      void refreshPublicRooms(false);
    }, 2500);

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes('p2p_public_rooms')) {
        void refreshPublicRooms(false);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', onStorage);
    };
  }, [authUser, mode, refreshPublicRooms]);

  // Attempt room session restore once authenticated when Node backend is active
  useEffect(() => {
    if (!authUser || !backendAvailable) return;
    void refreshPublicRooms(false);
    const saved = loadRoomSession();
    if (saved) {
      joinOnlineRoom(saved.code, {
        name: authUser.username,
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
  }, [attachRealtimeClient, authUser, backendAvailable, refreshPublicRooms]);

  useEffect(() => {
    return () => {
      if (rtClientRef.current) {
        rtClientRef.current.dispose();
        rtClientRef.current = null;
      }
      if (p2pRef.current) {
        p2pRef.current.dispose();
        p2pRef.current = null;
      }
      if (p2pBridgeRef.current) {
        p2pBridgeRef.current.dispose();
        p2pBridgeRef.current = null;
      }
      if (directoryRef.current) {
        directoryRef.current.dispose();
        directoryRef.current = null;
      }
    };
  }, []);

  const handleSelectClass = useCallback(
    (cls: SurvivorClassId) => {
      if (authUser && !authUser.unlockedClasses.includes(cls)) return;
      setSelectedClass(cls);
      if (p2pRef.current) {
        p2pRef.current.updateMember({ preferredClass: cls });
      } else if (credsRef.current) {
        updateOnlineMember(credsRef.current, { preferredClass: cls })
          .then((room) => setOnlineRoom(room))
          .catch(() => {});
      }
    },
    [authUser]
  );

  const handleSelectKiller = useCallback(
    (killer: KillerId | 'random') => {
      if (killer !== 'random' && authUser && !authUser.unlockedKillers.includes(killer)) {
        return;
      }
      setKillerPreference(killer);
      if (p2pRef.current) {
        p2pRef.current.updateMember({ preferredKiller: killer });
      } else if (credsRef.current) {
        updateOnlineMember(credsRef.current, { preferredKiller: killer })
          .then((room) => setOnlineRoom(room))
          .catch(() => {});
      }
    },
    [authUser]
  );

  const handleBuyUnlock = useCallback(
    async (kind: 'survivor' | 'killer', id: SurvivorClassId | KillerId) => {
      const updated = await buyUnlock(kind, id);
      setAuthUser(updated);
      if (kind === 'survivor') {
        const cls = id as SurvivorClassId;
        setSelectedClass(cls);
        if (p2pRef.current) {
          p2pRef.current.updateMember({ preferredClass: cls });
        } else if (credsRef.current) {
          updateOnlineMember(credsRef.current, { preferredClass: cls })
            .then((room) => setOnlineRoom(room))
            .catch(() => {});
        }
      } else {
        const kil = id as KillerId;
        setKillerPreference(kil);
        if (p2pRef.current) {
          p2pRef.current.updateMember({ preferredKiller: kil });
        } else if (credsRef.current) {
          updateOnlineMember(credsRef.current, { preferredKiller: kil })
            .then((room) => setOnlineRoom(room))
            .catch(() => {});
        }
      }
    },
    []
  );

  const handleCreateRoom = useCallback(async () => {
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      if (backendAvailable) {
        const { room, creds } = await createOnlineRoom({
          name: playerName,
          preferredClass: selectedClass,
          preferredRole: rolePreference,
          preferredKiller: killerPreference,
          fillWithBots: true,
          isPublic: true,
          killerBotTier,
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
            name: playerName,
            preferredClass: selectedClass,
            preferredRole: rolePreference,
            preferredKiller: killerPreference,
            fillWithBots: true,
            isPublic: true,
            killerBotTier,
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
      void refreshPublicRooms(false);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Oda oluşturulamadı.');
    } finally {
      setOnlineBusy(false);
    }
  }, [
    attachRealtimeClient,
    backendAvailable,
    killerBotTier,
    killerPreference,
    makeP2PCallbacks,
    playerName,
    refreshPublicRooms,
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
        let joinedViaServer = false;
        if (backendAvailable) {
          try {
            const { room, creds, gameState: st } = await joinOnlineRoom(clean, {
              name: playerName,
              preferredClass: selectedClass,
              preferredRole: rolePreference,
              preferredKiller: killerPreference,
            });
            setOnlineRoom(room);
            attachRealtimeClient(creds, st);
            joinedViaServer = true;
          } catch (serverErr) {
            const msg = serverErr instanceof Error ? serverErr.message : '';
            // If room is not on this server instance (e.g. different URL/instance or P2P), try P2P seamlessly
            if (!msg.includes('bulunamadı')) {
              throw serverErr;
            }
          }
        }

        if (!joinedViaServer) {
          if (p2pRef.current) {
            p2pRef.current.dispose();
            p2pRef.current = null;
          }
          let assignedId = '';
          const { room, playerId, handle } = await joinP2PRoom(
            clean,
            {
              name: playerName,
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
        void refreshPublicRooms(false);
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Odaya katılınamadı.');
        void refreshPublicRooms(false);
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
      refreshPublicRooms,
      rolePreference,
      selectedClass,
    ]
  );

  const handleLeaveRoom = useCallback(async () => {
    const creds = credsRef.current;
    directoryRef.current?.setHostedRoom(null);
    if (p2pBridgeRef.current) {
      p2pBridgeRef.current.dispose();
      p2pBridgeRef.current = null;
    }
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
    void refreshPublicRooms(false);
  }, [refreshPublicRooms]);

  const handleLogout = useCallback(async () => {
    await handleLeaveRoom();
    await logoutAccount();
    setAuthUser(null);
  }, [handleLeaveRoom]);

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
    async (patch: {
      fillWithBots?: boolean;
      isPublic?: boolean;
      killerBotTier?: BotTier | 'random';
    }) => {
      if (p2pRef.current) {
        p2pRef.current.updateConfig(patch);
        void refreshPublicRooms(false);
        return;
      }
      const creds = credsRef.current;
      if (!creds) return;
      try {
        const room = await updateOnlineConfig(creds, patch);
        setOnlineRoom(room);
        void refreshPublicRooms(false);
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Ayar güncellenemedi.');
      }
    },
    [refreshPublicRooms]
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
    const unlockedClasses = authUser?.unlockedClasses ?? DEFAULT_UNLOCKED_CLASSES;
    const unlockedKillers = authUser?.unlockedKillers ?? DEFAULT_UNLOCKED_KILLERS;
    const safeClass = unlockedClasses.includes(selectedClass)
      ? selectedClass
      : unlockedClasses[0] ?? 'runner';
    const chosenKiller: KillerId | 'random' =
      killerPreference === 'random'
        ? unlockedKillers[Math.floor(Math.random() * unlockedKillers.length)] ?? 'juggernaut'
        : unlockedKillers.includes(killerPreference)
        ? killerPreference
        : 'juggernaut';

    const participants: ParticipantConfig[] = [
      {
        id: 'local_p1',
        name: playerName,
        isBot: false,
        preferredClass: safeClass,
        preferredRole: rolePreference,
        preferredKiller: chosenKiller,
      },
    ];

    for (let i = 0; i < 4; i++) {
      const botName = BOT_NAMES[i];
      participants.push({
        id: `bot_${i + 1}`,
        name: botName,
        isBot: true,
        preferredClass: botName === 'Aylin' ? 'doctor' : undefined,
        preferredRole: rolePreference === 'killer' ? 'survivor' : 'random',
        preferredKiller: 'random',
      });
    }

    lastTestOptsRef.current = null;
    const initial = createInitialGameState(participants, {
      killerBotTier,
    });
    soloStateRef.current = initial;
    setLocalPlayerId('local_p1');
    setGameState({ ...initial });
    setMode('solo');
  }, [authUser, killerBotTier, killerPreference, playerName, rolePreference, selectedClass]);

  const startTestArena = useCallback(
    (opts: {
      role: 'survivor' | 'killer';
      survivorClass: SurvivorClassId;
      killerId: KillerId;
    }) => {
      lastTestOptsRef.current = opts;
      const initial = createTestArenaState({
        ...opts,
        playerName,
      });
      soloStateRef.current = initial;
      setLocalPlayerId('local_p1');
      setGameState({ ...initial });
      setMode('solo');
    },
    [playerName]
  );

  // Persist earned coins once when a real match ends
  useEffect(() => {
    if (!authUser || !gameState || gameState.phase !== 'ended' || gameState.isTestMode) {
      return;
    }
    const matchId = gameState.matchId;
    if (!matchId || claimedMatchesRef.current.has(matchId)) return;
    claimedMatchesRef.current.add(matchId);

    const me = gameState.players.find((p) => p.id === localPlayerId);
    const earned = Math.max(0, Math.round(me?.coinsEarned ?? 0));

    (async () => {
      const updated = await claimMatchCoins(matchId, earned);
      if (updated) {
        setAuthUser(updated);
      } else if (backendAvailable && mode === 'online') {
        const refreshed = await refreshAuthUser();
        if (refreshed) setAuthUser(refreshed);
      }
    })();
  }, [
    authUser,
    backendAvailable,
    gameState,
    localPlayerId,
    mode,
  ]);

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
        localInputRef.current.ventTargetId = undefined;
        localInputRef.current.useE = false;
        localInputRef.current.useR = false;
        localInputRef.current.useCtrl = false;
        localInputRef.current.attack = false;
        localInputRef.current.chatTextToSend = undefined;

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
      if (mode === 'online') {
        const payload: PlayerInput = {
          ...inp,
          attackHeld: Boolean(inp.attackHeld),
          useQ: Boolean(inp.useQ),
          useE: Boolean(inp.useE),
          useR: Boolean(inp.useR),
          useCtrl: Boolean(inp.useCtrl),
          attack: Boolean(inp.attack),
          ventTargetId: inp.useQ ? inp.ventTargetId : undefined,
          chatTextToSend: inp.chatTextToSend,
        };
        localInputRef.current = {
          ...payload,
          attack: false,
          useQ: false,
          useE: false,
          useR: false,
          useCtrl: false,
          ventTargetId: undefined,
          chatTextToSend: undefined,
        };
        if (p2pRef.current) {
          p2pRef.current.sendInput(payload);
        } else if (rtClientRef.current) {
          rtClientRef.current.sendInput(payload);
        }
        return;
      }

      localInputRef.current = {
        ...inp,
        attackHeld: Boolean(inp.attackHeld),
        useQ: localInputRef.current.useQ || inp.useQ,
        ventTargetId:
          inp.ventTargetId ?? (localInputRef.current.useQ ? localInputRef.current.ventTargetId : undefined),
        useE: localInputRef.current.useE || inp.useE,
        useR: localInputRef.current.useR || inp.useR,
        useCtrl: localInputRef.current.useCtrl || inp.useCtrl,
        attack: localInputRef.current.attack || inp.attack,
        chatTextToSend: inp.chatTextToSend ?? localInputRef.current.chatTextToSend,
      };
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

  useEffect(() => {
    if (!authChecked || showTutorial) {
      musicPlayer.setTrack('none');
      return;
    }
    if (!authUser || mode === 'lobby' || !gameState) {
      musicPlayer.setTrack('menu');
      return;
    }
    if (gameState.phase === 'playing' && gameState.lastSurvivorTriggered) {
      musicPlayer.setTrack('lms');
      return;
    }
    musicPlayer.setTrack('none');
  }, [authChecked, authUser, showTutorial, mode, gameState?.phase, gameState?.lastSurvivorTriggered]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#050508] text-stone-300 flex items-center justify-center">
        <div className="font-horror text-2xl tracking-[0.2em] text-stone-200 animate-pulse">
          ZONE 51
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <AuthScreen onAuthenticated={(u) => setAuthUser(u)} />;
  }

  if (showTutorial && mode === 'lobby') {
    return (
      <TutorialArena
        playerName={playerName}
        preferredClass={selectedClass}
        onComplete={handleCompleteTutorial}
      />
    );
  }

  if (mode !== 'lobby' && gameState) {
    const isOnlineHost = Boolean(
      mode === 'online' && onlineRoom && onlineRoom.hostId === onlinePlayerId
    );
    const restartHandler =
      mode === 'solo'
        ? gameState.isTestMode && lastTestOptsRef.current
          ? () => startTestArena(lastTestOptsRef.current!)
          : startSoloMatch
        : undefined;
    return (
      <GameView
        gameState={gameState}
        localPlayerId={localPlayerId}
        onInputChange={handleInputChange}
        onRestartSolo={restartHandler}
        onRematchOnline={isOnlineHost ? handleRematchOnline : undefined}
        onExitToLobby={handleExitToLobby}
      />
    );
  }

  return (
    <LobbyScreen
      username={authUser.username}
      coins={authUser.coins}
      unlockedClasses={authUser.unlockedClasses}
      unlockedKillers={authUser.unlockedKillers}
      onBuyUnlock={handleBuyUnlock}
      onLogout={() => void handleLogout()}
      selectedClass={selectedClass}
      onSelectClass={handleSelectClass}
      rolePreference={rolePreference}
      onChangeRolePreference={setRolePreference}
      killerPreference={killerPreference}
      onChangeKillerPreference={handleSelectKiller}
      killerBotTier={killerBotTier}
      onChangeKillerBotTier={setKillerBotTier}
      onStartSolo={startSoloMatch}
      onStartTestArena={startTestArena}
      onlineRoom={onlineRoom}
      onlinePlayerId={onlinePlayerId}
      onlineError={onlineError}
      onlineBusy={onlineBusy}
      hasBackend={backendAvailable}
      transportKind={transportKind}
      pingMs={pingMs}
      publicRooms={publicRooms}
      publicRoomsLoading={publicRoomsLoading}
      onRefreshPublicRooms={() => void refreshPublicRooms(true)}
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
