import { useState } from 'react';
import {
  Play,
  Users,
  Shield,
  Skull,
  ArrowRight,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Bot,
  Globe,
  Lock,
  Send,
  Wifi,
} from 'lucide-react';
import { KILLER_LIST, SURVIVOR_CLASS_LIST } from '../game/constants';
import { KillerId, SurvivorClassId } from '../game/types';
import {
  OnlineRolePreference,
  OnlineRoomSnapshot,
  PublicRoomSummary,
} from '../multiplayer/types';
import { TransportKind } from '../multiplayer/client';
import { KillerPreview } from './KillerPreview';

interface LobbyScreenProps {
  playerName: string;
  onChangePlayerName: (name: string) => void;
  selectedClass: SurvivorClassId;
  onSelectClass: (id: SurvivorClassId) => void;
  rolePreference: 'random' | 'survivor' | 'killer';
  onChangeRolePreference: (pref: 'random' | 'survivor' | 'killer') => void;
  killerPreference: KillerId | 'random';
  onChangeKillerPreference: (k: KillerId | 'random') => void;
  onStartSolo: () => void;
  onlineRoom: OnlineRoomSnapshot | null;
  onlinePlayerId: string;
  onlineError: string | null;
  onlineBusy: boolean;
  transportKind: TransportKind;
  pingMs: number | null;
  publicRooms: PublicRoomSummary[];
  onRefreshPublicRooms: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onUpdateOnlineConfig: (patch: { fillWithBots?: boolean; isPublic?: boolean }) => void;
  onUpdateOnlineRole: (role: OnlineRolePreference, killer?: KillerId | 'random') => void;
  onSendChat: (text: string) => void;
  onStartRoomMatch: () => void;
}

