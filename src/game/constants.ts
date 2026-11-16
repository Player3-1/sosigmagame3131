import type { KillerId, SurvivorClassId } from './types.ts';

export const MATCH_DURATION_SECONDS = 180; // 3 dakika
export const SURVIVOR_MAX_STAMINA = 100;
export const KILLER_MAX_STAMINA = 120;
export const SURVIVOR_SPRINT_BONUS = 5;
export const KILLER_SPRINT_BONUS = 6;
export const SPEED_TO_PX = 16; // 1 hız birimi = 16 px/sn
export const METER_TO_PX = 40; // 1 metre = 40 px (17m = 680px)
export const DOWNED_HP = 100;
export const DOWNED_BLEEDOUT_RATE = 5; // Her saniye 5 azalır
export const DOWNED_SPEED_MULT = 0.5; // %50 hız (%50 yavaşlama)
export const DOWNED_CRITICAL_SPEED_MULT = 0.2; // 1 cana inince %80 yavaşlama (%20 hız)
export const DOWNED_BLEEDOUT_SECONDS = 25;
export const MAX_DOWNS_BEFORE_DEATH = 3;
export const REVIVE_DURATION_SECONDS = 5;
export const DOOR_MAX_LOCK_HITS = 3;
export const KILLER_HIT_RECOVERY_SECONDS = 0.9;
export const SMILE_HIT_RECOVERY_SECONDS = 1.4;
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
        cooldown: 44,
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
        cooldown: 27,
        description: 'E dodgesi yedirdiğinde yük kazanır (27 sn dolum). Katile isabet ederse 2 sn sersemletir.',
      },
      {
        key: 'E',
        name: 'Dodge Duruşu',
        cooldown: 22,
        description: '1.5 sn dodge moduna geçer. Katil vurmaya çalışıp vuramazsa hasar almaz, katili 1 sn sersemletir, +10 can ve +1 Q yükü kazanır.',
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
        description: 'Katilin göremediği tuzak kurar. Katil yakalanırsa F tuşuna 3 sn basılı tutarak çıkar.',
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
        description: 'Duvara toslayana kadar düz atılır (dönüş yok). Çarpınca 1 sn %50 yavaşlar.',
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
        name: 'Barikat Kur',
        cooldown: 9,
        description: 'Kimsenin içinden geçemediği barikat koyar (iç içe konulamaz). Katilin kırması 4 saniye sürer.',
      },
      {
        key: 'E',
        name: 'Otomatik Taret',
        cooldown: 29,
        description: 'Katile ateş edip %50 yavaşlatan taret kurar. Tek vuruşta kırılır.',
      },
    ],
  },
};

export const KILLERS: Record<KillerId, KillerSpec> = {
  jumper: {
    id: 'jumper',
    name: 'Jumper',
    title: 'Gece Sıçrayıcısı',
    damage: 23.5,
    speed: 16,
    accentColor: '#f59e0b',
    abilities: [
      {
        key: 'Q',
        name: 'Ölümcül Sıçrayış',
        cooldown: 10,
        description: 'Öne zıplar: yakalarsa 57 hasar verir, ıskalarsa 3 sn %40 yavaşlar.',
      },
      {
        key: 'E',
        name: 'Beşli Sıçrayış',
        cooldown: 11,
        description: 'Ard arda alan hasarı veren 5 zıplama yapar (her biri 25 hasar); yakalananları 1.5 sn %20 yavaşlatır.',
      },
      {
        key: 'R',
        name: 'Yıkıcı İniş',
        cooldown: 14,
        description: 'Yukarı zıplayıp alana iner: yakalananlara 70 hasar ve 3 sn %33 yavaşlatma.',
      },
    ],
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    title: 'Zırhlı Dev',
    damage: 34,
    speed: 15,
    accentColor: '#dc2626',
    abilities: [
      {
        key: 'Q',
        name: 'Ezici Dash',
        cooldown: 7,
        description: 'Öne doğru dash atarak vurur; isabet ederse 40 hasar verir.',
      },
      {
        key: 'E',
        name: 'Zincir Kol',
        cooldown: 12,
        description: 'Baktığın yöne kol fırlatır: 15 hasar, 2 sn %25 yavaşlatma ve insanı kendine çeker.',
      },
      {
        key: 'R',
        name: 'Gölge Zırh',
        cooldown: 13,
        description: '4 sn görünmez olur. Görünmezken vurursa 12 hasar verir.',
      },
    ],
  },
  smile: {
    id: 'smile',
    name: 'Smile',
    title: 'Karanlık Tebessüm',
    damage: 23.5,
    speed: 16,
    accentColor: '#e11d48',
    abilities: [
      {
        key: 'Q',
        name: 'Karanlık Körlük',
        cooldown: 15,
        description: 'En yakındaki hayatta kalanı 4 saniyeliğine %75 karartı ile kör eder.',
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
        description: '9 sn hayatta kalanları kovalayan 2 küçük gülücük adam spawnlar (17 hasar, hız 13).',
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
    passive: 'Hasar verdiğinde 3 saniyeliğine hızı +4 artar.',
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
        description: 'Büyük vuruş: duvarı deler, venti bozar, kapıyı/barikatı/tuzağı kırar, insana 50 hasar verir.',
      },
      {
        key: 'R',
        name: 'Kızıl Öfke',
        cooldown: 17,
        description: '4 saniyeliğine kıpkırmızı olur ve hızı +3 artar.',
      },
    ],
  },
};

export const SURVIVOR_CLASS_LIST = Object.values(SURVIVOR_CLASSES);
export const KILLER_LIST = Object.values(KILLERS);
