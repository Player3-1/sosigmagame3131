import type { KillerId, SurvivorClassId } from './types.ts';

export const MATCH_DURATION_SECONDS = 180; // 3 dakika
export const DOWN_TIME_BONUS_SECONDS = 15; // Katil birini yere düşürünce +15sn
export const KILL_TIME_BONUS_SECONDS = 30; // Biri ölünce +30sn
export const SURVIVOR_MAX_STAMINA = 100;
export const KILLER_MAX_STAMINA = 120;
export const SURVIVOR_SPRINT_BONUS = 5;
export const KILLER_SPRINT_BONUS = 6;
export const SURVIVOR_STAMINA_DRAIN_RATE = 24; // saniyede 24 stamina harcar
export const KILLER_STAMINA_DRAIN_RATE = 20; // saniyede 20 stamina harcar (24'ten 20'ye düşürüldü)
export const SPEED_TO_PX = 16; // 1 hız birimi = 16 px/sn
export const METER_TO_PX = 40; // 1 metre = 40 px (17m = 680px)
export const DOWNED_HP = 100;
export const DOWNED_BLEEDOUT_RATE = 5; // Her saniye 5 azalır
export const DOWNED_SPEED_MULT = 0.5; // %50 hız (%50 yavaşlama)
export const DOWNED_CRITICAL_SPEED_MULT = 0.2; // 1 cana inince %80 yavaşlama (%20 hız)
export const DOWNED_BLEEDOUT_SECONDS = 25;
export const MAX_DOWNS_BEFORE_DEATH = 3;
export const REVIVE_DURATION_SECONDS = 3;
export const TRAP_ESCAPE_DURATION_SECONDS = 1.5;
export const DOOR_MAX_LOCK_HITS = 3;
export const KILLER_HIT_RECOVERY_SECONDS = 0.9;
export const JUMPER_HIT_RECOVERY_SECONDS = 1.3;
export const JUGGERNAUT_HIT_RECOVERY_SECONDS = 1.1;
export const SMILE_HIT_RECOVERY_SECONDS = 1.2;
export const HUNGRY_HIT_RECOVERY_SECONDS = 1.4;
export const SMILE_DARK_ZONE_RADIUS = 160;
export const SMILE_MINION_SPEED = 13;
export const KILLER_HIT_RECOVERY_SLOW = 0.5;
export const STAMINA_EXHAUST_RECOVER = 30;

export interface AbilitySpec {
  key: 'Q' | 'E' | 'R' | 'CTRL';
  name: string;
  cooldown: number;
  description: string;
}

export interface SurvivorClassSpec {
  id: SurvivorClassId;
  name: string;
  emoji: string;
  hp: number;
  speed: number;
  maxStamina?: number;
  accentColor: string;
  roleTag: string;
  abilities: AbilitySpec[];
}

export interface KillerSpec {
  id: KillerId;
  name: string;
  title: string;
  damage: number;
  speed: number;
  accentColor: string;
  passive?: string;
  abilities: AbilitySpec[];
}

export const PROTECTOR_STAFF_RANGE = 320;
export const PROTECTOR_SHIELD_AMOUNT = 60;
export const PROTECTOR_SHIELD_DECAY_PER_SEC = 2;
export const PROTECTOR_PROTECT_SECONDS = 3.0;
export const CHAPLAIN_SANCTUARY_SECONDS = 4.0;
export const CHAPLAIN_SANCTUARY_RADIUS = 115;
export const CHAPLAIN_BLESS_RANGE = 175;