export function LobbyScreen({
  playerName,
  onChangePlayerName,
  selectedClass,
  onSelectClass,
  rolePreference,
  onChangeRolePreference,
  killerPreference,
  onChangeKillerPreference,
  onStartSolo,
  onlineRoom,
  onlinePlayerId,
  onlineError,
  onlineBusy,
  transportKind,
  pingMs,
  publicRooms,
  onRefreshPublicRooms,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onUpdateOnlineConfig,
  onUpdateOnlineRole,
  onSendChat,
  onStartRoomMatch,
}: LobbyScreenProps) {
  const [activeTab, setActiveTab] = useState<'survivors' | 'killers'>('survivors');
  const [modeTab, setModeTab] = useState<'solo' | 'online'>('solo');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatText, setChatText] = useState('');

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const myMember = onlineRoom?.members.find((m) => m.id === onlinePlayerId);
  const isHost = Boolean(onlineRoom && onlineRoom.hostId === onlinePlayerId);
  const canStartOnline = Boolean(
    onlineRoom &&
      isHost &&
      (onlineRoom.config.fillWithBots || onlineRoom.members.length >= 2)
  );

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col">
      {/* Clean 3-zone Top Header */}
      <header className="border-b border-slate-800/80 bg-[#0d131d]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            Karanlık Kaçış
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setActiveTab('survivors')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'survivors' ? 'text-slate-100' : 'hover:text-slate-200'
              }`}
            >
              Hayatta Kalan Sınıfları
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('killers')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'killers' ? 'text-slate-100' : 'hover:text-slate-200'
              }`}
            >
              Canavar Katiller
            </button>
            <a
              href="#kurallar"
              className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              Oyun Kuralları
            </a>
          </nav>

          <button
            type="button"
            onClick={onStartSolo}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            <span>Hemen Oyna</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
        {/* Hero & Mode Setup Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <span>1v4 Asimetrik Hayatta Kalma</span>
                <span aria-hidden="true">·</span>
                <span>3 Dakika Süre</span>
                <span aria-hidden="true">·</span>
                <span>Rastgele Katil Seçimi</span>
              </div>
              <h1
                className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.08]"
                style={{ textWrap: 'balance' }}
              >
                Kapıları Kilitle, Tuzakları Kur ve 3 Dakika Hayatta Kal
              </h1>
              <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
                5 kişilik karanlık tesiste 1 kişi rastgele canavar katil seçilir. Diğer 4 hayatta kalan
                kapılar, ventler ve kafesler arasında özel sınıf yeteneklerini kullanarak süreyi
                tamamlamaya çalışır. Canın sıfırlanırsa sarı <span className="font-mono text-yellow-400">100 canla</span> yere düşersin
                (saniyede 5 azalır, bu sırada katil seni öldüremez); kurtarılmazsan <span className="font-mono text-rose-400">1 canla</span> %80 yavaşlar ve öldürülebilir olursun.
              </p>
            </div>

            {/* Key Stats Strip (clean unboxed typographic strip) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80">
              <div>
                <div className="font-mono text-2xl font-bold text-white">03:00</div>
                <div className="text-xs text-slate-400 mt-0.5">Hayatta Kalma Süresi</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-emerald-400">100 / 120</div>
                <div className="text-xs text-slate-400 mt-0.5">İnsan / Katil Stamina</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-amber-400">5 Vuruş</div>
                <div className="text-xs text-slate-400 mt-0.5">Kilitli Kapı Kırma</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-rose-400">100 → 1 / 5s</div>
                <div className="text-xs text-slate-400 mt-0.5">Sarı Can / Kurtarma</div>
              </div>
            </div>
          </div>

          {/* Match Launch Panel */}
          <div className="lg:col-span-5 bg-[#121926] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-bold text-white">Maç Hazırlığı</h2>
                <div className="flex items-center gap-1 p-1 bg-[#0b0f17] rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModeTab('solo')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      modeTab === 'solo'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tek Oyunculu (Botlu)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModeTab('online');
                      onRefreshPublicRooms();
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      modeTab === 'online'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Çok Oyunculu Oda
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="player-name"
                  className="block text-xs font-medium text-slate-400 mb-1.5"
                >
                  Oyuncu Adı
                </label>
                <input
                  id="player-name"
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => onChangePlayerName(e.target.value)}
                  placeholder="Adını yaz..."
                  className="w-full px-3.5 py-2.5 bg-[#0b0f17] border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {modeTab === 'solo' ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1.5">
                      Rol Seçimi (Varsayılan: Katil Rastgele)
                    </div>
                    <div className="grid grid-cols-3 gap-2">
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
                          className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            rolePreference === opt.id
                              ? 'bg-rose-600/20 border-rose-500 text-white'
                              : 'bg-[#0b0f17] border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {rolePreference === 'killer' && (
                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-1.5">
                        Canavar Tercihi
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onChangeKillerPreference('random')}
                          className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                            killerPreference === 'random'
                              ? 'bg-amber-500/20 border-amber-400 text-white'
                              : 'bg-[#0b0f17] border-slate-800 text-slate-400'
                          }`}
                        >
                          Rastgele
                        </button>
                        {KILLER_LIST.map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => onChangeKillerPreference(k.id)}
                            className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors truncate cursor-pointer ${
                              killerPreference === k.id
                                ? 'bg-rose-600/20 border-rose-500 text-white'
                                : 'bg-[#0b0f17] border-slate-800 text-slate-400'
                            }`}
                          >
                            {k.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-400 pt-1">
                    Seçili Hayatta Kalan Sınıfı:{' '}
                    <span className="text-slate-100 font-semibold">
                      {SURVIVOR_CLASS_LIST.find((c) => c.id === selectedClass)?.emoji}{' '}
                      {SURVIVOR_CLASS_LIST.find((c) => c.id === selectedClass)?.name}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {!onlineRoom ? (
                    <>
                      <button
                        type="button"
                        disabled={onlineBusy}
                        onClick={onCreateRoom}
                        className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {onlineBusy ? 'Oda Oluşturuluyor...' : 'Yeni Oda Oluştur'}
                      </button>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={4}
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && joinCode.trim()) onJoinRoom(joinCode);
                          }}
                          placeholder="Oda Kodu (örn. A7K2)"
                          className="flex-1 px-3 py-2 bg-[#0b0f17] border border-slate-700 rounded-lg text-sm font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          disabled={onlineBusy}
                          onClick={() => onJoinRoom(joinCode)}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Katıl
                        </button>
                      </div>

                      {onlineError && (
                        <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-lg px-3 py-2">
                          {onlineError}
                        </div>
                      )}

                      {/* Public Rooms List */}
                      <div className="bg-[#0b0f17] border border-slate-800 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-300">
                            Açık Odalar ({publicRooms.length})
                          </span>
                          <button
                            type="button"
                            onClick={onRefreshPublicRooms}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Yenile</span>
                          </button>
                        </div>
                        {publicRooms.length === 0 ? (
                          <div className="text-[11px] text-slate-500 py-1">
                            Şu an bekleyen açık oda yok. Yeni oda kurup kodunu paylaşabilirsin.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {publicRooms.map((r) => (
                              <div
                                key={r.code}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#121926] border border-slate-800 rounded-md text-xs"
                              >
                                <div className="min-w-0">
                                  <span className="font-mono font-bold text-amber-400 mr-2">
                                    {r.code}
                                  </span>
                                  <span className="text-slate-200 truncate">{r.hostName}</span>
                                  <span className="text-slate-500 ml-2">
                                    {r.playerCount}/{r.maxPlayers}
                                    {r.fillWithBots ? ' · Botlu' : ' · Botsuz'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  disabled={onlineBusy}
                                  onClick={() => onJoinRoom(r.code)}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold rounded cursor-pointer shrink-0"
                                >
                                  Katıl
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3 bg-[#0b0f17] p-3.5 rounded-lg border border-slate-800">
                      {/* Room Header: Code + Copy + Transport + Leave */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Oda:</span>
                          <span className="font-mono text-lg font-bold tracking-widest text-amber-400">
                            {onlineRoom.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(onlineRoom.code)}
                            title="Oda kodunu kopyala"
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            {copiedCode ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400"
                            title="Bağlantı durumu"
                          >
                            <Wifi className="w-3 h-3" />
                            {transportKind === 'ws'
                              ? `WS${pingMs ? ` ${pingMs}ms` : ''}`
                              : transportKind === 'sse'
                              ? 'HTTP Akışı'
                              : 'Bağlanıyor'}
                          </span>
                          <button
                            type="button"
                            onClick={onLeaveRoom}
                            title="Odadan ayrıl"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 rounded border border-slate-700 cursor-pointer"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>Çık</span>
                          </button>
                        </div>
                      </div>

                      {/* Room Config (Host toggles, guests view) */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!isHost}
                          onClick={() =>
                            isHost &&
                            onUpdateOnlineConfig({ fillWithBots: !onlineRoom.config.fillWithBots })
                          }
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                            onlineRoom.config.fillWithBots
                              ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-300'
                              : 'bg-slate-900 border-slate-700 text-slate-300'
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
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                            onlineRoom.config.isPublic
                              ? 'bg-sky-950/30 border-sky-700/60 text-sky-300'
                              : 'bg-slate-900 border-slate-700 text-slate-300'
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

                      {/* Personal Role Preference in Online Room */}
                      <div>
                        <div className="text-[11px] font-medium text-slate-400 mb-1">
                          Rol Tercihin
                        </div>
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
                              onClick={() => onUpdateOnlineRole(opt.id)}
                              className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                                (myMember?.preferredRole ?? 'random') === opt.id
                                  ? 'bg-rose-600/20 border-rose-500 text-white'
                                  : 'bg-[#121926] border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Member List */}
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {onlineRoom.members.map((m) => {
                          const cls = SURVIVOR_CLASS_LIST.find((c) => c.id === m.preferredClass);
                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[#121926] border border-slate-800/80"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    m.connected ? 'bg-emerald-400' : 'bg-amber-400'
                                  }`}
                                />
                                <span className="text-slate-200 font-medium truncate">
                                  {m.name}
                                </span>
                                {m.id === onlineRoom.hostId && (
                                  <span className="text-[10px] font-mono text-amber-400">
                                    (Kurucu)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-400">
                                  {cls?.emoji} {cls?.name}
                                </span>
                                {m.id !== onlineRoom.hostId && (
                                  <span
                                    className={`text-[10px] font-mono ${
                                      m.ready ? 'text-emerald-400' : 'text-slate-500'
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

                      {/* Quick Room Chat */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-800">
                        {onlineRoom.chat.length > 0 && (
                          <div className="max-h-20 overflow-y-auto space-y-0.5 text-[11px] pr-1">
                            {onlineRoom.chat.slice(-6).map((c) => (
                              <div key={c.id} className="text-slate-300 leading-snug">
                                <span
                                  className={`font-semibold mr-1 ${
                                    c.senderId === 'system' ? 'text-amber-400' : 'text-sky-400'
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
                            className="flex-1 px-2.5 py-1.5 bg-[#121926] border border-slate-800 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 cursor-pointer"
                            title="Gönder"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </div>

                      {onlineError && (
                        <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded px-2.5 py-1.5">
                          {onlineError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {modeTab === 'solo' ? (
              <button
                type="button"
                onClick={onStartSolo}
                className="w-full py-3.5 px-6 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-base rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Maçı Başlat</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : onlineRoom && isHost ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={!canStartOnline || onlineBusy}
                  onClick={onStartRoomMatch}
                  className="w-full py-3.5 px-6 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-display font-bold text-base rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>
                    Odayı Başlat ({onlineRoom.members.length}/5
                    {onlineRoom.config.fillWithBots ? ' + Botlar' : ' · Botsuz'})
                  </span>
                </button>
                {!onlineRoom.config.fillWithBots && onlineRoom.members.length < 2 && (
                  <p className="text-[11px] text-amber-400 text-center">
                    Botlar kapalıyken başlamak için en az 2 oyuncu katılmalı veya Bot Doldur&apos;u aç.
                  </p>
                )}
              </div>
            ) : onlineRoom ? (
              <button
                type="button"
                onClick={() => onToggleReady(!myMember?.ready)}
                className={`w-full py-3 px-6 font-display font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  myMember?.ready
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {myMember?.ready
                    ? 'Hazırsın (Kurucu Başlatması Bekleniyor)'
                    : 'Hazır Ol'}
                </span>
              </button>
            ) : (
              <div className="text-xs text-center text-slate-400 py-2">
                Arkadaşlarınla oynamak için yeni oda kur veya açık bir odaya katıl.
              </div>
            )}
          </div>
        </section>

        {/* Character Roster Tabs: Survivors & Monster Killers */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('survivors')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'survivors'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Hayatta Kalan Sınıfları (6)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('killers')}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'killers'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Skull className="w-4 h-4 text-rose-400" />
                <span>Canavar Katiller (4)</span>
              </button>
            </div>
            <div className="text-xs text-slate-400">
              {activeTab === 'survivors'
                ? 'Oynamak istediğin sınıfı seç — katil seçilmezsen bu sınıfla başlarsın'
                : 'Canavarların canı yoktur; normal vuruş ve Q/E/R/CTRL yeteneklerini kullanırlar'}
            </div>
          </div>

          {activeTab === 'survivors' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SURVIVOR_CLASS_LIST.map((cls) => {
                const isSelected = selectedClass === cls.id;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => onSelectClass(cls.id)}
                    className={`text-left p-5 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between space-y-4 ${
                      isSelected
                        ? 'bg-[#162032] border-sky-500'
                        : 'bg-[#121926] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl leading-none" aria-hidden="true">
                            {cls.emoji}
                          </span>
                          <div>
                            <h3 className="font-display text-lg font-bold text-white">
                              {cls.name}
                            </h3>
                            <div className="text-xs text-slate-400">{cls.roleTag}</div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs text-slate-300">
                          <div>Can: {cls.hp}</div>
                          <div>Hız: {cls.speed}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-slate-800/80 text-xs">
                      {cls.abilities.map((ab) => (
                        <div key={ab.key} className="space-y-0.5">
                          <div className="flex items-center justify-between text-slate-200 font-semibold">
                            <span>
                              <span className="font-mono text-sky-400 mr-1.5">[{ab.key}]</span>
                              {ab.name}
                            </span>
                            <span className="font-mono text-slate-400">{ab.cooldown}sn</span>
                          </div>
                          <p className="text-slate-400 leading-relaxed">{ab.description}</p>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {KILLER_LIST.map((k) => (
                <div
                  key={k.id}
                  className="bg-[#121926] border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-start"
                >
                  <div className="bg-[#0b0f17] border border-slate-800 rounded-xl p-2 shrink-0 self-center sm:self-start">
                    <KillerPreview killerId={k.id} size={96} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-xl font-bold text-white">{k.name}</h3>
                        <div className="text-xs text-rose-400">{k.title}</div>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-300">
                        <div>Hasar: {k.damage}</div>
                        <div>Hız: {k.speed}</div>
                      </div>
                    </div>

                    {k.passive && (
                      <div className="text-xs text-amber-300/90">
                        Pasif: {k.passive}
                      </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                      {k.abilities.map((ab) => (
                        <div key={ab.key}>
                          <div className="flex items-center justify-between font-semibold text-slate-200">
                            <span>
                              <span className="font-mono text-rose-400 mr-1.5">[{ab.key}]</span>
                              {ab.name}
                            </span>
                            <span className="font-mono text-slate-400">
                              {ab.cooldown > 0 ? `${ab.cooldown}sn` : 'Anında'}
                            </span>
                          </div>
                          <p className="text-slate-400 leading-relaxed">{ab.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Controls & Mechanics Reference */}
        <section
          id="kurallar"
          className="bg-[#121926] border border-slate-800 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm"
        >
          <div className="space-y-2">
            <h3 className="font-display font-bold text-white">Temel Kontroller</h3>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div>
                <span className="font-mono text-slate-100">W A S D</span> · Hareket et (Fare ile yön)
              </div>
              <div>
                <span className="font-mono text-slate-100">Shift</span> · Koş (İnsan +5, Katil +6 hız)
              </div>
              <div>
                <span className="font-mono text-slate-100">Sol Tık / Space</span> · Katil normal vuruşu
              </div>
              <div>
                <span className="font-mono text-slate-100">Q / E / R</span> · Sınıf & Canavar yetenekleri
              </div>
              <div>
                <span className="font-mono text-slate-100">CTRL</span> · Smile gülücük işaretine ışınlan
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display font-bold text-white">Kurtarma & Etkileşim (F)</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Yere düşünce sarı <span className="font-mono text-yellow-400">100 can</span> alırsın (saniyede 5 azalır) ve <span className="font-mono text-amber-400">%50 yavaşlarsın</span>; bu sürede katil seni öldüremez. Kimse <span className="font-mono text-emerald-400">5sn F</span> ile kurtarmazsa canın <span className="font-mono text-rose-400">1</span> olur, yavaşlaman <span className="font-mono text-rose-400">%80</span>&apos;e çıkar ve öldürülebilir olursun. <span className="text-slate-100 font-semibold">3. düşüşte</span> direkt ölürsün.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-display font-bold text-white">Harita Unsurları</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Tesiste kilitlenebilen <span className="text-slate-100">kapılar</span> (katil 5 vuruşta
              kırar), Engineer&apos;in kullandığı <span className="text-slate-100">ventler</span> ve
              etrafında oyalayabileceğin demir parmaklıklı{' '}
              <span className="text-slate-100">kafesler</span> bulunur.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
