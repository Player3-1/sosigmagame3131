import type { KillerId, SurvivorClassId } from './types.ts';

export const MATCH_DURATION_SECONDS = 180; // 3 dakika
export const LAST_SURVIVOR_TIME_SECONDS = 75; // Son 1 kişi kalınca süre 1dk 15sn'ye düşer
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
export const CARRY_PICKUP_RANGE = 76;
export const CARRY_SPEED_MULT = 0.9; // Sırtında taşırken %10 yavaşlama
export const TRAP_ESCAPE_DURATION_SECONDS = 1.5;
export const DOOR_MAX_LOCK_HITS = 3;
export const KILLER_HIT_RECOVERY_SECONDS = 0.75;
export const JUMPER_HIT_RECOVERY_SECONDS = 1.05;
export const JUGGERNAUT_HIT_RECOVERY_SECONDS = 0.9;
export const SMILE_HIT_RECOVERY_SECONDS = 0.95;
export const HUNGRY_HIT_RECOVERY_SECONDS = 1.05;
export const HUNTER_HIT_RECOVERY_SECONDS = 1.0;
export const HUNTER_SCYTHE_DAMAGE = 30;
export const HUNTER_SCYTHE_SLOW = 0.25;
export const HUNTER_SCYTHE_SLOW_SECONDS = 3.0;
export const HUNTER_SEAL_ALERT_SECONDS = 7.0;
export const HUNTER_SHOTGUN_RECOVER_SECONDS = 2.0;
export const SMILE_DARK_ZONE_RADIUS = 160;
export const SMILE_MINION_SPEED = 15.5;
export const KILLER_HIT_RECOVERY_SLOW = 0.5;
export const STAMINA_EXHAUST_RECOVER = 30;

export const CHEST_COUNT = 4;
export const CHEST_LOOT_SECONDS = 5.0;
export const CHEST_REFRESH_SECONDS = 120;
export const ITEM_MEDKIT_USE_SECONDS = 1.5;
export const ITEM_MEDKIT_INSTANT_HEAL = 20;
export const ITEM_MEDKIT_REGEN_PER_SEC = 3;
export const ITEM_MEDKIT_REGEN_SECONDS = 10;
export const ITEM_FLASH_RANGE = 290;
export const ITEM_FLASH_HALF_ANGLE = 0.56;
export const ITEM_FLASH_BLIND_SECONDS = 2.0;
export const ITEM_COFFEE_DRINK_SECONDS = 1.5;
export const ITEM_COFFEE_DRINK_SLOW = 0.5;
export const ITEM_COFFEE_BUFF_SECONDS = 10;
export const ITEM_COFFEE_SPEED_MULT = 1.2;
export const ITEM_COFFEE_STAMINA_MULT = 0.8;
export const ITEM_SHIELD_HITS = 2;

export const INVENTORY_ITEM_META = {
  medkit: {
    emoji: '❤️',
    name: 'Sağlık Kiti',
    shortDesc: '1.5sn sabit kullanım · +20 anında + 10sn (+3/sn)',
    accent: '#ef4444',
  },
  flashlight: {
    emoji: '🔦',
    name: 'Flash',
    shortDesc: '1 atış · Alandaki herkesi (katil dahil) 2sn kör eder',
    accent: '#f8fafc',
  },
  coffee: {
    emoji: '☕',
    name: 'Kahve',
    shortDesc: '1.5sn (%50 yavaş) · 10sn +%20 hız & -%20 stamina',
    accent: '#d97706',
  },
  shield: {
    emoji: '🛡️',
    name: 'Kalkan',
    shortDesc: 'Elde tutulurken hasar engeller (2 vuruşta kırılır)',
    accent: '#38bdf8',
  },
} as const;

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
  passive?: string;
  abilities: AbilitySpec[];
}

