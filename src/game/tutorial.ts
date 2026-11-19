import {
  KILLERS,
  KILLER_MAX_STAMINA,
  MATCH_DURATION_SECONDS,
  SURVIVOR_CLASSES,
  SURVIVOR_MAX_STAMINA,
} from './constants';
import { TILE_SIZE } from './map';
import { GameState, PlayerState, SurvivorClassId, TileType } from './types';

export type TutorialStepId = 1 | 2 | 3 | 4;

export interface TutorialStepSpec {
  id: TutorialStepId;
  title: string;
  subtitle: string;
  hint: string;
  controls: string[];
}

export const TUTORIAL_STEPS: TutorialStepSpec[] = [
  {
    id: 1,
    title: '1. Adım: Hareket & Koşu',
    subtitle: 'Tesiste hareket etmeyi ve Shift ile koşmayı öğren.',
    hint: 'W A S D tuşlarıyla sağdaki yeşil işaretli hedefe yürü ve giderken Shift tuşuna basılı tutarak koş.',
    controls: ['W A S D: Yürü', 'Fare: Bakış Yönü', 'Shift: Koş (100 Stamina)'],
  },
  {
    id: 2,
    title: '2. Adım: Sınıf Yetenekleri (Q & E)',
    subtitle: 'Hayatta kalan sınıfının Q ve E yeteneklerini test et.',
    hint: 'Eğitim katiline yaklaşıp Q (Sersemleten Yumruk) ile sersemlet ve E (Dodge Duruşu) yeteneğini aktifleştir.',
    controls: ['Q: Sersemleten Yumruk', 'E: Dodge Duruşu (1.5sn)'],
  },
  {
    id: 3,
    title: '3. Adım: Yere Düşen Arkadaşı Kurtar (F)',
    subtitle: 'Sarı 100 canla yere düşen arkadaşını 1 cana inmeden kurtar!',
    hint: 'Yerdeki Aylin’in yanına yaklaş ve F tuşuna 3 saniye basılı tutarak onu ayağa kaldır.',
    controls: ['F (Basılı Tut): 3 sn içinde kurtar'],
  },
  {
    id: 4,
    title: '4. Adım: Katil Mekanikleri (Vuruş & Q)',
    subtitle: 'Şimdi Juggernaut rolündesin! Taret ve kilitli kapıyı kır.',
    hint: 'Sol Tık veya Space ile turuncu tareti yok et ve Q (Ezici Dash) ile hedefe atıl.',
    controls: ['Sol Tık / Space: Normal Vuruş', 'Q: Ezici Dash (30 Hasar)'],
  },
];

export const TUTORIAL_LOCAL_ID = 'tut_player';

function makePlayer(base: Partial<PlayerState> & Pick<PlayerState, 'id' | 'name' | 'role' | 'x' | 'y'>): PlayerState {
  return {
    id: base.id,
    name: base.name,
    isBot: false,
    role: base.role,
    survivorClass: base.survivorClass,
    killerId: base.killerId,
    x: base.x,
    y: base.y,
    vx: 0,
    vy: 0,
    angle: base.angle ?? 0,
    radius: base.radius ?? (base.role === 'killer' ? 19 : 14),
    hp: base.hp ?? 100,
    maxHp: base.maxHp ?? 100,
    stamina: base.stamina ?? (base.role === 'killer' ? KILLER_MAX_STAMINA : SURVIVOR_MAX_STAMINA),
    maxStamina: base.maxStamina ?? (base.role === 'killer' ? KILLER_MAX_STAMINA : SURVIVOR_MAX_STAMINA),
    baseSpeed: base.baseSpeed ?? 15,
    downed: base.downed ?? false,
    downVulnerable: false,
    downCount: 0,
    dead: false,
    bleedoutTimer: base.bleedoutTimer ?? 0,
    downGraceTimer: 0,
    cdAttack: 0,
    cdQ: 0,
    cdE: 0,
    cdR: 0,
    hitRecoveryTimer: 0,
    stunTimer: 0,
    slowTimer: 0,
    slowAmount: 0,
    speedBoostTimer: 0,
    speedBoostAmount: 0,
    staminaExhausted: false,
    dodgeTimer: 0,
    fighterQCharges: base.fighterQCharges ?? 0,
    dodgeRewardedThisCast: false,
    invisibleTimer: 0,
    darkZoneTimer: 0,
    darkZoneTick: 0,
    blindTimer: 0,
    frenzyTimer: 0,
    healAuraTimer: 0,
    healAuraTick: 0,
    shieldHp: 0,
    protectedTimer: 0,
    protectorTargetId: null,
    trappedById: null,
    chainsawStuckTimer: 0,
    chainsawStuckAngle: 0,
    sawMalfunction: false,
    sawMalfunctionTimer: 0,
    dashTimer: 0,
    dashVx: 0,
    dashVy: 0,
    dashKind: 'none',
    dashHitIds: [],
    multiJumpRemaining: 0,
    multiJumpHitAny: false,
    airborneTimer: 0,
    airborneTargetX: 0,
    airborneTargetY: 0,
    channel: null,
    damageDealt: 0,
    rescues: 0,
    abilitiesUsed: 0,
  };
}

