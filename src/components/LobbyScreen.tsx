import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Coins,
  Copy,
  FlaskConical,
  Globe,
  GraduationCap,
  Lock,
  LogOut,
  Music,
  Play,
  RefreshCw,
  Send,
  Shield,
  Skull,
  User,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { musicPlayer, soundFX } from '../game/audio';
import {
  KILLER_LIST,
  KILLER_PRICES,
  SURVIVOR_CLASS_LIST,
  SURVIVOR_PRICES,
} from '../game/constants';
import { BotTier, KillerId, SurvivorClassId } from '../game/types';
import { TransportKind } from '../multiplayer/client';
import {
  OnlineRolePreference,
  OnlineRoomSnapshot,
  PublicRoomSummary,
} from '../multiplayer/types';
import { KillerPreview } from './KillerPreview';

const HORROR_BG_URL = '/src/assets/images/horror_facility_corridor_1794997869635.jpg';

const BOT_TIER_OPTIONS: { id: BotTier | 'random'; label: string }[] = [
  { id: 'random', label: 'Rastgele' },
  { id: 'noob', label: 'Kolay' },
  { id: 'normal', label: 'Orta' },
  { id: 'pro', label: 'Zor' },
];

function getBotTierLabel(tier?: BotTier | 'random'): string {
  if (tier === 'noob') return 'Kolay';
  if (tier === 'normal') return 'Orta';
  if (tier === 'pro') return 'Zor';
  return 'Rastgele';
}

interface LobbyScreenProps {
  username: string;
  coins: number;
  unlockedClasses: SurvivorClassId[];
  unlockedKillers: KillerId[];
  onBuyUnlock: (kind: 'survivor' | 'killer', id: SurvivorClassId | KillerId) => Promise<void>;
  onLogout: () => void;
  selectedClass: SurvivorClassId;
  onSelectClass: (id: SurvivorClassId) => void;
  rolePreference: 'random' | 'survivor' | 'killer';
  onChangeRolePreference: (pref: 'random' | 'survivor' | 'killer') => void;
  killerPreference: KillerId | 'random';
  onChangeKillerPreference: (k: KillerId | 'random') => void;
  killerBotTier: BotTier | 'random';
  onChangeKillerBotTier: (tier: BotTier | 'random') => void;
  survivorBotTier: BotTier | 'random';
  onChangeSurvivorBotTier: (tier: BotTier | 'random') => void;
  onStartSolo: () => void;
  onStartTestArena: (opts: {
    role: 'survivor' | 'killer';
    survivorClass: SurvivorClassId;
    killerId: KillerId;
  }) => void;
  onlineRoom: OnlineRoomSnapshot | null;
  onlinePlayerId: string;
  onlineError: string | null;
  onlineBusy: boolean;
  hasBackend: boolean;
  transportKind: TransportKind;
  pingMs: number | null;
  publicRooms: PublicRoomSummary[];
  publicRoomsLoading?: boolean;
  onRefreshPublicRooms: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onUpdateOnlineConfig: (patch: {
    fillWithBots?: boolean;
    isPublic?: boolean;
    killerBotTier?: BotTier | 'random';
    survivorBotTier?: BotTier | 'random';
  }) => void;
  onUpdateOnlineRole: (role: OnlineRolePreference, killer?: KillerId | 'random') => void;
  onSendChat: (text: string) => void;
  onStartRoomMatch: () => void;
  onOpenTutorial: () => void;
}

type RailSection = 'solo' | 'online' | 'loadout' | 'test' | 'rules';