export interface KillerSpec {
  id: KillerId;
  name: string;
  title: string;
  damage: number;
  speed: number;
  attackCooldownDesc: string;
  accentColor: string;
  passive?: string;
  abilities: AbilitySpec[];
}

export const PROTECTOR_STAFF_RANGE = 320;
export const PROTECTOR_SHIELD_AMOUNT = 60;
export const PROTECTOR_SHIELD_DECAY_PER_SEC = 2;
export const PROTECTOR_PROTECT_SECONDS = 3.0;
export const CHAPLAIN_BLESS_SECONDS = 20.0;
export const FARMER_MAX_STAMINA = 110;
export const FARMER_CROP_GROW_SECONDS = 30;
export const FARMER_CROP_HEAL = 35;
export const FARMER_CROP_RESIST_SECONDS = 4.0;
export const FARMER_CROP_RESIST_AMOUNT = 0.25;
export const FARMER_CROP_POISON_DAMAGE = 15;
export const FARMER_SCYTHE_RANGE = 82;
export const FARMER_SCYTHE_MAX_LEVEL = 9;
export const CHAPLAIN_BLESS_RANGE = 250;
export const CHAPLAIN_KNIFE_RANGE = 78;
export const FIGHTER_Q_RADIUS = 104;
export const SHADOW_INVIS_SECONDS = 3.0;
export const SHADOW_INVIS_STAMINA_REGEN_MULT = 1.2;
export const SHADOW_DASH_DURATION = 0.25;
export const SHADOW_DASH_SPEED = 29;

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
        cooldown: 25,
        description: '5 saniye boyunca yakınındaki ayaktaki insanlara saniyede +7 can verir.',
      },
      {
        key: 'E',
        name: 'Sargı Sarma',
        cooldown: 28,
        description: 'Yakındaki yaralı veya yerdeki arkadaşının yanına gidip 4 saniyede sargı sararak canını fuller.',
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
        description: 'Yakındaki kapıyı 3 sn içinde kilitler (3 can). Katilin kırması için 3 vuruş gerekir.',
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
        description: 'E dodgesi yedirdiğinde yük kazanır (10 sn bekleme). Katile isabet ederse 2 sn sersemletir; kullanım sonrası kendin 1 sn %25 yavaşlarsın.',
      },
      {
        key: 'E',
        name: 'Dodge Duruşu',
        cooldown: 22,
        description: '1.5 sn dodge moduna geçer. Katil vurmaya çalışırsa +1 Q yükü kazanır; darbe isabet ederse hasar almaz ve katili 1 sn sersemletip ardından 1 sn %50 yavaşlatır.',
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
    passive: 'Smile\'ın kurduğu gizli mayınları sadece Trapper görebilir.',
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
        description: 'Katilin göremediği tuzak kurar. Basarsa 4 sn boyunca %37 yavaşlar.',
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
        description: 'En fazla 5 sn veya duvara toslayana kadar +14 hızla düz atılır (dönüş yok).',
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
        name: 'Kapı İnşa',
        cooldown: 14,
        description: 'Boş alanda büyük kitli kapı (3 can) inşa eder.',
      },
      {
        key: 'E',
        name: 'Otomatik Taret',
        cooldown: 17,
        description: 'Katile 1.25 sn arayla ateş edip 2.2 sn %50 yavaşlatan taret kurar. Tek vuruşta kırılır.',
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
        cooldown: 24,
        description:
          'Duvarların içinden geçebilen ve yakındaki en yakın kişiye (kimse yoksa kendine) otomatik giden kalkan büyüsü fırlatır; +60 ekstra kalkan canı verir (saniyede 2 azalır).',
      },
      {
        key: 'E',
        name: 'Koruma Büyüsü',
        cooldown: 22,
        description:
          'Duvarların içinden geçebilen ve yakındaki en yakın kişiye (kimse yoksa kendine) otomatik giden koruma büyüsü fırlatır; 3 saniye boyunca hasar almaz kılar.',
      },
    ],
  },
  bomber: {
    id: 'bomber',
    name: 'Bomber',
    emoji: '🧨',
    hp: 80,
    speed: 15,
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
    hp: 100,
    speed: 15,
    accentColor: '#fde047',
    roleTag: 'Rahip',
    abilities: [
      {
        key: 'Q',
        name: 'Kutsama (Blessing)',
        cooldown: 13,
        description:
          'Yakınındaki en yakın takım arkadaşına 20 sn kutsama verir (kendine basılamaz): bozulmadığı sürece canı saniyede +2 artar ve ilk hasardan korunur. Yerdeki birine basılırsa %20 ihtimalle %40 canla ayağa kalkar. Her kutsamada +1 Çakı (E) hakkı kazandırır.',
      },
      {
        key: 'E',
        name: 'Çakı Vuruşu',
        cooldown: 11,
        description:
          'Her Kutsama (Q) sonrası 1 çakı hakkı kazanılır. Katile savrulur; isabet ederse katili 1 saniye sersemletir.',
      },
    ],
  },
  farmer: {
    id: 'farmer',
    name: 'Farmer',
    emoji: '👨‍🌾',
    hp: 90,
    speed: 14,
    maxStamina: FARMER_MAX_STAMINA,
    accentColor: '#84cc16',
    roleTag: 'Çiftçi',
    abilities: [
      {
        key: 'Q',
        name: 'Hasat Dik',
        cooldown: 25,
        description:
          '30 saniyede büyüyen ve katilin kıramadığı bir hasat diker. Büyüyünce F ile yenirse anında +35 can ve 4 sn %25 dayanıklılık verir (Hunter mühürlerse zehirli olur: -15 can!).',
      },
      {
        key: 'E',
        name: 'Tırpan Darbesi',
        cooldown: 15,
        description:
          'Katile tırpanla vurur; her isabette leveli artar (1-9). Lv1-2: 1sn %25 yavaşlık · Lv3: 1sn dondurur · Lv4-5: 1.5sn dondurur + 1sn %25 yavaşlatır · Lv6-8: 2sn dondurur · Lv9: 2.5sn stun + 3sn %30 yavaşlatır.',
      },
    ],
  },
  shadow: {
    id: 'shadow',
    name: 'Shadow',
    emoji: '🌑',
    hp: 90,
    speed: 15,
    accentColor: '#8b5cf6',
    roleTag: 'Gölge',
    abilities: [
      {
        key: 'Q',
        name: 'Gölge Görünmezlik',
        cooldown: 15,
        description: '3 saniye görünmez olur. Görünmezken staminası %20 daha hızlı dolar.',
      },
      {
        key: 'E',
        name: 'Gölge Dash',
        cooldown: 25,
        description: 'Kısa bir dash atar ve dash sırasında eşyaların içinden geçebilir.',
      },
    ],
  },
};