export function createTutorialGameState(
  step: TutorialStepId,
  playerName: string,
  preferredClass: SurvivorClassId
): GameState {
  const cols = 28;
  const rows = 18;
  const tiles: TileType[] = new Array(cols * rows).fill(0);

  // Outer perimeter concrete walls
  for (let c = 0; c < cols; c++) {
    tiles[c] = 1;
    tiles[(rows - 1) * cols + c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    tiles[r * cols] = 1;
    tiles[r * cols + (cols - 1)] = 1;
  }

  // Training divider wall with doorway + small iron bar cage
  for (let r = 2; r <= 7; r++) {
    tiles[r * cols + 14] = 1;
  }
  for (let c = 20; c <= 24; c++) {
    tiles[3 * cols + c] = 2;
    tiles[7 * cols + c] = 2;
  }
  tiles[4 * cols + 20] = 2;
  tiles[6 * cols + 20] = 2;
  tiles[4 * cols + 24] = 2;
  tiles[6 * cols + 24] = 2;

  const mapWidth = cols * TILE_SIZE;
  const mapHeight = rows * TILE_SIZE;

  const survSpec = SURVIVOR_CLASSES[preferredClass];
  const fighterSpec = SURVIVOR_CLASSES.fighter;
  const juggSpec = KILLERS.juggernaut;

  const players: PlayerState[] = [];
  const turrets: GameState['turrets'] = [];
  const doors: GameState['doors'] = [
    {
      id: 'tut_door',
      x: 14 * TILE_SIZE + 12,
      y: 9 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: step === 4,
      lockHits: 0,
      broken: false,
      open: step !== 4,
      label: 'Eğitim Kapısı',
    },
  ];

  if (step === 1) {
    players.push(
      makePlayer({
        id: TUTORIAL_LOCAL_ID,
        name: playerName || 'Oyuncu',
        role: 'survivor',
        survivorClass: preferredClass,
        x: 4.5 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        hp: survSpec.hp,
        maxHp: survSpec.hp,
        baseSpeed: survSpec.speed,
      })
    );
  } else if (step === 2) {
    players.push(
      makePlayer({
        id: TUTORIAL_LOCAL_ID,
        name: playerName || 'Oyuncu',
        role: 'survivor',
        survivorClass: 'fighter',
        x: 7 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        hp: fighterSpec.hp,
        maxHp: fighterSpec.hp,
        baseSpeed: fighterSpec.speed,
        fighterQCharges: 1,
      }),
      makePlayer({
        id: 'tut_killer_dummy',
        name: 'Eğitim Katili',
        role: 'killer',
        killerId: 'juggernaut',
        x: 13 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        angle: Math.PI,
        hp: 9999,
        maxHp: 9999,
        baseSpeed: juggSpec.speed,
      })
    );
  } else if (step === 3) {
    players.push(
      makePlayer({
        id: TUTORIAL_LOCAL_ID,
        name: playerName || 'Oyuncu',
        role: 'survivor',
        survivorClass: preferredClass,
        x: 6 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        hp: survSpec.hp,
        maxHp: survSpec.hp,
        baseSpeed: survSpec.speed,
      }),
      makePlayer({
        id: 'tut_downed_ally',
        name: 'Aylin',
        role: 'survivor',
        survivorClass: 'doctor',
        x: 12 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        hp: 100,
        maxHp: 90,
        baseSpeed: 15,
        downed: true,
        bleedoutTimer: 25,
      })
    );
  } else {
    // Step 4: Player plays as Killer Juggernaut
    players.push(
      makePlayer({
        id: TUTORIAL_LOCAL_ID,
        name: playerName || 'Oyuncu',
        role: 'killer',
        killerId: 'juggernaut',
        x: 6.5 * TILE_SIZE,
        y: 10.5 * TILE_SIZE,
        hp: 9999,
        maxHp: 9999,
        baseSpeed: juggSpec.speed,
      }),
      makePlayer({
        id: 'tut_surv_dummy',
        name: 'Eğitim Hedefi',
        role: 'survivor',
        survivorClass: 'runner',
        x: 19 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        angle: Math.PI,
        hp: 100,
        maxHp: 100,
        baseSpeed: 15,
      })
    );
    turrets.push({
      id: 'tut_turret',
      ownerId: 'tut_surv_dummy',
      x: 11.5 * TILE_SIZE,
      y: 10.5 * TILE_SIZE,
      angle: Math.PI,
      hp: 1,
      fireCooldown: 2.5,
    });
  }

  return {
    phase: 'playing',
    winner: null,
    winReason: '',
    timeRemaining: MATCH_DURATION_SECONDS,
    elapsed: 0,
    mapWidth,
    mapHeight,
    tileSize: TILE_SIZE,
    cols,
    rows,
    tiles,
    doors,
    vents: [
      { id: 'tut_v1', x: 5 * TILE_SIZE, y: 4 * TILE_SIZE, label: 'Eğitim Venti', broken: false },
    ],
    cages: [
      {
        id: 'tut_cage',
        name: 'Eğitim Kafesi',
        x: 20 * TILE_SIZE,
        y: 3 * TILE_SIZE,
        w: 5 * TILE_SIZE,
        h: 5 * TILE_SIZE,
      },
    ],
    rooms: [
      {
        id: 'tut_room',
        name: 'EĞİTİM ALANI',
        x: 2 * TILE_SIZE,
        y: 2 * TILE_SIZE,
        w: 11 * TILE_SIZE,
        h: 13 * TILE_SIZE,
      },
    ],
    traps: [],
    barricades: [],
    turrets,
    projectiles: [],
    smileMinions: [],
    effects: [
      ...(step === 1
        ? [
            {
              id: 'tut_zone',
              kind: 'doctor_heal' as const,
              x: 21 * TILE_SIZE,
              y: 11 * TILE_SIZE,
              radius: 56,
              ttl: 999,
              maxTtl: 999,
              color: '#10b981',
            },
          ]
        : []),
    ],
    bloodStains: [],
    floatingTexts: [],
    eventFeed: [],
    shakeTimer: 0,
    shakeIntensity: 0,
    players,
    soundEvents: [],
  };
}