export function LobbyScreen({
  username,
  coins,
  unlockedClasses,
  unlockedKillers,
  onBuyUnlock,
  onLogout,
  selectedClass,
  onSelectClass,
  rolePreference,
  onChangeRolePreference,
  killerPreference,
  onChangeKillerPreference,
  killerBotTier,
  onChangeKillerBotTier,
  survivorBotTier,
  onChangeSurvivorBotTier,
  onStartSolo,
  onStartTestArena,
  onlineRoom,
  onlinePlayerId,
  onlineError,
  onlineBusy,
  hasBackend,
  transportKind,
  pingMs,
  publicRooms,
  publicRoomsLoading = false,
  onRefreshPublicRooms,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onUpdateOnlineConfig,
  onUpdateOnlineRole,
  onSendChat,
  onStartRoomMatch,
  onOpenTutorial,
}: LobbyScreenProps) {
  const [activeSection, setActiveSection] = useState<RailSection>(() =>
    onlineRoom ? 'online' : 'solo'
  );
  const [loadoutTab, setLoadoutTab] = useState<'survivors' | 'killers'>('survivors');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatText, setChatText] = useState('');
  const [bgFailed, setBgFailed] = useState(false);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [testRole, setTestRole] = useState<'survivor' | 'killer'>('survivor');
  const [testSurvivorClass, setTestSurvivorClass] = useState<SurvivorClassId>(selectedClass);
  const [testKillerId, setTestKillerId] = useState<KillerId>(
    killerPreference === 'random' ? 'juggernaut' : killerPreference
  );
  const [muted, setMuted] = useState(soundFX.muted);
  const [lobbyMusicMuted, setLobbyMusicMuted] = useState(() => musicPlayer.isLobbyMusicMuted());

  useEffect(() => musicPlayer.subscribeMute(setMuted), []);
  useEffect(() => musicPlayer.subscribeLobbyMusicMute(setLobbyMusicMuted), []);

  const handlePurchase = async (kind: 'survivor' | 'killer', id: SurvivorClassId | KillerId) => {
    setShopError(null);
    setBuyingKey(`${kind}:${id}`);
    try {
      await onBuyUnlock(kind, id);
    } catch (err) {
      setShopError(err instanceof Error ? err.message : 'Satın alma işlemi başarısız.');
    } finally {
      setBuyingKey(null);
    }
  };

  const effectiveSection: RailSection =
    onlineRoom && activeSection === 'solo' ? 'online' : activeSection;

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const myMember = onlineRoom?.members.find((m) => m.id === onlinePlayerId);
  const isHost = Boolean(onlineRoom && onlineRoom.hostId === onlinePlayerId);
  const canStartOnline = Boolean(
    onlineRoom &&
      isHost &&
      (onlineRoom.config.fillWithBots || onlineRoom.members.length >= 2)
  );

  const selectedSurvSpec =
    SURVIVOR_CLASS_LIST.find((c) => c.id === selectedClass) ?? SURVIVOR_CLASS_LIST[0];
  const activeKillerId = onlineRoom
    ? myMember?.preferredKiller ?? killerPreference
    : killerPreference;
  const selectedKillerSpec =
    activeKillerId !== 'random'
      ? KILLER_LIST.find((k) => k.id === activeKillerId) ?? null
      : null;

  const currentRoomBotTier = onlineRoom?.config.killerBotTier ?? 'random';
  const currentRoomSurvivorBotTier = onlineRoom?.config.survivorBotTier ?? 'random';

  return (
    <div className="min-h-screen bg-[#050508] text-stone-100 flex flex-col lg:flex-row relative overflow-x-hidden">
      {/* Full-Bleed Horror Corridor Backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {!bgFailed ? (
          <img
            src={HORROR_BG_URL}
            alt="ZONE 51 Koridoru"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="w-full h-full object-cover opacity-40"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background:
                'radial-gradient(circle at 65% 40%, rgba(127, 29, 29, 0.25), rgba(5, 5, 8, 0.98) 65%)',
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(5,5,8,0.96) 0%, rgba(5,5,8,0.82) 38%, rgba(5,5,8,0.45) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.78) 100%)',
          }}
        />
      </div>

      {/* =================================================================
          LEFT VERTICAL HORROR TITLE RAIL (PC Survival Game Aesthetic)
         ================================================================= */}
      <aside className="relative z-10 w-full lg:w-[320px] xl:w-[340px] shrink-0 bg-[#07070b]/92 lg:border-r border-b lg:border-b-0 border-red-950/60 backdrop-blur-md flex flex-col justify-between p-6 lg:p-7">
        <div className="space-y-7">
          {/* ZONE 51 Title & Account Row */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveSection(onlineRoom ? 'online' : 'solo')}
              className="text-left group cursor-pointer block"
            >
              <h1 className="font-horror text-4xl xl:text-5xl font-bold tracking-[0.2em] text-stone-100 group-hover:text-red-500 transition-colors">
                ZONE 51
              </h1>
            </button>

            <div className="bg-[#0b0b11] border border-stone-800/90 rounded-sm px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-xs font-semibold text-stone-200 truncate">
                    {username}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => soundFX.setMuted(!muted)}
                    title={muted ? 'Müziği ve Sesi Aç' : 'Müziği ve Sesi Kapat'}
                    className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={onLogout}
                    title="Hesaptan Çıkış Yap"
                    className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Çıkış</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-stone-800/80">
                <span className="text-[11px] text-stone-400">Bakiye</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-amber-400">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>{coins} Para</span>
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-stone-800/80">
                <span className="text-[11px] text-stone-400">Lobi Müziği</span>
                <button
                  type="button"
                  onClick={() => musicPlayer.setLobbyMusicMuted(!lobbyMusicMuted)}
                  title={lobbyMusicMuted ? 'Lobi Müziğini Aç' : 'Lobi Müziğini Kapat'}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[11px] font-semibold transition-colors cursor-pointer ${
                    lobbyMusicMuted
                      ? 'bg-stone-900 border-stone-700 text-stone-400 hover:text-stone-200'
                      : 'bg-red-950/50 border-red-800/70 text-red-200 hover:bg-red-900/50'
                  }`}
                >
                  {lobbyMusicMuted ? (
                    <>
                      <VolumeX className="w-3 h-3" />
                      <span>Kapalı</span>
                    </>
                  ) : (
                    <>
                      <Music className="w-3 h-3" />
                      <span>Açık</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Vertical Navigation Menu */}
          <nav className="space-y-1.5" aria-label="Ana Menü">
            <button
              type="button"
              onClick={() => {
                if (onlineRoom) {
                  setActiveSection('online');
                } else {
                  setActiveSection('solo');
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer border-l-2 ${
                effectiveSection === 'solo'
                  ? 'border-red-600 bg-gradient-to-r from-red-950/55 to-transparent text-white pl-5'
                  : 'border-transparent text-stone-400 hover:text-stone-100 hover:pl-5'
              }`}
            >
              <span className="font-horror text-base tracking-[0.14em] font-bold">
                TEK OYUNCULU
              </span>
              <Play className="w-3.5 h-3.5 text-red-500" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('online');
                onRefreshPublicRooms();
              }}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer border-l-2 ${
                effectiveSection === 'online'
                  ? 'border-red-600 bg-gradient-to-r from-red-950/55 to-transparent text-white pl-5'
                  : 'border-transparent text-stone-400 hover:text-stone-100 hover:pl-5'
              }`}
            >
              <span className="font-horror text-base tracking-[0.14em] font-bold">
                ÇOK OYUNCULU
              </span>
              <span className="font-mono text-xs text-red-400">
                {publicRooms.length > 0 ? `${publicRooms.length} Oda` : 'Lobi'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('loadout')}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer border-l-2 ${
                effectiveSection === 'loadout'
                  ? 'border-red-600 bg-gradient-to-r from-red-950/55 to-transparent text-white pl-5'
                  : 'border-transparent text-stone-400 hover:text-stone-100 hover:pl-5'
              }`}
            >
              <span className="font-horror text-base tracking-[0.14em] font-bold">
                SINIF &amp; KATİL SEÇİMİ
              </span>
              <Skull className="w-3.5 h-3.5 text-stone-500" />
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('test')}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer border-l-2 ${
                effectiveSection === 'test'
                  ? 'border-amber-500 bg-gradient-to-r from-amber-950/55 to-transparent text-white pl-5'
                  : 'border-transparent text-stone-400 hover:text-amber-300 hover:pl-5'
              }`}
            >
              <span className="font-horror text-base tracking-[0.14em] font-bold">
                TEST ALANI
              </span>
              <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
            </button>

            <button
              type="button"
              onClick={onOpenTutorial}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer border-l-2 border-transparent text-stone-400 hover:text-amber-300 hover:pl-5"
            >
              <span className="font-horror text-base tracking-[0.14em] font-bold">
                EĞİTİCİ ARENA
              </span>
              <GraduationCap className="w-3.5 h-3.5 text-amber-500" />
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('rules')}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all cursor-pointer border-l-2 ${
                effectiveSection === 'rules'
                  ? 'border-red-600 bg-gradient-to-r from-red-950/55 to-transparent text-white pl-5'
                  : 'border-transparent text-stone-400 hover:text-stone-100 hover:pl-5'
              }`}
            >
              <span className="font-horror text-base tracking-[0.14em] font-bold">
                KURALLAR
              </span>
              <Shield className="w-3.5 h-3.5 text-stone-500" />
            </button>
          </nav>
        </div>

        {/* Bottom Active Loadout Strip */}
        <div className="mt-8 pt-5 border-t border-stone-800/80 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>Aktif Seçimin</span>
            <button
              type="button"
              onClick={() => setActiveSection('loadout')}
              className="text-red-400 hover:text-red-300 underline underline-offset-2 cursor-pointer"
            >
              Değiştir
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setLoadoutTab('survivors');
              setActiveSection('loadout');
            }}
            className="w-full flex items-center gap-3 px-3 py-2 bg-[#0b0b11] hover:bg-[#111119] border border-stone-800/90 rounded-sm text-left transition-colors cursor-pointer"
          >
            <span className="text-2xl leading-none shrink-0" aria-hidden="true">
              {selectedSurvSpec.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-stone-400">Hayatta Kalan</div>
              <div className="text-xs font-bold text-stone-100 truncate">
                {selectedSurvSpec.name}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoadoutTab('killers');
              setActiveSection('loadout');
            }}
            className="w-full flex items-center gap-3 px-3 py-2 bg-[#0b0b11] hover:bg-[#150c10] border border-stone-800/90 rounded-sm text-left transition-colors cursor-pointer"
          >
            {selectedKillerSpec ? (
              <div className="shrink-0">
                <KillerPreview killerId={selectedKillerSpec.id} size={28} />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-sm bg-[#140b0e] border border-red-950/60 flex items-center justify-center shrink-0">
                <Skull className="w-4 h-4 text-red-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-stone-400">Canavar Katil</div>
              <div className="text-xs font-bold text-red-400 truncate">
                {selectedKillerSpec ? selectedKillerSpec.name : 'Rastgele'}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* =================================================================
          RIGHT DYNAMIC STAGE
         ================================================================= */}
      <main className="relative z-10 flex-1 min-w-0 p-6 sm:p-8 lg:p-10 flex flex-col justify-between overflow-y-auto">
        {/* ---------------------------------------------------------------
            STAGE 1: TEK OYUNCULU (Clean Atmospheric Launch Stage)
           --------------------------------------------------------------- */}
        {effectiveSection === 'solo' && (
          <section className="flex-1 flex flex-col justify-end max-w-3xl mx-auto lg:mx-0 w-full py-4 space-y-6">
            <div className="space-y-2">
              <h2 className="font-horror text-3xl sm:text-4xl font-bold tracking-[0.12em] text-stone-100">
                TEK OYUNCULU MAÇ
              </h2>
              <p className="text-sm text-stone-300">
                1 Katil ve 4 Hayatta Kalan ile ZONE 51 içinde hayatta kalma mücadelesi.
              </p>
            </div>

            <div className="bg-[#08080d]/92 border border-red-950/60 rounded-sm p-6 space-y-5 backdrop-blur-md shadow-2xl shadow-black/70">
              {/* Role Choice */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-stone-400">Rol Tercihin</div>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      { id: 'random', label: 'Rastgele Rol' },
                      { id: 'survivor', label: 'Hayatta Kalan' },
                      { id: 'killer', label: 'Katil Ol' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeRolePreference(opt.id)}
                      className={`py-2.5 px-3 text-xs font-semibold rounded-sm border transition-colors cursor-pointer ${
                        rolePreference === opt.id
                          ? 'bg-red-950/70 border-red-600 text-white'
                          : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Killer & Survivor Bot Difficulty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-400">Bot Katil Zorluğu</span>
                    <span className="font-mono text-amber-400">
                      {getBotTierLabel(killerBotTier)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {BOT_TIER_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeKillerBotTier(opt.id)}
                        className={`py-2 px-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                          killerBotTier === opt.id
                            ? 'bg-amber-950/55 border-amber-600 text-amber-200'
                            : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-400">
                      Hayatta Kalan Bot Zorluğu
                    </span>
                    <span className="font-mono text-emerald-400">
                      {getBotTierLabel(survivorBotTier)}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {BOT_TIER_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeSurvivorBotTier(opt.id)}
                        className={`py-2 px-1.5 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                          survivorBotTier === opt.id
                            ? 'bg-emerald-950/55 border-emerald-600 text-emerald-200'
                            : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Row: Separate Class Switch vs Start Match */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-stone-800/80">
                <button
                  type="button"
                  onClick={() => setActiveSection('loadout')}
                  className="sm:w-auto px-5 py-3.5 bg-[#0e0e15] hover:bg-[#161622] border border-stone-700 text-stone-200 text-xs font-semibold rounded-sm transition-colors cursor-pointer"
                >
                  Sınıf &amp; Katil Seç
                </button>
                <button
                  type="button"
                  onClick={onStartSolo}
                  className="flex-1 py-3.5 px-6 bg-red-800 hover:bg-red-700 text-white font-horror font-bold tracking-[0.16em] text-base rounded-sm border border-red-600/70 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>MAÇA BAŞLA</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------
            STAGE 2: ÇOK OYUNCULU (Room Console + ALWAYS-VISIBLE Açık Odalar)
           --------------------------------------------------------------- */}
        {effectiveSection === 'online' && (
          <section className="max-w-5xl w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-horror text-2xl sm:text-3xl font-bold tracking-[0.12em] text-stone-100">
                  ÇOK OYUNCULU LOBİ
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">
                  Yeni oda kur veya açık odalardan birine katıl
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('loadout')}
                className="px-4 py-2 bg-[#0b0b11] hover:bg-[#14141d] border border-stone-700 text-stone-200 text-xs font-semibold rounded-sm transition-colors cursor-pointer"
              >
                Sınıf / Katil Değiştir
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Panel (7 cols): Create / Join OR Active Room Lobby */}
              <div className="xl:col-span-7 bg-[#08080d]/95 border border-red-950/60 rounded-sm p-5 sm:p-6 space-y-4 backdrop-blur-md">
                {!onlineRoom ? (
                  <>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-medium text-stone-400 mb-1.5">
                          Rol Tercihin
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { id: 'random', label: 'Rastgele' },
                              { id: 'survivor', label: 'Hayatta Kalan' },
                              { id: 'killer', label: 'Katil Ol' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onChangeRolePreference(opt.id)}
                              className={`py-2 px-2 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                                rolePreference === opt.id
                                  ? 'bg-red-950/70 border-red-600 text-white'
                                  : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-stone-400 mb-1.5 flex items-center justify-between">
                          <span>Oda Bot Katil Zorluğu</span>
                          <span className="font-mono text-amber-400">
                            {getBotTierLabel(killerBotTier)}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {BOT_TIER_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onChangeKillerBotTier(opt.id)}
                              className={`py-2 px-2 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                                killerBotTier === opt.id
                                  ? 'bg-amber-950/55 border-amber-600 text-amber-200'
                                  : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-medium text-stone-400 mb-1.5 flex items-center justify-between">
                          <span>Oda Hayatta Kalan Bot Zorluğu</span>
                          <span className="font-mono text-emerald-400">
                            {getBotTierLabel(survivorBotTier)}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {BOT_TIER_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onChangeSurvivorBotTier(opt.id)}
                              className={`py-2 px-2 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                                survivorBotTier === opt.id
                                  ? 'bg-emerald-950/55 border-emerald-600 text-emerald-200'
                                  : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={onlineBusy}
                      onClick={onCreateRoom}
                      className="w-full py-3 px-4 bg-red-800 hover:bg-red-700 disabled:opacity-60 text-white font-horror tracking-[0.14em] text-sm font-bold rounded-sm border border-red-600/60 transition-colors cursor-pointer"
                    >
                      {onlineBusy ? 'ODA OLUŞTURULUYOR...' : 'YENİ AÇIK ODA KUR'}
                    </button>

                    <div className="flex gap-2 pt-2 border-t border-stone-800/80">
                      <input
                        type="text"
                        maxLength={4}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && joinCode.trim()) onJoinRoom(joinCode);
                        }}
                        placeholder="Oda Kodu (örn. A7K2)"
                        className="flex-1 px-3 py-2 bg-[#050508] border border-stone-800 rounded-sm text-sm font-mono uppercase text-white placeholder-stone-500 focus:outline-none focus:border-red-700"
                      />
                      <button
                        type="button"
                        disabled={onlineBusy}
                        onClick={() => onJoinRoom(joinCode)}
                        className="px-5 py-2 bg-[#14141c] hover:bg-[#1e1e28] disabled:opacity-60 text-stone-100 text-xs font-semibold rounded-sm border border-stone-700 transition-colors shrink-0 cursor-pointer"
                      >
                        Katıl
                      </button>
                    </div>

                    {onlineError && (
                      <div className="text-xs text-red-300 bg-red-950/50 border border-red-800/70 rounded-sm px-3 py-2">
                        {onlineError}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    {/* Active Room Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-stone-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-stone-400">Oda Kodu:</span>
                        <span className="font-mono text-xl font-bold tracking-widest text-amber-400">
                          {onlineRoom.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(onlineRoom.code)}
                          title="Kopyala"
                          className="p-1.5 rounded-sm bg-[#12121a] hover:bg-stone-800 text-stone-300 hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                          <Wifi className="w-3 h-3" />
                          {transportKind === 'ws'
                            ? `WS${pingMs ? ` ${pingMs}ms` : ''}`
                            : transportKind === 'p2p'
                            ? `P2P${pingMs ? ` ${pingMs}ms` : ''}`
                            : transportKind === 'sse'
                            ? 'HTTP'
                            : 'Bağlanıyor'}
                        </span>
                        <button
                          type="button"
                          onClick={onLeaveRoom}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#12121a] hover:bg-red-950/60 text-stone-300 hover:text-red-300 rounded-sm border border-stone-800 cursor-pointer"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>Çık</span>
                        </button>
                      </div>
                    </div>

                    {/* Host Settings */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!isHost}
                        onClick={() =>
                          isHost &&
                          onUpdateOnlineConfig({ fillWithBots: !onlineRoom.config.fillWithBots })
                        }
                        className={`flex items-center justify-between px-3 py-2 rounded-sm border text-xs transition-colors ${
                          onlineRoom.config.fillWithBots
                            ? 'bg-emerald-950/30 border-emerald-800/70 text-emerald-300'
                            : 'bg-[#050508] border-stone-800 text-stone-300'
                        } ${isHost ? 'cursor-pointer hover:brightness-110' : 'opacity-80 cursor-default'}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Bot className="w-3.5 h-3.5" />
                          <span>Bot Doldur</span>
                        </span>
                        <span className="font-mono font-bold">
                          {onlineRoom.config.fillWithBots ? 'AÇIK' : 'KAPALI'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={!isHost}
                        onClick={() =>
                          isHost &&
                          onUpdateOnlineConfig({ isPublic: !onlineRoom.config.isPublic })
                        }
                        className={`flex items-center justify-between px-3 py-2 rounded-sm border text-xs transition-colors ${
                          onlineRoom.config.isPublic
                            ? 'bg-sky-950/30 border-sky-800/70 text-sky-300'
                            : 'bg-[#050508] border-stone-800 text-stone-300'
                        } ${isHost ? 'cursor-pointer hover:brightness-110' : 'opacity-80 cursor-default'}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {onlineRoom.config.isPublic ? (
                            <Globe className="w-3.5 h-3.5" />
                          ) : (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                          <span>Liste</span>
                        </span>
                        <span className="font-mono font-bold">
                          {onlineRoom.config.isPublic ? 'AÇIK' : 'GİZLİ'}
                        </span>
                      </button>
                    </div>

                    {/* Bot Killer Tier */}
                    <div className="space-y-1.5">
                      <div className="text-xs text-stone-400 flex items-center justify-between">
                        <span>Bot Katil Zorluğu</span>
                        <span className="font-mono text-amber-400">
                          {getBotTierLabel(currentRoomBotTier)}
                          {!isHost ? ' (Kurucu)' : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {BOT_TIER_OPTIONS.map((opt) => {
                          const active = currentRoomBotTier === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={!isHost}
                              onClick={() =>
                                isHost && onUpdateOnlineConfig({ killerBotTier: opt.id })
                              }
                              className={`py-1.5 px-2 text-xs font-medium rounded-sm border transition-colors ${
                                active
                                  ? 'bg-amber-950/60 border-amber-600 text-amber-200'
                                  : 'bg-[#050508] border-stone-800 text-stone-400'
                              } ${isHost ? 'cursor-pointer hover:text-stone-200' : 'opacity-80 cursor-default'}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bot Survivor Tier */}
                    <div className="space-y-1.5">
                      <div className="text-xs text-stone-400 flex items-center justify-between">
                        <span>Hayatta Kalan Bot Zorluğu</span>
                        <span className="font-mono text-emerald-400">
                          {getBotTierLabel(currentRoomSurvivorBotTier)}
                          {!isHost ? ' (Kurucu)' : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {BOT_TIER_OPTIONS.map((opt) => {
                          const active = currentRoomSurvivorBotTier === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={!isHost}
                              onClick={() =>
                                isHost && onUpdateOnlineConfig({ survivorBotTier: opt.id })
                              }
                              className={`py-1.5 px-2 text-xs font-medium rounded-sm border transition-colors ${
                                active
                                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
                                  : 'bg-[#050508] border-stone-800 text-stone-400'
                              } ${isHost ? 'cursor-pointer hover:text-stone-200' : 'opacity-80 cursor-default'}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Member Role */}
                    <div className="space-y-1.5">
                      <div className="text-xs text-stone-400">Odadaki Rol Tercihin</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'random', label: 'Rastgele' },
                            { id: 'survivor', label: 'İnsan' },
                            { id: 'killer', label: 'Katil' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdateOnlineRole(
                                opt.id,
                                myMember?.preferredKiller ?? killerPreference
                              )
                            }
                            className={`py-1.5 px-2 text-xs font-medium rounded-sm border transition-colors cursor-pointer ${
                              (myMember?.preferredRole ?? 'random') === opt.id
                                ? 'bg-red-950/70 border-red-600 text-white'
                                : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Members */}
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {onlineRoom.members.map((m) => {
                        const cls = SURVIVOR_CLASS_LIST.find((c) => c.id === m.preferredClass);
                        const killerName =
                          m.preferredKiller !== 'random'
                            ? KILLER_LIST.find((k) => k.id === m.preferredKiller)?.name ??
                              m.preferredKiller
                            : 'Rastgele';
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-sm bg-[#050508] border border-stone-800/80"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-stone-100 font-medium truncate">{m.name}</span>
                              {m.id === onlineRoom.hostId && (
                                <span className="text-[10px] font-mono text-amber-400">
                                  (Kurucu)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.preferredRole === 'killer' ? (
                                <span className="text-red-400 font-medium">👹 {killerName}</span>
                              ) : (
                                <span className="text-stone-400">
                                  {cls?.emoji} {cls?.name}
                                </span>
                              )}
                              {m.id !== onlineRoom.hostId && (
                                <span
                                  className={`text-[10px] font-mono ${
                                    m.ready ? 'text-emerald-400' : 'text-stone-500'
                                  }`}
                                >
                                  {m.ready ? 'HAZIR' : 'BEKLİYOR'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Chat */}
                    <div className="space-y-1.5 pt-2 border-t border-stone-800/80">
                      {onlineRoom.chat.length > 0 && (
                        <div className="max-h-20 overflow-y-auto space-y-0.5 text-[11px] pr-1">
                          {onlineRoom.chat.slice(-6).map((c) => (
                            <div key={c.id} className="text-stone-300 leading-snug">
                              <span
                                className={`font-semibold mr-1 ${
                                  c.senderId === 'system' ? 'text-amber-400' : 'text-red-400'
                                }`}
                              >
                                {c.senderName}:
                              </span>
                              <span>{c.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!chatText.trim()) return;
                          onSendChat(chatText.trim());
                          setChatText('');
                        }}
                        className="flex gap-1.5"
                      >
                        <input
                          type="text"
                          maxLength={140}
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                          placeholder="Odaya mesaj yaz..."
                          className="flex-1 px-2.5 py-1.5 bg-[#050508] border border-stone-800 rounded-sm text-xs text-white placeholder-stone-500 focus:outline-none focus:border-red-700"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1.5 bg-[#14141c] hover:bg-stone-800 text-stone-200 rounded-sm border border-stone-800 cursor-pointer"
                          title="Gönder"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>

                    {onlineError && (
                      <div className="text-xs text-red-300 bg-red-950/50 border border-red-800/70 rounded-sm px-2.5 py-1.5">
                        {onlineError}
                      </div>
                    )}

                    {/* Start / Ready Button */}
                    {isHost ? (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled={!canStartOnline || onlineBusy}
                          onClick={onStartRoomMatch}
                          className="w-full py-3 px-6 bg-red-800 hover:bg-red-700 disabled:bg-stone-900 disabled:text-stone-500 text-white font-horror font-bold tracking-[0.14em] text-sm rounded-sm border border-red-600/60 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Users className="w-4 h-4" />
                          <span>
                            ODAYI BAŞLAT ({onlineRoom.members.length}/5
                            {onlineRoom.config.fillWithBots ? ' + Botlar' : ' · Botsuz'})
                          </span>
                        </button>
                        {!onlineRoom.config.fillWithBots && onlineRoom.members.length < 2 && (
                          <p className="text-[11px] text-amber-400 text-center">
                            Botlar kapalıyken başlamak için en az 2 oyuncu gerekir.
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleReady(!myMember?.ready)}
                        className={`w-full py-3 px-6 font-bold text-sm rounded-sm flex items-center justify-center gap-2 transition-colors cursor-pointer border ${
                          myMember?.ready
                            ? 'bg-emerald-900/70 hover:bg-emerald-800/80 border-emerald-600/60 text-white'
                            : 'bg-[#14141c] hover:bg-stone-800 text-stone-100 border-stone-700'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          {myMember?.ready ? 'Hazırsın (Kurucu Bekleniyor)' : 'Hazır Ol'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right Panel (5 cols): ALWAYS-VISIBLE Açık Odalar */}
              <div className="xl:col-span-5 bg-[#08080d]/95 border border-stone-800/90 rounded-sm p-5 space-y-3 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2 border-b border-stone-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-red-400" />
                    <h3 className="font-horror text-sm font-bold tracking-wider text-stone-100">
                      AÇIK ODALAR ({publicRooms.length})
                    </h3>
                    {!hasBackend && (
                      <span className="font-mono text-[10px] text-amber-400">· P2P</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onRefreshPublicRooms}
                    className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-white cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${publicRoomsLoading ? 'animate-spin' : ''}`}
                    />
                    <span>Yenile</span>
                  </button>
                </div>

                {publicRooms.length === 0 ? (
                  <div className="text-xs text-stone-400 border border-dashed border-stone-800 rounded-sm px-4 py-8 text-center">
                    Şu an bekleyen açık oda yok. Yeni bir açık oda kurduğunda hemen burada listelenir.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                    {publicRooms.map((r) => {
                      const isFull = r.playerCount >= r.maxPlayers;
                      const isMyRoom = onlineRoom?.code === r.code;
                      return (
                        <div
                          key={r.code}
                          className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm border text-xs transition-colors ${
                            isMyRoom
                              ? 'bg-red-950/30 border-red-700/70'
                              : 'bg-[#050508] hover:bg-[#0e0e16] border-stone-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-amber-400 shrink-0">
                                {r.code}
                              </span>
                              <span aria-hidden="true" className="text-stone-600">
                                ·
                              </span>
                              <span className="text-stone-100 font-semibold truncate">
                                {r.hostName}
                              </span>
                              {isMyRoom && (
                                <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                                  (Odan)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-mono">
                              <span>
                                {r.playerCount}/{r.maxPlayers}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{r.fillWithBots ? 'Botlu' : 'Botsuz'}</span>
                              {r.fillWithBots && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Katil: {getBotTierLabel(r.killerBotTier)} / İnsan:{' '}
                                    {getBotTierLabel(r.survivorBotTier)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {isMyRoom ? (
                            <span className="px-2.5 py-1 bg-stone-900 border border-stone-700 text-stone-300 text-[11px] font-semibold rounded-sm shrink-0">
                              İçindesin
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={onlineBusy || isFull || Boolean(onlineRoom)}
                              onClick={() => onJoinRoom(r.code)}
                              className="px-3.5 py-1.5 bg-red-800 hover:bg-red-700 disabled:bg-stone-900 disabled:text-stone-500 text-white text-xs font-semibold rounded-sm transition-colors cursor-pointer shrink-0"
                            >
                              {isFull ? 'Dolu' : 'Katıl'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------
            STAGE 3: SINIF & KATİL SEÇİMİ (Shop + Loadout Screen)
           --------------------------------------------------------------- */}
        {effectiveSection === 'loadout' && (
          <section className="max-w-6xl w-full space-y-5">
            <div className="bg-[#08080d]/95 border border-stone-800 rounded-sm p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => setActiveSection(onlineRoom ? 'online' : 'solo')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#12121a] hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs font-semibold rounded-sm transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Oyuna Dön</span>
                </button>
                <div>
                  <h2 className="font-horror text-xl sm:text-2xl font-bold tracking-wider text-stone-100">
                    SINIF &amp; KATİL SEÇİMİ
                  </h2>
                  <div className="text-xs text-stone-400 flex items-center flex-wrap gap-2 mt-0.5">
                    <span>
                      İnsan:{' '}
                      <strong className="text-stone-200">
                        {selectedSurvSpec.emoji} {selectedSurvSpec.name}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Katil:{' '}
                      <strong className="text-red-400">
                        {selectedKillerSpec ? selectedKillerSpec.name : 'Rastgele'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-950/40 border border-amber-700/60 rounded-sm font-mono text-xs font-bold text-amber-300">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>{coins} Para</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShopError(null);
                    setLoadoutTab('survivors');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-sm border transition-colors cursor-pointer ${
                    loadoutTab === 'survivors'
                      ? 'bg-stone-900 border-stone-500 text-white'
                      : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hayatta Kalanlar ({SURVIVOR_CLASS_LIST.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShopError(null);
                    setLoadoutTab('killers');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-sm border transition-colors cursor-pointer ${
                    loadoutTab === 'killers'
                      ? 'bg-red-950/60 border-red-600 text-white'
                      : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Skull className="w-3.5 h-3.5 text-red-400" />
                  <span>Canavar Katiller ({KILLER_LIST.length})</span>
                </button>
              </div>
            </div>

            {shopError && (
              <div className="text-xs text-red-200 bg-red-950/60 border border-red-700/80 rounded-sm px-4 py-2.5">
                {shopError}
              </div>
            )}

            {loadoutTab === 'survivors' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {SURVIVOR_CLASS_LIST.map((cls) => {
                  const isUnlocked = unlockedClasses.includes(cls.id);
                  const isSelected = isUnlocked && selectedClass === cls.id;
                  const price = SURVIVOR_PRICES[cls.id] ?? 0;
                  const canAfford = coins >= price;
                  const isBuying = buyingKey === `survivor:${cls.id}`;

                  return (
                    <div
                      key={cls.id}
                      onClick={() => {
                        if (isUnlocked) onSelectClass(cls.id);
                      }}
                      className={`text-left p-5 rounded-sm border transition-colors flex flex-col justify-between space-y-4 ${
                        isSelected
                          ? 'bg-[#12161e]/95 border-amber-500/80 cursor-pointer'
                          : isUnlocked
                          ? 'bg-[#08080d]/92 border-stone-800 hover:border-stone-600 cursor-pointer'
                          : 'bg-[#07070b]/92 border-stone-800/80'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl leading-none" aria-hidden="true">
                              {cls.emoji}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-base font-bold text-stone-100">
                                  {cls.name}
                                </h3>
                                {isSelected && (
                                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                                )}
                                {!isUnlocked && (
                                  <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-xs text-stone-400">{cls.roleTag}</div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-xs text-stone-300 space-y-0.5">
                            <div
                              className={`font-bold ${
                                price === 0
                                  ? 'text-emerald-400'
                                  : isUnlocked
                                  ? 'text-stone-400'
                                  : canAfford
                                  ? 'text-amber-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {price === 0 ? 'Ücretsiz' : isUnlocked ? 'Açık' : `${price} Para`}
                            </div>
                            <div>
                              Can: {cls.hp} · Hız: {cls.speed}
                              {cls.maxStamina ? ` · Stamina: ${cls.maxStamina}` : ''}
                            </div>
                          </div>
                        </div>

                        {cls.passive && (
                          <div className="text-xs text-amber-300/90">Pasif: {cls.passive}</div>
                        )}

                        <div className="space-y-2 pt-3 border-t border-stone-800/80 text-xs">
                          {cls.abilities.map((ab) => (
                            <div key={ab.key} className="space-y-0.5">
                              <div className="flex items-center justify-between text-stone-200 font-semibold">
                                <span>
                                  <span className="font-mono text-amber-400 mr-1.5">[{ab.key}]</span>
                                  {ab.name}
                                </span>
                                <span className="font-mono text-stone-400">{ab.cooldown}sn</span>
                              </div>
                              <p className="text-stone-400 leading-relaxed">{ab.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-stone-800/70">
                        {isUnlocked ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectClass(cls.id);
                            }}
                            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-sm border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                                : 'bg-[#12121a] hover:bg-stone-800 border-stone-700 text-stone-200'
                            }`}
                          >
                            {isSelected ? 'Seçili' : 'Seç'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBuying || !canAfford}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handlePurchase('survivor', cls.id);
                            }}
                            className={`flex-1 py-2 px-3 text-xs font-bold rounded-sm border transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                              canAfford
                                ? 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-slate-950'
                                : 'bg-stone-900 border-stone-800 text-stone-500 cursor-not-allowed'
                            }`}
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span>
                              {isBuying ? 'Alınıyor...' : `Satın Al (${price} Para)`}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartTestArena({
                              role: 'survivor',
                              survivorClass: cls.id,
                              killerId: killerPreference === 'random' ? 'juggernaut' : killerPreference,
                            });
                          }}
                          className="px-3 py-2 bg-[#111118] hover:bg-amber-950/50 border border-stone-700 hover:border-amber-600/70 text-amber-300 text-xs font-semibold rounded-sm transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
                        >
                          <FlaskConical className="w-3.5 h-3.5" />
                          <span>Test Et</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#08080d]/95 border border-stone-800 rounded-sm px-4 py-3">
                  <div className="text-xs text-stone-300">
                    Seçili Katil:{' '}
                    <span className="font-semibold text-red-400">
                      {killerPreference === 'random'
                        ? 'Rastgele (Açık Olanlardan)'
                        : `${KILLER_LIST.find((k) => k.id === killerPreference)?.name}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChangeKillerPreference('random')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-sm border transition-colors cursor-pointer ${
                      killerPreference === 'random'
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                        : 'bg-[#12121a] border-stone-700 text-stone-300 hover:text-white'
                    }`}
                  >
                    Rastgele Seç
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {KILLER_LIST.map((k) => {
                    const isUnlocked = unlockedKillers.includes(k.id);
                    const isSelected = isUnlocked && killerPreference === k.id;
                    const price = KILLER_PRICES[k.id] ?? 0;
                    const canAfford = coins >= price;
                    const isBuying = buyingKey === `killer:${k.id}`;

                    return (
                      <div
                        key={k.id}
                        onClick={() => {
                          if (isUnlocked) onChangeKillerPreference(k.id);
                        }}
                        className={`border rounded-sm p-5 flex flex-col justify-between gap-4 transition-colors ${
                          isSelected
                            ? 'bg-[#160a0e]/95 border-red-600 cursor-pointer'
                            : isUnlocked
                            ? 'bg-[#08080d]/92 border-stone-800 hover:border-stone-600 cursor-pointer'
                            : 'bg-[#07070b]/92 border-stone-800/80'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          <div className="bg-[#050508] border border-stone-800 rounded-sm p-2 shrink-0 self-center sm:self-start">
                            <KillerPreview killerId={k.id} size={88} />
                          </div>
                          <div className="flex-1 space-y-2.5 w-full">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-horror text-lg font-bold text-stone-100">
                                    {k.name}
                                  </h3>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-red-400 shrink-0" />
                                  )}
                                  {!isUnlocked && (
                                    <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  )}
                                </div>
                                <div className="text-xs text-red-400">{k.title}</div>
                              </div>
                              <div className="text-right font-mono text-xs text-stone-300 space-y-0.5">
                                <div
                                  className={`font-bold ${
                                    price === 0
                                      ? 'text-emerald-400'
                                      : isUnlocked
                                      ? 'text-stone-400'
                                      : canAfford
                                      ? 'text-amber-400'
                                      : 'text-red-400'
                                  }`}
                                >
                                  {price === 0 ? 'Ücretsiz' : isUnlocked ? 'Açık' : `${price} Para`}
                                </div>
                                <div>Hasar: {k.damage} · Hız: {k.speed}</div>
                              </div>
                            </div>

                            <div className="text-[11px] font-mono text-rose-300/95 bg-red-950/30 border border-red-900/40 rounded-sm px-2.5 py-1">
                              Vuruş Bekleme Süresi: {k.attackCooldownDesc}
                            </div>

                            {k.passive && (
                              <div className="text-xs text-amber-300/90">Pasif: {k.passive}</div>
                            )}

                            <div className="space-y-1.5 pt-2 border-t border-stone-800/80 text-xs">
                              {k.abilities.map((ab) => (
                                <div key={ab.key}>
                                  <div className="flex items-center justify-between font-semibold text-stone-200">
                                    <span>
                                      <span className="font-mono text-red-400 mr-1.5">[{ab.key}]</span>
                                      {ab.name}
                                    </span>
                                    <span className="font-mono text-stone-400">
                                      {ab.cooldown > 0 ? `${ab.cooldown}sn` : 'Anında'}
                                    </span>
                                  </div>
                                  <p className="text-stone-400 leading-relaxed">{ab.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-stone-800/70">
                          {isUnlocked ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onChangeKillerPreference(k.id);
                              }}
                              className={`flex-1 py-2 px-3 text-xs font-semibold rounded-sm border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-red-900/50 border-red-500 text-red-200'
                                  : 'bg-[#12121a] hover:bg-stone-800 border-stone-700 text-stone-200'
                              }`}
                            >
                              {isSelected ? 'Seçili' : 'Seç'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBuying || !canAfford}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handlePurchase('killer', k.id);
                              }}
                              className={`flex-1 py-2 px-3 text-xs font-bold rounded-sm border transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                                canAfford
                                  ? 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-slate-950'
                                  : 'bg-stone-900 border-stone-800 text-stone-500 cursor-not-allowed'
                              }`}
                            >
                              <Coins className="w-3.5 h-3.5" />
                              <span>
                                {isBuying ? 'Alınıyor...' : `Satın Al (${price} Para)`}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartTestArena({
                                role: 'killer',
                                survivorClass: selectedClass,
                                killerId: k.id,
                              });
                            }}
                            className="px-3 py-2 bg-[#111118] hover:bg-amber-950/50 border border-stone-700 hover:border-amber-600/70 text-amber-300 text-xs font-semibold rounded-sm transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
                          >
                            <FlaskConical className="w-3.5 h-3.5" />
                            <span>Test Alanında Dene</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---------------------------------------------------------------
            STAGE 3.5: TEST ALANI (Try ANY Killer or Survivor freely)
           --------------------------------------------------------------- */}
        {effectiveSection === 'test' && (
          <section className="max-w-5xl w-full space-y-5">
            <div className="bg-[#08080d]/95 border border-amber-800/60 rounded-sm p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-horror text-2xl sm:text-3xl font-bold tracking-[0.12em] text-amber-300 flex items-center gap-2.5">
                  <FlaskConical className="w-6 h-6 text-amber-400" />
                  <span>TEST ALANI</span>
                </h2>
                <p className="text-xs text-stone-300 mt-1">
                  Satın almadığın tüm katilleri ve hayatta kalan sınıflarını botlara karşı ücretsiz dene. Bu modda para kazanılmaz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection(onlineRoom ? 'online' : 'solo')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0e0e15] hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs font-semibold rounded-sm transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Geri Dön</span>
              </button>
            </div>

            <div className="bg-[#08080d]/95 border border-stone-800 rounded-sm p-5 space-y-5">
              <div className="space-y-2">
                <div className="text-xs font-medium text-stone-400">Denemek İstediğin Rol</div>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => setTestRole('survivor')}
                    className={`py-2.5 px-4 text-xs font-bold rounded-sm border transition-colors cursor-pointer ${
                      testRole === 'survivor'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                        : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    🛡️ Hayatta Kalan Dene
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestRole('killer')}
                    className={`py-2.5 px-4 text-xs font-bold rounded-sm border transition-colors cursor-pointer ${
                      testRole === 'killer'
                        ? 'bg-red-950/70 border-red-500 text-red-200'
                        : 'bg-[#050508] border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    👹 Katil Dene
                  </button>
                </div>
              </div>

              {testRole === 'survivor' ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-stone-400">
                    Tüm Hayatta Kalan Sınıfları (Kilitliler Dahil)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {SURVIVOR_CLASS_LIST.map((cls) => {
                      const active = testSurvivorClass === cls.id;
                      const isLocked = !unlockedClasses.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => setTestSurvivorClass(cls.id)}
                          className={`p-3.5 rounded-sm border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-amber-950/40 border-amber-500 text-white'
                              : 'bg-[#050508] border-stone-800 text-stone-300 hover:border-stone-600'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-2xl">{cls.emoji}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-xs truncate">{cls.name}</div>
                              <div className="text-[11px] text-stone-400 truncate">
                                {isLocked ? `Kilitli (${SURVIVOR_PRICES[cls.id]} Para)` : 'Açık'}
                              </div>
                            </div>
                          </div>
                          {active && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-stone-400">
                    Tüm Katiller (Kilitliler Dahil)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {KILLER_LIST.map((k) => {
                      const active = testKillerId === k.id;
                      const isLocked = !unlockedKillers.includes(k.id);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => setTestKillerId(k.id)}
                          className={`p-3 rounded-sm border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? 'bg-red-950/50 border-red-500 text-white'
                              : 'bg-[#050508] border-stone-800 text-stone-300 hover:border-stone-600'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="shrink-0">
                              <KillerPreview killerId={k.id} size={36} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-horror font-bold text-sm truncate">{k.name}</div>
                              <div className="text-[11px] text-stone-400 truncate">
                                {isLocked ? `Kilitli (${KILLER_PRICES[k.id]} Para)` : 'Açık'}
                              </div>
                            </div>
                          </div>
                          {active && <Check className="w-4 h-4 text-red-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-stone-800/80">
                <button
                  type="button"
                  onClick={() =>
                    onStartTestArena({
                      role: testRole,
                      survivorClass: testSurvivorClass,
                      killerId: testKillerId,
                    })
                  }
                  className="w-full sm:w-auto px-7 py-3.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-horror font-bold tracking-[0.14em] text-base rounded-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>TEST ALANINI BAŞLAT</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------
            STAGE 4: KURALLAR
           --------------------------------------------------------------- */}
        {effectiveSection === 'rules' && (
          <section className="max-w-4xl w-full space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-horror text-2xl sm:text-3xl font-bold tracking-[0.12em] text-stone-100">
                TESİS KURALLARI
              </h2>
              <button
                type="button"
                onClick={() => setActiveSection(onlineRoom ? 'online' : 'solo')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0e0e15] hover:bg-stone-800 border border-stone-700 text-stone-200 text-xs font-semibold rounded-sm transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Geri Dön</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#08080d]/95 border border-stone-800 rounded-sm p-5 space-y-2.5">
                <h3 className="font-horror text-base font-bold text-stone-100">Kontroller</h3>
                <div className="space-y-1.5 text-stone-300">
                  <div>
                    <span className="font-mono text-amber-400">W A S D</span> · Hareket et
                  </div>
                  <div>
                    <span className="font-mono text-amber-400">Shift</span> · Koş (İnsan 100 / Protector 110, Katil 120 Stamina)
                  </div>
                  <div>
                    <span className="font-mono text-amber-400">Sol Tık / Space</span> · Katil vuruşu (Sawblooder basılı tutar)
                  </div>
                  <div>
                    <span className="font-mono text-amber-400">Q / E / R</span> · Sınıf ve canavar yetenekleri
                  </div>
                  <div>
                    <span className="font-mono text-amber-400">F (Basılı Tut)</span> · Kurtarma (3sn) / kapan çözme (1.5sn) / testere tamir (1sn) / barikat kırma (4sn)
                  </div>
                  <div>
                    <span className="font-mono text-amber-400">T / .</span> · Hayatta kalan telsiz sohbeti (Katil göremez)
                  </div>
                </div>
              </div>

              <div className="bg-[#08080d]/95 border border-stone-800 rounded-sm p-5 space-y-2.5">
                <h3 className="font-horror text-base font-bold text-stone-100">
                  Süre Uzatma &amp; Yere Düşme
                </h3>
                <p className="text-stone-300 leading-relaxed">
                  Maç süresi <span className="font-mono text-stone-100">3 dakika (180sn)</span>. Katil birini her yere düşürdüğünde{' '}
                  <span className="font-mono text-amber-400">+15sn</span>, biri öldüğünde{' '}
                  <span className="font-mono text-red-400">+30sn</span> uzar.
                </p>
                <p className="text-stone-300 leading-relaxed">
                  Yere düşen oyuncu 100 sarı canla başlar (%50 yavaşlar) ve canı saniyede 5 azalır. 1 cana inmeden F tuşuna 3 sn basılı tutularak kurtarılabilir; 1 cana düşerse kritik hale gelir (%80 yavaşlar) ve öldürülebilir olur. Ayaktaki tüm hayatta kalanlar yerdeyse katil direkt öldürebilir. 3. düşüşte direkt elenirsin.
                </p>
              </div>

              <div className="bg-[#08080d]/95 border border-stone-800 rounded-sm p-5 space-y-2.5">
                <h3 className="font-horror text-base font-bold text-stone-100">
                  Bot Sınıf Kuralları
                </h3>
                <p className="text-stone-300 leading-relaxed">
                  Aylin (Bot) başka bir oyuncu Doctor seçmediği sürece her zaman Doctor oynar; Doctor seçildiyse farklı bir sınıf alır. Diğer tüm botların sınıfları rastgele ve benzersiz seçilir.
                </p>
              </div>

              <div className="bg-[#08080d]/95 border border-stone-800 rounded-sm p-5 space-y-2.5">
                <h3 className="font-horror text-base font-bold text-stone-100">
                  Çok Oyunculu Zorluk
                </h3>
                <p className="text-stone-300 leading-relaxed">
                  Çok oyunculu odalarda ve tek oyunculu lobide hem katil hem hayatta kalan bot zorluğunu Kolay, Orta, Zor veya Rastgele olarak ayarlayabilirsin.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