export const KILLERS: Record<KillerId, KillerSpec> = {
  jumper: {
    id: 'jumper',
    name: 'Jumper',
    title: 'Gece Sıçrayıcısı',
    damage: 36,
    speed: 16.5,
    attackCooldownDesc: '0.8 sn (İsabette 1.05 sn + %50 yavaşlama)',
    accentColor: '#f59e0b',
    abilities: [
      {
        key: 'Q',
        name: 'Ölümcül Sıçrayış',
        cooldown: 7,
        description: 'Öne zıplar: yakalarsa 80 hasar verir, ıskalarsa 1.5 sn %25 yavaşlar.',
      },
      {
        key: 'E',
        name: 'Beşli Sıçrayış',
        cooldown: 12,
        description: 'Ard arda alan hasarı veren 5 zıplama yapar (1. sıçrama 35, 2. 30, 3. 28, 4. ve 5. 25 hasar).',
      },
      {
        key: 'R',
        name: 'Yıkıcı İniş',
        cooldown: 12,
        description: 'Yukarı zıplayıp geniş alana iner: yakalananlara 95 hasar verir.',
      },
    ],
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    title: 'Zırhlı Dev',
    damage: 48,
    speed: 16,
    attackCooldownDesc: '0.8 sn (İsabette 0.9 sn + %50 yavaşlama)',
    accentColor: '#dc2626',
    abilities: [
      {
        key: 'Q',
        name: 'Ezici Dash',
        cooldown: 10,
        description: 'Öne doğru çok hızlı dash atarak vurur; isabet ederse 55 hasar verir.',
      },
      {
        key: 'E',
        name: 'Zincir Kol',
        cooldown: 13,
        description: 'Baktığın yöne uzun menzilli kol fırlatır: 32 hasar, 1.5 sn %50 yavaşlatma ve insanı kendine çeker.',
      },
      {
        key: 'R',
        name: 'Gölge Zırh',
        cooldown: 22,
        description: '4.5 sn görünmez olur ve +%50 hız kazanır. İlk vuruşu en az 55 hasar verir!',
      },
    ],
  },
  smile: {
    id: 'smile',
    name: 'Smile',
    title: 'Karanlık Tebessüm',
    damage: 36,
    speed: 17.5,
    attackCooldownDesc: '0.8 sn (İsabette 0.95 sn + %50 yavaşlama)',
    accentColor: '#e11d48',
    abilities: [
      {
        key: 'Q',
        name: 'Karanlık Top',
        cooldown: 9,
        description: 'Baktığın yöne hızlı bir top fırlatır; çarpınca veya menzil sonunda geniş alana 50 hasar verir.',
      },
      {
        key: 'E',
        name: 'Karanlık Mayın',
        cooldown: 12,
        description: 'Yere sadece Trapper\'ın görebildiği bir mayın kurar. Değen kişi 2.5 sn %45 yavaşlar ve 60 hasar alır.',
      },
      {
        key: 'R',
        name: 'Gülücük Ordusu',
        cooldown: 14,
        description: '13 sn hayatta kalanları kovalayan 2 küçük gülücük adam spawnlar (26 hasar, hız 15.5).',
      },
    ],
  },
  hungry: {
    id: 'hungry',
    name: 'Hungry',
    title: 'Doymaz Kasap',
    damage: 50,
    speed: 16,
    attackCooldownDesc: '0.8 sn (İsabette 1.05 sn + %50 yavaşlama)',
    accentColor: '#b91c1c',
    abilities: [
      {
        key: 'Q',
        name: 'Mutfak Bıçağı',
        cooldown: 6,
        description: 'Öne doğru çok hızlı mutfak bıçağı fırlatır; isabet ederse 60 hasar verir.',
      },
      {
        key: 'E',
        name: 'Yıkıcı Satır',
        cooldown: 11,
        description: 'Dev vuruş: duvarı deler, venti bozar, barikatı/tuzağı kırar, kapılara 7 hasar verir, insana 95 hasar verir.',
      },
      {
        key: 'R',
        name: 'Kızıl Öfke',
        cooldown: 12,
        description: '6 saniyeliğine kıpkırmızı olur, hızı +5 artar ve staminası %50 daha yavaş tükenir.',
      },
    ],
  },
  sawblooder: {
    id: 'sawblooder',
    name: 'Sawblooder',
    title: 'Kabusa Dönüşen Testere',
    damage: 34,
    speed: 16.5,
    attackCooldownDesc: '0.45 sn (Basılı tutmalı testere, isabet yavaşlaması yok)',
    accentColor: '#dc2626',
    passive: 'Basılı tutarak sürekli çalışan testereyle 34 hasar verir (0.45sn arayla). Her 18 sn arıza yapar; F (0.8sn) ile tamir edilirken %50 yavaşlar.',
    abilities: [
      {
        key: 'Q',
        name: 'Vahşi Atılım',
        cooldown: 8,
        description: 'Öne doğru testereyle çarpana kadar çok hızlı atılım yapar; denk gelene 95 hasar verir, tutmazsa 1.2 sn %30 yavaşlar.',
      },
      {
        key: 'E',
        name: 'Testere Hücumu',
        cooldown: 13,
        description: 'Mouse kontrolüyle hızlanarak (16→30) çarpana kadar sürer; çarpılan kişiye 85 hasar verir (2 sn %20 yavaşlar), duvara çarparsa 1.3 sn saplanır.',
      },
      {
        key: 'R',
        name: 'Kanlı Katliam',
        cooldown: 10,
        description: '6 saniyeliğine hızı +6 artar; her vuruş yaptığında süresi +2.5 saniye uzar.',
      },
    ],
  },
  darkness: {
    id: 'darkness',
    name: 'Darkness',
    title: 'Gölge Biçici',
    damage: 45,
    speed: 16.5,
    attackCooldownDesc: '0.75 sn (İsabette 0.75 sn + %50 yavaşlama)',
    accentColor: '#7c3aed',
    abilities: [
      {
        key: 'Q',
        name: 'Gölge Venti',
        cooldown: 7,
        description: 'Yakındaki sağlam havalandırmadan haritadaki istediğin başka bir havalandırmaya seçerek ışınlanırsın.',
      },
      {
        key: 'E',
        name: 'Karanlık Atılım',
        cooldown: 10,
        description: 'Öne doğru duvarların içinden geçebilen hızlı dash atar ve 5.5 saniye %95 şeffaf olur.',
      },
      {
        key: 'R',
        name: 'Karanlık Mod',
        cooldown: 14,
        description: '5 saniyeliğine karanlık moda geçer: hızı %45 artar ve nesnelerin içinden geçebilir.',
      },
    ],
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    title: 'Kayıp Çiftçi',
    damage: 42,
    speed: 15,
    attackCooldownDesc: '0.8 sn (İsabette 1 sn + %50 yavaşlama)',
    accentColor: '#d97706',
    abilities: [
      {
        key: 'Q',
        name: 'Görünmez Tırpan',
        cooldown: 12,
        description: 'Yere insanların göremediği görünmez bir tırpan yerleştirir. Değen kişi 30 hasar alıp 3 sn %25 yavaşlar.',
      },
      {
        key: 'E',
        name: 'Mühürlü Tuzak',
        cooldown: 21,
        description: 'Yakındaki kapı, sandık veya venti mühürler. Bir insan etkileşime geçerse uyarı gider ve F ile direkt yanına ışınlanır.',
      },
      {
        key: 'R',
        name: 'Eski Pompalı',
        cooldown: 17,
        description: '1 mermili eski bir pompalı çıkarır (6 saçak: yakın 45, orta 30, uzak 15 hasar). Hareket ederken sapma artar, ateş sonrası 2 sn toparlanma animasyonu vardır.',
      },
    ],
  },
};

export const SURVIVOR_CLASS_LIST = Object.values(SURVIVOR_CLASSES);
export const KILLER_LIST = Object.values(KILLERS);

export const SURVIVOR_PRICES: Record<SurvivorClassId, number> = {
  doctor: 0,
  runner: 0,
  bomber: 0,
  protector: 540,
  fighter: 600,
  trapper: 600,
  engineer: 750,
  chaplain: 1020,
  farmer: 880,
  builder: 750,
  shadow: 300,
};

export const KILLER_PRICES: Record<KillerId, number> = {
  juggernaut: 0,
  smile: 0,
  jumper: 800,
  hunter: 950,
  hungry: 1000,
  darkness: 1000,
  sawblooder: 1200,
};

export const DEFAULT_UNLOCKED_CLASSES: SurvivorClassId[] = ['doctor', 'runner', 'bomber'];
export const DEFAULT_UNLOCKED_KILLERS: KillerId[] = ['juggernaut', 'smile'];