export const SURVIVOR_CLASSES: Record<SurvivorClassId, SurvivorClassSpec> = {
  doctor: {
    id: 'doctor',
    name: 'Doctor',
    emoji: '➕',
    hp: 90,
    speed: 15,
    accentColor: '#10b981',
    roleTag: 'Şifacı',
    abilities: [
      {
        key: 'Q',
        name: 'İyileştirme Halesi',
        cooldown: 18,
        description: 'Etrafındaki herkese 7 saniye boyunca saniyede 10 can verir.',
      },
      {
        key: 'E',
        name: 'Sargı Sarma',
        cooldown: 28,
        description: 'Yakındaki yaralı arkadaşının yanında 4 saniyede sargı sararak canını fuller.',
      },
    ],
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    emoji: '🪛',
    hp: 100,
    speed: 15,
    accentColor: '#f59e0b',
    roleTag: 'Teknisyen',
    abilities: [
      {
        key: 'Q',
        name: 'Vent Geçişi',
        cooldown: 27,
        description: 'Yakındaki havalandırmaya girip en yakın diğer havalandırmadan çıkar.',
      },
      {
        key: 'E',
        name: 'Kapı Kilitleme',
        cooldown: 20,
        description: 'Yakındaki kapıyı 3.5 sn içinde kilitler. Katilin kırması için 3 vuruş gerekir.',
      },
    ],
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    emoji: '💥',
    hp: 110,
    speed: 15,
    accentColor: '#ef4444',
    roleTag: 'Dövüşçü',
    abilities: [
      {
        key: 'Q',
        name: 'Sersemleten Yumruk',
        cooldown: 10,
        description: 'E dodgesi yedirdiğinde yük kazanır (10 sn dolum). Katile isabet ederse 2 sn sersemletir; kullanım sonrası 1 sn %25 yavaşlatır.',
      },
      {
        key: 'E',
        name: 'Dodge Duruşu',
        cooldown: 22,
        description: '1.5 sn dodge moduna geçer. Katil vurmaya çalışıp vuramazsa hasar almaz, katili 1 sn sersemletip ardından 1 sn %50 yavaşlatır, +20 can ve +1 Q yükü kazanır.',
      },
    ],
  },
  trapper: {
    id: 'trapper',
    name: 'Trapper',
    emoji: '🪤',
    hp: 80,
    speed: 14,
    accentColor: '#a855f7',
    roleTag: 'Tuzakçı',
    abilities: [
      {
        key: 'Q',
        name: 'Kapan Tuzağı',
        cooldown: 17,
        description: 'Katilin göremediği tuzak kurar. Katil yakalanırsa F tuşuna 1.5 sn basılı tutarak çıkar.',
      },
      {
        key: 'E',
        name: 'Ağır Yavaşlatma Tuzağı',
        cooldown: 30,
        description: 'Katilin göremediği tuzak kurar. Basarsa 7 sn boyunca %37 yavaşlar.',
      },
    ],
  },
  runner: {
    id: 'runner',
    name: 'Runner',
    emoji: '🏃‍♂️',
    hp: 100,
    speed: 17,
    accentColor: '#06b6d4',
    roleTag: 'Koşucu',
    abilities: [
      {
        key: 'Q',
        name: 'Adrenalin Koşusu',
        cooldown: 14,
        description: '4 saniyeliğine hızını ekstra +4 artırır.',
      },
      {
        key: 'E',
        name: 'Kontrolsüz Rush',
        cooldown: 25,
        description: 'Duvara toslayana kadar düz atılır (dönüş yok).',
      },
    ],
  },
  builder: {
    id: 'builder',
    name: 'Builder',
    emoji: '🔨',
    hp: 90,
    speed: 14,
    accentColor: '#f97316',
    roleTag: 'İnşaatçı',
    abilities: [
      {
        key: 'Q',
        name: 'Kapı İnşa / Güçlendir',
        cooldown: 9,
        description:
          'Boş alanda büyük kitli kapı (3 can) inşa eder. Kırık kapıyı 4 sn içinde kitli (3 can) yeniden yapar; kitli kapıyı 3 sn içinde 5 cana güçlendirir.',
      },
      {
        key: 'E',
        name: 'Otomatik Taret',
        cooldown: 17,
        description: 'Katile ateş edip %50 yavaşlatan taret kurar. Tek vuruşta kırılır.',
      },
    ],
  },
  protector: {
    id: 'protector',
    name: 'Protector',
    emoji: '🪽',
    hp: 90,
    speed: 15,
    maxStamina: 110,
    accentColor: '#facc15',
    roleTag: 'Koruyucu',
    abilities: [
      {
        key: 'Q',
        name: 'Kalkan Büyüsü',
        cooldown: 15,
        description:
          'Elindeki asadan kalkan büyüsü fırlatır. İsabet ettiği takım arkadaşına +60 ekstra kalkan canı verir (saniyede 2 azalır).',
      },
      {
        key: 'E',
        name: 'Koruma Büyüsü',
        cooldown: 20,
        description:
          'Elindeki asadan koruma büyüsü fırlatır. İsabet ettiği takım arkadaşı 3 saniye boyunca hasar almaz olur.',
      },
    ],
  },
  bomber: {
    id: 'bomber',
    name: 'Bomber',
    emoji: '🧨',
    hp: 80,
    speed: 16,
    accentColor: '#f97316',
    roleTag: 'Bombacı',
    abilities: [
      {
        key: 'Q',
        name: 'Bomba Atışı',
        cooldown: 16,
        description:
          'İleriye doğru bir bomba fırlatır; bomba katile çarparsa patlar ve katili 2 saniye %60 yavaşlatır.',
      },
      {
        key: 'E',
        name: 'Gizli Bomba',
        cooldown: 37,
        description:
          'Yere katil tarafından görünmez bir bomba koyar. Katil değerse patlar ve katil 4 saniye %50 yavaşlar.',
      },
    ],
  },
  chaplain: {
    id: 'chaplain',
    name: 'Chaplain',
    emoji: '✝️',
    hp: 90,
    speed: 15,
    accentColor: '#fde047',
    roleTag: 'Rahip',
    abilities: [
      {
        key: 'Q',
        name: 'Kutsal Çember',
        cooldown: 24,
        description:
          '4 saniye boyunca elinde haç tutar ve etrafında bir alan oluşturur. Katiller bu alana giremezler.',
      },
      {
        key: 'E',
        name: 'Kutsama (Blessing)',
        cooldown: 18,
        description:
          'Yanındaki kişiye blessing verir; katilin yapacağı ilk vuruş hasar vermez. Sarı gözükür ve blessing varken tekrar basılamaz.',
      },
    ],
  },
};

export const KILLERS: Record<KillerId, KillerSpec> = {
  jumper: {
    id: 'jumper',
    name: 'Jumper',
    title: 'Gece Sıçrayıcısı',
    damage: 20,
    speed: 15,
    accentColor: '#f59e0b',
    abilities: [
      {
        key: 'Q',
        name: 'Ölümcül Sıçrayış',
        cooldown: 10,
        description: 'Öne zıplar: yakalarsa 37 hasar verir, ıskalarsa 3 sn %40 yavaşlar.',
      },
      {
        key: 'E',
        name: 'Beşli Sıçrayış',
        cooldown: 18,
        description: 'Ard arda alan hasarı veren 5 zıplama yapar (her biri 25 hasar).',
      },
      {
        key: 'R',
        name: 'Yıkıcı İniş',
        cooldown: 17,
        description: 'Yukarı zıplayıp alana iner: yakalananlara 45 hasar verir.',
      },
    ],
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    title: 'Zırhlı Dev',
    damage: 21,
    speed: 14,
    accentColor: '#dc2626',
    abilities: [
      {
        key: 'Q',
        name: 'Ezici Dash',
        cooldown: 15,
        description: 'Öne doğru uzun dash atarak vurur; isabet ederse 30 hasar verir.',
      },
      {
        key: 'E',
        name: 'Zincir Kol',
        cooldown: 20,
        description: 'Baktığın yöne uzun menzilli kol fırlatır: 15 hasar, 1 sn %50 yavaşlatma ve insanı kendine çeker. Kullanımdan sonra toparlanır.',
      },
      {
        key: 'R',
        name: 'Gölge Zırh',
        cooldown: 36,
        description: '3 sn görünmez olur ve +%50 hız kazanır (görünmezken staminası %30 daha hızlı tükenir). Vurduğunda görünmezliği bozulur ve 30 hasar verir.',
      },
    ],
  },
  smile: {
    id: 'smile',
    name: 'Smile',
    title: 'Karanlık Tebessüm',
    damage: 20,
    speed: 16,
    accentColor: '#e11d48',
    abilities: [
      {
        key: 'Q',
        name: 'Karanlık Körlük',
        cooldown: 15,
        description: 'En yakındaki hayatta kalanı 3 saniyeliğine %75 karartı ile kör eder.',
      },
      {
        key: 'E',
        name: 'Kara Alan',
        cooldown: 16,
        description: 'Etrafında siyah alan oluşturur; giren herkes saniyede 10 hasar alır ve %25 yavaşlar.',
      },
      {
        key: 'R',
        name: 'Gülücük Ordusu',
        cooldown: 20,
        description: '14 sn hayatta kalanları kovalayan 2 küçük gülücük adam spawnlar (17 hasar, hız 13).',
      },
    ],
  },
  hungry: {
    id: 'hungry',
    name: 'Hungry',
    title: 'Doymaz Kasap',
    damage: 27,
    speed: 14,
    accentColor: '#b91c1c',
    abilities: [
      {
        key: 'Q',
        name: 'Mutfak Bıçağı',
        cooldown: 10,
        description: 'Öne doğru mutfak bıçağı fırlatır; isabet ederse 44.5 hasar verir.',
      },
      {
        key: 'E',
        name: 'Yıkıcı Satır',
        cooldown: 18,
        description: 'Büyük vuruş: duvarı deler, venti bozar, kapıyı/barikatı/tuzağı kırar, insana 75 hasar verir.',
      },
      {
        key: 'R',
        name: 'Kızıl Öfke',
        cooldown: 17,
        description: '4 saniyeliğine kıpkırmızı olur, hızı +3 artar ve staminası %50 daha yavaş tükenir.',
      },
    ],
  },
  sawblooder: {
    id: 'sawblooder',
    name: 'Sawblooder',
    title: 'Kabusa Dönüşen Testere',
    damage: 20,
    speed: 15,
    accentColor: '#dc2626',
    passive: 'Basılı tutarak sürekli çalışan testereyle 20 hasar verir (0.5sn arayla). Her 11 sn arıza yapar; F (1sn) ile tamir edilirken %50 yavaşlar.',
    abilities: [
      {
        key: 'Q',
        name: 'Vahşi Atılım',
        cooldown: 11,
        description: 'Öne doğru testereyle çarpana kadar hızlı atılım yapar; denk gelene 80 hasar verir, tutmazsa 2 sn %50 yavaşlar.',
      },
      {
        key: 'E',
        name: 'Testere Hücumu',
        cooldown: 20,
        description: 'Mouse kontrolüyle hızlanarak bir yere ya da birine çarpana kadar sürer; çarpılan kişiye 60 hasar verir, tutmazsa 2 sn saplanır.',
      },
      {
        key: 'R',
        name: 'Kanlı Katliam',
        cooldown: 14,
        description: '4 saniyeliğine hızı +4 artar; her vuruş yaptığında süresi +2 saniye uzar.',
      },
    ],
  },
  darkness: {
    id: 'darkness',
    name: 'Darkness',
    title: 'Gölge Biçici',
    damage: 25,
    speed: 15,
    accentColor: '#7c3aed',
    abilities: [
      {
        key: 'Q',
        name: 'Gölge Venti',
        cooldown: 12,
        description: 'Yakındaki sağlam havalandırmadan haritadaki istediğin başka bir havalandırmaya seçerek ışınlanırsın.',
      },
      {
        key: 'E',
        name: 'Karanlık Atılım',
        cooldown: 16,
        description: 'Öne doğru duvarların içinden geçebilen dash atar ve 4 saniye %95 şeffaf olur.',
      },
      {
        key: 'R',
        name: 'Karanlık Mod',
        cooldown: 22,
        description: '3 saniyeliğine karanlık moda geçer: hızı %30 artar ve nesnelerin içinden geçebilir.',
      },
    ],
  },
};

export const SURVIVOR_CLASS_LIST = Object.values(SURVIVOR_CLASSES);
export const KILLER_LIST = Object.values(KILLERS);

export const SURVIVOR_PRICES: Record<SurvivorClassId, number> = {
  doctor: 0,
  runner: 0,
  builder: 0,
  protector: 90,
  fighter: 100,
  trapper: 100,
  bomber: 110,
  engineer: 125,
  chaplain: 170,
};

export const KILLER_PRICES: Record<KillerId, number> = {
  juggernaut: 0,
  smile: 0,
  jumper: 200,
  hungry: 250,
  darkness: 250,
  sawblooder: 300,
};

export const DEFAULT_UNLOCKED_CLASSES: SurvivorClassId[] = ['doctor', 'runner', 'builder'];
export const DEFAULT_UNLOCKED_KILLERS: KillerId[] = ['juggernaut', 'smile'];
