import {
  CARRY_PICKUP_RANGE,
  CARRY_SPEED_MULT,
  CHAPLAIN_BLESS_RANGE,
  CHAPLAIN_BLESS_SECONDS,
  CHAPLAIN_KNIFE_RANGE,
  CHEST_COUNT,
  CHEST_LOOT_SECONDS,
  CHEST_REFRESH_SECONDS,
  DOOR_MAX_LOCK_HITS,
  DOWN_TIME_BONUS_SECONDS,
  DOWNED_BLEEDOUT_RATE,
  DOWNED_BLEEDOUT_SECONDS,
  DOWNED_CRITICAL_SPEED_MULT,
  DOWNED_HP,
  DOWNED_SPEED_MULT,
  FARMER_CROP_GROW_SECONDS,
  FARMER_CROP_HEAL,
  FARMER_CROP_POISON_DAMAGE,
  FARMER_CROP_RESIST_AMOUNT,
  FARMER_CROP_RESIST_SECONDS,
  FARMER_SCYTHE_MAX_LEVEL,
  FARMER_SCYTHE_RANGE,
  FIGHTER_Q_RADIUS,
  HUNGRY_HIT_RECOVERY_SECONDS,
  HUNTER_HIT_RECOVERY_SECONDS,
  HUNTER_SCYTHE_DAMAGE,
  HUNTER_SCYTHE_SLOW,
  HUNTER_SCYTHE_SLOW_SECONDS,
  HUNTER_SEAL_ALERT_SECONDS,
  HUNTER_SHOTGUN_RECOVER_SECONDS,
  INVENTORY_ITEM_META,
  ITEM_COFFEE_BUFF_SECONDS,
  ITEM_COFFEE_DRINK_SECONDS,
  ITEM_COFFEE_DRINK_SLOW,
  ITEM_COFFEE_SPEED_MULT,
  ITEM_COFFEE_STAMINA_MULT,
  ITEM_FLASH_BLIND_SECONDS,
  ITEM_FLASH_HALF_ANGLE,
  ITEM_FLASH_RANGE,
  ITEM_MEDKIT_INSTANT_HEAL,
  ITEM_MEDKIT_REGEN_PER_SEC,
  ITEM_MEDKIT_REGEN_SECONDS,
  ITEM_MEDKIT_USE_SECONDS,
  ITEM_SHIELD_HITS,
  KILL_TIME_BONUS_SECONDS,
  KILLERS,
  KILLER_HIT_RECOVERY_SECONDS,
  JUMPER_HIT_RECOVERY_SECONDS,
  JUGGERNAUT_HIT_RECOVERY_SECONDS,
  KILLER_HIT_RECOVERY_SLOW,
  KILLER_LIST,
  KILLER_MAX_STAMINA,
  KILLER_SPRINT_BONUS,
  KILLER_STAMINA_DRAIN_RATE,
  LAST_SURVIVOR_TIME_SECONDS,
  MATCH_DURATION_SECONDS,
  MAX_DOWNS_BEFORE_DEATH,
  PROTECTOR_PROTECT_SECONDS,
  PROTECTOR_SHIELD_AMOUNT,
  PROTECTOR_SHIELD_DECAY_PER_SEC,
  PROTECTOR_STAFF_RANGE,
  REVIVE_DURATION_SECONDS,
  SHADOW_DASH_DURATION,
  SHADOW_DASH_SPEED,
  SHADOW_INVIS_SECONDS,
  SHADOW_INVIS_STAMINA_REGEN_MULT,
  SMILE_DARK_ZONE_RADIUS,
  SMILE_HIT_RECOVERY_SECONDS,
  SMILE_MINION_SPEED,
  SPEED_TO_PX,
  STAMINA_EXHAUST_RECOVER,
  SURVIVOR_CLASSES,
  SURVIVOR_CLASS_LIST,
  SURVIVOR_MAX_STAMINA,
  SURVIVOR_SPRINT_BONUS,
  SURVIVOR_STAMINA_DRAIN_RATE,
  TRAP_ESCAPE_DURATION_SECONDS,
} from './constants.ts';
import {
  MAP_COLS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  TILE_SIZE,
  circleIntersectsRect,
  createFacilityMap,
  findPathWaypoints,
  getTileAt,
  hasLineOfSight,
  hasWalkableLine,
  isSolidTile,
  resolveCircleRect,
} from './map.ts';
import type {
  BotTier,
  ChestEntity,
  CropEntity,
  GameState,
  InventoryItemKind,
  KillerId,
  PlayerInput,
  PlayerState,
  RoomZone,
  SmileMinion,
  SoundEvent,
  SurvivorClassId,
  TileType,
} from './types.ts';

let nextIdCounter = 1;
function uid(prefix: string): string {
  nextIdCounter += 1;
  return `${prefix}_${nextIdCounter}`;
}

export function getKillerHitRecoverySeconds(killerId?: KillerId): number {
  if (killerId === 'jumper') return JUMPER_HIT_RECOVERY_SECONDS;
  if (killerId === 'juggernaut') return JUGGERNAUT_HIT_RECOVERY_SECONDS;
  if (killerId === 'smile') return SMILE_HIT_RECOVERY_SECONDS;
  if (killerId === 'hungry') return HUNGRY_HIT_RECOVERY_SECONDS;
  if (killerId === 'hunter') return HUNTER_HIT_RECOVERY_SECONDS;
  return KILLER_HIT_RECOVERY_SECONDS;
}

const hunterShotHitTracker = new Map<string, Map<string, { count: number; blocked: boolean }>>();

function triggerHunterSealAlert(
  state: GameState,
  survivor: PlayerState,
  objectLabel: string,
  x: number,
  y: number
) {
  const hunter = state.players.find((pl) => pl.role === 'killer' && pl.killerId === 'hunter' && !pl.dead);
  if (!hunter) return;
  hunter.hunterAlertTargetId = survivor.id;
  hunter.hunterAlertX = survivor.x;
  hunter.hunterAlertY = survivor.y;
  hunter.hunterAlertTimer = HUNTER_SEAL_ALERT_SECONDS;
  hunter.hunterAlertObjectLabel = objectLabel;
  emitSound(state, 'trap', x, y);
  pushEvent(
    state,
    `⚠️ ${survivor.name} mühürlü ${objectLabel.toLowerCase()} ile etkileşime girdi! ([F] Işınlan)`,
    '#f59e0b'
  );
}

function fireHunterShotgun(state: GameState, p: PlayerState) {
  const isMoving = Math.hypot(p.vx, p.vy) > 25;
  const aimDeviation = isMoving ? (Math.random() - 0.5) * 0.42 : (Math.random() - 0.5) * 0.06;
  const baseAim = p.angle + aimDeviation;
  const spreadSpan = isMoving ? 0.58 : 0.24;
  const pelletJitter = isMoving ? 0.14 : 0.03;
  const shotId = uid('hshot');
  const muzzleX = p.x + Math.cos(p.angle) * 26;
  const muzzleY = p.y + Math.sin(p.angle) * 26;

  for (let i = 0; i < 6; i++) {
    const offset = ((i - 2.5) / 2.5) * (spreadSpan / 2) + (Math.random() - 0.5) * pelletJitter;
    const pelletAng = baseAim + offset;
    const speed = 980;
    state.projectiles.push({
      id: uid('proj'),
      kind: 'hunter_pellet',
      ownerId: p.id,
      shotId,
      x: muzzleX,
      y: muzzleY,
      startX: muzzleX,
      startY: muzzleY,
      vx: Math.cos(pelletAng) * speed,
      vy: Math.sin(pelletAng) * speed,
      radius: 6,
      damage: 30,
      maxRange: 520,
    });
  }

  p.hunterShotgunReady = false;
  p.cdR = 17;
  p.abilitiesUsed += 1;
  p.hunterShotgunRecoverTimer = HUNTER_SHOTGUN_RECOVER_SECONDS;
  p.hitRecoveryTimer = Math.max(p.hitRecoveryTimer, HUNTER_SHOTGUN_RECOVER_SECONDS);
  p.cdAttack = Math.max(p.cdAttack, HUNTER_SHOTGUN_RECOVER_SECONDS);

  emitSound(state, 'break', muzzleX, muzzleY);
  triggerShake(state, 7, 0.2);
  state.effects.push({
    id: uid('fx'),
    kind: 'hunter_shotgun_blast',
    x: muzzleX,
    y: muzzleY,
    angle: baseAim,
    radius: 78,
    ttl: 0.28,
    maxTtl: 0.28,
    color: '#fbbf24',
  });
  addFloat(
    state,
    p.x,
    p.y,
    isMoving ? 'POMPALI ATEŞLENDİ! (Sapma · 2sn Toparlanma)' : 'POMPALI ATEŞLENDİ! (2sn Toparlanma)',
    '#fbbf24'
  );
}

const CHEST_ITEM_POOL: InventoryItemKind[] = ['medkit', 'flashlight', 'coffee', 'shield'];

function isSafeChestSpot(
  tiles: TileType[],
  cols: number,
  rows: number,
  vents: { x: number; y: number }[],
  doors: { x: number; y: number; w: number; h: number }[],
  x: number,
  y: number
): boolean {
  const pad = 26;
  const minC = Math.floor((x - pad) / TILE_SIZE);
  const maxC = Math.floor((x + pad) / TILE_SIZE);
  const minR = Math.floor((y - pad) / TILE_SIZE);
  const maxR = Math.floor((y + pad) / TILE_SIZE);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (isSolidTile(getTileAt(tiles, cols, rows, c, r))) return false;
    }
  }
  for (const v of vents) {
    if (Math.hypot(v.x - x, v.y - y) < 62) return false;
  }
  for (const d of doors) {
    if (Math.hypot(d.x + d.w / 2 - x, d.y + d.h / 2 - y) < 68) return false;
  }
  return true;
}

function spawnRandomChests(
  rooms: RoomZone[],
  tiles: TileType[],
  cols: number,
  rows: number,
  vents: { x: number; y: number }[],
  doors: { x: number; y: number; w: number; h: number }[]
): ChestEntity[] {
  if (!rooms || rooms.length === 0) return [];
  const shuffled = [...rooms];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const chosenRooms = shuffled.slice(0, Math.min(CHEST_COUNT, shuffled.length));
  const chests: ChestEntity[] = [];
  for (const room of chosenRooms) {
    const pad = 74;
    const minX = room.x + pad;
    const maxX = Math.max(minX + 10, room.x + room.w - pad);
    const minY = room.y + pad;
    const maxY = Math.max(minY + 10, room.y + room.h - pad);
    let px = room.x + room.w / 2;
    let py = room.y + room.h / 2;
    for (let attempt = 0; attempt < 24; attempt++) {
      const tx = minX + Math.random() * (maxX - minX);
      const ty = minY + Math.random() * (maxY - minY);
      if (isSafeChestSpot(tiles, cols, rows, vents, doors, tx, ty)) {
        px = tx;
        py = ty;
        break;
      }
    }
    chests.push({
      id: uid('chest'),
      x: px,
      y: py,
      roomId: room.id,
      roomName: room.name,
      opened: false,
    });
  }
  return chests;
}

export interface ParticipantConfig {
  id: string;
  name: string;
  isBot: boolean;
  preferredClass?: SurvivorClassId;
  preferredRole?: 'random' | 'survivor' | 'killer';
  preferredKiller?: KillerId | 'random';
}

export interface CreateGameOptions {
  killerBotTier?: BotTier | 'random';
  isTestMode?: boolean;
}

export function createInitialGameState(
  participants: ParticipantConfig[],
  options?: CreateGameOptions
): GameState {
  const map = createFacilityMap();

  // Decide who is Killer:
  // If any participant explicitly chose 'killer' (e.g. Solo practice preference), pick from them;
  // otherwise pick randomly among all 5 participants ("Katil random seçiliyor").
  const explicitKillers = participants.filter((p) => p.preferredRole === 'killer');
  const poolForKiller =
    explicitKillers.length > 0
      ? explicitKillers
      : participants.filter((p) => p.preferredRole !== 'survivor');
  const killerCandidates = poolForKiller.length > 0 ? poolForKiller : participants;
  const chosenKillerParticipant =
    killerCandidates[Math.floor(Math.random() * killerCandidates.length)];

  const pickRandomBotTier = (): BotTier => {
    const r = Math.random();
    if (r < 0.4) return 'noob';
    if (r < 0.85) return 'normal';
    return 'pro';
  };

  // Enforce unique survivor classes across the entire match:
  // - Human survivors keep their chosen class unless duplicated.
  // - Aylin (Bot) keeps Doctor unless a human already took Doctor.
  // - All other bots get random unique classes from remaining classes.
  const usedSurvivorClasses = new Set<SurvivorClassId>();
  const assignedSurvivorClasses = new Map<string, SurvivorClassId>();
  const pickUnusedRandomClass = (): SurvivorClassId => {
    const avail = SURVIVOR_CLASS_LIST.filter((c) => !usedSurvivorClasses.has(c.id));
    const pool = avail.length > 0 ? avail : SURVIVOR_CLASS_LIST;
    return pool[Math.floor(Math.random() * pool.length)].id;
  };

  for (const p of participants) {
    if (p.id === chosenKillerParticipant.id || p.isBot) continue;
    const cls =
      p.preferredClass && !usedSurvivorClasses.has(p.preferredClass)
        ? p.preferredClass
        : pickUnusedRandomClass();
    usedSurvivorClasses.add(cls);
    assignedSurvivorClasses.set(p.id, cls);
  }
  for (const p of participants) {
    if (p.id === chosenKillerParticipant.id || !p.isBot) continue;
    if (p.name.startsWith('Aylin')) {
      const cls: SurvivorClassId = !usedSurvivorClasses.has('doctor')
        ? 'doctor'
        : pickUnusedRandomClass();
      usedSurvivorClasses.add(cls);
      assignedSurvivorClasses.set(p.id, cls);
    }
  }
  for (const p of participants) {
    if (p.id === chosenKillerParticipant.id || !p.isBot || assignedSurvivorClasses.has(p.id)) {
      continue;
    }
    const cls = pickUnusedRandomClass();
    usedSurvivorClasses.add(cls);
    assignedSurvivorClasses.set(p.id, cls);
  }

  const players: PlayerState[] = [];
  let survSpawnIdx = 0;

  for (const p of participants) {
    const isKiller = p.id === chosenKillerParticipant.id;
    const assignedBotTier: BotTier | undefined = p.isBot
      ? isKiller && options?.killerBotTier && options.killerBotTier !== 'random'
        ? options.killerBotTier
        : pickRandomBotTier()
      : undefined;
    if (isKiller) {
      const explicitPreferredKiller =
        p.preferredKiller && p.preferredKiller !== 'random' ? p.preferredKiller : undefined;

      const kId: KillerId =
        explicitPreferredKiller ??
        KILLER_LIST[Math.floor(Math.random() * KILLER_LIST.length)].id;
      const spec = KILLERS[kId];
      players.push({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        botTier: assignedBotTier,
        role: 'killer',
        killerId: kId,
        x: map.killerSpawn.x,
        y: map.killerSpawn.y,
        vx: 0,
        vy: 0,
        angle: Math.PI / 2,
        radius: 23,
        hp: 999,
        maxHp: 999,
        stamina: KILLER_MAX_STAMINA,
        maxStamina: KILLER_MAX_STAMINA,
        baseSpeed: spec.speed,
        downed: false,
        downVulnerable: false,
        downCount: 0,
        dead: false,
        bleedoutTimer: 0,
        downGraceTimer: 0,
        carryingSurvivorId: null,
        carriedById: null,
        cdAttack: 0,
        cdQ: 0,
        cdE: 0,
        cdR: 0,
        hitRecoveryTimer: 0,
        stunTimer: 0,
        frozenTimer: 0,
        slowTimer: 0,
        slowAmount: 0,
        speedBoostTimer: 0,
        speedBoostAmount: 0,
        staminaExhausted: false,
        dodgeTimer: 0,
        fighterQCharges: 0,
        dodgeRewardedThisCast: false,
        invisibleTimer: 0,
        shadowInvisTimer: 0,
        darknessStealthTimer: 0,
        darknessModeTimer: 0,
        darkZoneTimer: 0,
        darkZoneTick: 0,
        blindTimer: 0,
        flashBlindTimer: 0,
        frenzyTimer: 0,
        healAuraTimer: 0,
        healAuraTick: 0,
        shieldHp: 0,
        protectedTimer: 0,
        protectorTargetId: null,
        chaplainKnifeCharges: 0,
        blessed: false,
        blessedTimer: 0,
        blessedHealTick: 0,
        inventory: [null, null, null],
        equippedSlot: null,
        medkitRegenTimer: 0,
        medkitRegenTick: 0,
        coffeeBuffTimer: 0,
        trappedById: null,
        chainsawChargeTimer: 0,
        chainsawChargeDuration: 0,
        chainsawStuckTimer: 0,
        chainsawStuckAngle: 0,
        chainsawFlurryTimer: 0,
        chainsawFlurryHitCooldowns: {},
        sawHoldTimer: 0,
        sawRevving: false,
        sawMalfunction: false,
        sawMalfunctionTimer: kId === 'sawblooder' ? 18.0 : 0,
        hunterShotgunReady: false,
        hunterShotgunRecoverTimer: 0,
        hunterAlertTargetId: null,
        hunterAlertX: 0,
        hunterAlertY: 0,
        hunterAlertTimer: 0,
        hunterAlertObjectLabel: undefined,
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
        coinBreakdown: [],
        coinsEarned: 0,
      });
    } else {
      const classId: SurvivorClassId =
        assignedSurvivorClasses.get(p.id) ??
        p.preferredClass ??
        SURVIVOR_CLASS_LIST[Math.floor(Math.random() * SURVIVOR_CLASS_LIST.length)].id;
      const spec = SURVIVOR_CLASSES[classId];
      const spawn = map.survivorSpawns[survSpawnIdx % map.survivorSpawns.length];
      survSpawnIdx += 1;
      players.push({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        botTier: assignedBotTier,
        role: 'survivor',
        survivorClass: classId,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: 16,
        hp: spec.hp,
        maxHp: spec.hp,
        stamina: spec.maxStamina ?? SURVIVOR_MAX_STAMINA,
        maxStamina: spec.maxStamina ?? SURVIVOR_MAX_STAMINA,
        baseSpeed: spec.speed,
        downed: false,
        downVulnerable: false,
        downCount: 0,
        dead: false,
        bleedoutTimer: 0,
        downGraceTimer: 0,
        carryingSurvivorId: null,
        carriedById: null,
        cdAttack: 0,
        cdQ: 0,
        cdE: 0,
        cdR: 0,
        hitRecoveryTimer: 0,
        stunTimer: 0,
        frozenTimer: 0,
        slowTimer: 0,
        slowAmount: 0,
        speedBoostTimer: 0,
        speedBoostAmount: 0,
        staminaExhausted: false,
        dodgeTimer: 0,
        fighterQCharges: 0,
        dodgeRewardedThisCast: false,
        invisibleTimer: 0,
        shadowInvisTimer: 0,
        darkZoneTimer: 0,
        darkZoneTick: 0,
        blindTimer: 0,
        flashBlindTimer: 0,
        frenzyTimer: 0,
        healAuraTimer: 0,
        healAuraTick: 0,
        shieldHp: 0,
        protectedTimer: 0,
        protectorTargetId: null,
        chaplainKnifeCharges: 0,
        blessed: false,
        blessedTimer: 0,
        blessedHealTick: 0,
        farmerScytheLevel: classId === 'farmer' ? 1 : 0,
        damageResistTimer: 0,
        damageResistAmount: 0,
        inventory: [null, null, null],
        equippedSlot: null,
        medkitRegenTimer: 0,
        medkitRegenTick: 0,
        coffeeBuffTimer: 0,
        trappedById: null,
        chainsawChargeTimer: 0,
        chainsawChargeDuration: 0,
        chainsawStuckTimer: 0,
        chainsawStuckAngle: 0,
        chainsawFlurryTimer: 0,
        chainsawFlurryHitCooldowns: {},
        sawHoldTimer: 0,
        sawRevving: false,
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
        coinBreakdown: [],
        coinsEarned: 0,
      });
    }
  }

  const killerPlayer = players.find((pl) => pl.role === 'killer');
  const initialEvents: GameState['eventFeed'] = [];
  if (killerPlayer?.isBot && killerPlayer.botTier && !options?.isTestMode) {
    const tierLabel =
      killerPlayer.botTier === 'noob'
        ? 'Kolay'
        : killerPlayer.botTier === 'normal'
        ? 'Orta'
        : 'Zor';
    const tierColor =
      killerPlayer.botTier === 'noob'
        ? '#34d399'
        : killerPlayer.botTier === 'normal'
        ? '#fbbf24'
        : '#f43f5e';
    initialEvents.push({
      id: uid('ev'),
      text: `Katil Bot Zorluğu: ${tierLabel}`,
      color: tierColor,
      ttl: 5.5,
    });
  }

  return {
    phase: 'playing',
    winner: null,
    winReason: '',
    timeRemaining: options?.isTestMode ? 600 : MATCH_DURATION_SECONDS,
    elapsed: 0,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    cols: MAP_COLS,
    rows: MAP_ROWS,
    tiles: map.tiles,
    doors: map.doors,
    vents: map.vents,
    cages: map.cages,
    rooms: map.rooms,
    traps: [],
    barricades: [],
    turrets: [],
    chests: spawnRandomChests(map.rooms, map.tiles, MAP_COLS, MAP_ROWS, map.vents, map.doors),
    chestRefreshTimer: CHEST_REFRESH_SECONDS,
    crops: [],
    projectiles: [],
    smileMinions: [],
    effects: [],
    bloodStains: [],
    floatingTexts: [],
    eventFeed: initialEvents,
    shakeTimer: 0,
    shakeIntensity: 0,
    players,
    soundEvents: [],
    activeExecution: null,
    lastSurvivorTriggered: false,
    lastKillInfo: null,
    matchId: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    isTestMode: Boolean(options?.isTestMode),
  };
}

export function createTestArenaState(opts: {
  role: 'survivor' | 'killer';
  survivorClass: SurvivorClassId;
  killerId: KillerId;
  playerName: string;
}): GameState {
  const participants: ParticipantConfig[] = [
    {
      id: 'local_p1',
      name: opts.playerName || 'Test Oyuncusu',
      isBot: false,
      preferredClass: opts.survivorClass,
      preferredRole: opts.role,
      preferredKiller: opts.killerId,
    },
    {
      id: 'test_bot_1',
      name: 'Aylin (Test)',
      isBot: true,
      preferredClass: 'doctor',
      preferredRole: 'survivor',
    },
    {
      id: 'test_bot_2',
      name: 'Kerem (Test)',
      isBot: true,
      preferredRole: 'survivor',
    },
    {
      id: 'test_bot_3',
      name: 'Mert (Test)',
      isBot: true,
      preferredRole: 'survivor',
    },
    {
      id: 'test_bot_4',
      name: 'Zeynep (Test)',
      isBot: true,
      preferredRole: opts.role === 'killer' ? 'survivor' : 'killer',
      preferredKiller: 'random',
    },
  ];

  const st = createInitialGameState(participants, {
    killerBotTier: 'noob',
    isTestMode: true,
  });

  if (opts.role === 'survivor') {
    const firstBotAlly = st.players.find((pl) => pl.isBot && pl.role === 'survivor');
    if (firstBotAlly) {
      firstBotAlly.hp = Math.min(firstBotAlly.maxHp, 45);
    }
  }

  st.eventFeed.unshift({
    id: uid('ev'),
    text: 'TEST ALANI: Tüm yetenekleri serbestçe dene (Para kazanılmaz)',
    color: '#38bdf8',
    ttl: 8,
  });
  return st;
}

function addCoinReward(
  state: GameState,
  player: PlayerState | undefined,
  label: string,
  delta: number
) {
  if (!player || state.isTestMode || delta === 0) return;
  if (!player.coinBreakdown) player.coinBreakdown = [];
  const existing = player.coinBreakdown.find((item) => item.label === label);
  if (existing) {
    existing.count += 1;
    existing.amount += delta;
  } else {
    player.coinBreakdown.push({ label, count: 1, amount: delta });
  }
}

function finalizeMatchCoins(state: GameState) {
  if (state.isTestMode) {
    for (const p of state.players) {
      p.coinsEarned = 0;
    }
    return;
  }
  const killer = state.players.find((pl) => pl.role === 'killer');
  const killerBotTier = killer?.isBot ? killer.botTier : undefined;
  const botBonus =
    killerBotTier === 'pro'
      ? 40
      : killerBotTier === 'normal'
      ? 15
      : killerBotTier === 'noob'
      ? -5
      : 0;
  const botBonusLabel =
    killerBotTier === 'pro'
      ? 'Zor Katil Bot'
      : killerBotTier === 'normal'
      ? 'Orta Katil Bot'
      : killerBotTier === 'noob'
      ? 'Kolay Katil Bot'
      : '';

  for (const p of state.players) {
    if (p.role === 'survivor') {
      if (state.winner === 'survivors') {
        addCoinReward(state, p, 'Galibiyet Bonusu', 20);
      }
      if (botBonus !== 0 && botBonusLabel) {
        addCoinReward(state, p, botBonusLabel, botBonus);
      }
    }
    const rawSum = (p.coinBreakdown ?? []).reduce((sum, item) => sum + item.amount, 0);
    p.coinsEarned = Math.max(0, rawSum);
  }
}

function addFloat(state: GameState, x: number, y: number, text: string, color: string) {
  state.floatingTexts.push({
    id: uid('ft'),
    x,
    y: y - 16,
    text,
    color,
    ttl: 1.15,
    maxTtl: 1.15,
  });
}

function pushEvent(state: GameState, text: string, color: string) {
  state.eventFeed.unshift({
    id: uid('ev'),
    text,
    color,
    ttl: 4.5,
  });
  if (state.eventFeed.length > 4) state.eventFeed.pop();
}

function triggerShake(state: GameState, intensity: number, duration: number) {
  if (intensity >= state.shakeIntensity) {
    state.shakeIntensity = intensity;
    state.shakeTimer = Math.max(state.shakeTimer, duration);
  }
}

function emitSound(state: GameState, type: SoundEvent['type'], x: number, y: number) {
  state.soundEvents.push({ type, x, y });
}

function applySlow(target: PlayerState, amount: number, duration: number) {
  if (duration <= 0) return;
  if (duration >= target.slowTimer || amount > target.slowAmount) {
    target.slowAmount = Math.max(target.slowAmount, amount);
    target.slowTimer = Math.max(target.slowTimer, duration);
  }
}

function dropCarriedSurvivor(state: GameState, carrier: PlayerState, silent = false) {
  if (!carrier.carryingSurvivorId) return;
  const carried = state.players.find((pl) => pl.id === carrier.carryingSurvivorId);
  carrier.carryingSurvivorId = null;
  if (carried) {
    carried.carriedById = null;
    carried.vx = 0;
    carried.vy = 0;
    const dropX = carrier.x + Math.cos(carrier.angle) * 14;
    const dropY = carrier.y + Math.sin(carrier.angle) * 14;
    if (!isPositionBlockedForPlayer(state, carried, dropX, dropY)) {
      carried.x = dropX;
      carried.y = dropY;
    } else {
      carried.x = carrier.x;
      carried.y = carrier.y;
    }
    ejectFromObstacles(state, carried);
  }
  if (!silent) {
    emitSound(state, 'lock', carrier.x, carrier.y);
    addFloat(state, carrier.x, carrier.y - 10, 'SIRTTAN İNDİRİLDİ', '#cbd5e1');
  }
}

function finalizeVictimKill(
  state: GameState,
  killer: PlayerState,
  target: PlayerState,
  hitAng: number,
  reason: 'execution' | 'third_down'
) {
  if (target.carryingSurvivorId) {
    dropCarriedSurvivor(state, target, true);
  }
  target.carriedById = null;
  target.hp = 0;
  target.dead = true;
  target.downed = false;
  target.downVulnerable = false;
  target.channel = null;
  state.timeRemaining += KILL_TIME_BONUS_SECONDS;

  const kId = killer.killerId ?? 'juggernaut';
  const kSpec = KILLERS[kId];
  const vSpec = target.survivorClass ? SURVIVOR_CLASSES[target.survivorClass] : null;

  state.bloodStains.push({
    id: uid('bld'),
    x: target.x,
    y: target.y,
    radius: 30,
    angle: hitAng,
    seed: Math.random() * Math.PI * 2,
    alpha: 0.94,
  });
  // Directional arterial blood splatter trail along strike angle
  for (let i = 0; i < 4; i++) {
    const sprayAng = hitAng + (Math.random() - 0.5) * 0.95;
    const sprayDist = 18 + i * 11 + Math.random() * 10;
    state.bloodStains.push({
      id: uid('bld'),
      x: target.x + Math.cos(sprayAng) * sprayDist,
      y: target.y + Math.sin(sprayAng) * sprayDist,
      radius: 8 + Math.random() * 9,
      angle: sprayAng,
      seed: Math.random() * Math.PI * 2,
      alpha: 0.8 - i * 0.1,
    });
  }
  while (state.bloodStains.length > 100) state.bloodStains.shift();

  state.effects.push({
    id: uid('fx'),
    kind: 'killer_kill',
    killerId: kId,
    victimEmoji: vSpec?.emoji ?? '🏃',
    victimColor: vSpec?.accentColor ?? '#38bdf8',
    x: target.x,
    y: target.y,
    angle: hitAng,
    radius: 118,
    ttl: 1.85,
    maxTtl: 1.85,
    color: kSpec.accentColor,
  });

  const remainingAfter = state.players.filter((p) => p.role === 'survivor' && !p.dead).length;
  state.lastKillInfo = {
    id: uid('kill'),
    killerId: kId,
    killerName: killer.name,
    victimId: target.id,
    victimName: target.name,
    victimClass: target.survivorClass ?? 'runner',
    atElapsed: state.elapsed,
    isFinalKill: remainingAfter === 0,
  };

  if (reason === 'third_down') {
    addFloat(state, target.x, target.y - 12, `3. DÜŞÜŞ — ÖLDÜ! (+${KILL_TIME_BONUS_SECONDS}sn)`, '#ef4444');
    pushEvent(state, `${target.name} 3. kez düştüğü için ${kSpec.name} tarafından elendi! (+${KILL_TIME_BONUS_SECONDS}sn)`, '#ef4444');
  } else {
    addFloat(state, target.x, target.y - 12, `İNFAZ EDİLDİ! (+${KILL_TIME_BONUS_SECONDS}sn)`, '#ef4444');
    pushEvent(state, `${kSpec.name}, ${target.name} oyuncusunu infaz etti! (+${KILL_TIME_BONUS_SECONDS}sn)`, '#ef4444');
  }

  emitSound(state, 'kill', target.x, target.y);
  triggerShake(state, 9, 0.25);
  addCoinReward(state, killer, 'Öldürme', 11);
}

function dealDamageToSurvivor(
  state: GameState,
  killer: PlayerState,
  target: PlayerState,
  rawDamage: number,
  fromBasicAttack = false,
  triggerRecovery = true,
  bypassDefenses = false
): boolean {
  if (target.role !== 'survivor' || target.dead || target.carriedById) return false;

  // Fighter E: 1.5s Dodge Mode blocks all damage from killer hits, stuns killer for 1s + 1s 50% slow after stun, and grants +1 Q charge
  if (!bypassDefenses && target.dodgeTimer > 0) {
    if (target.survivorClass === 'fighter') {
      killer.stunTimer = Math.max(killer.stunTimer, 1.0);
      applySlow(killer, 0.5, killer.stunTimer + 1.0);
      if (!target.dodgeRewardedThisCast) {
        target.dodgeRewardedThisCast = true;
        target.fighterQCharges = (target.fighterQCharges ?? 0) + 1;
        addCoinReward(state, target, 'Fighter E (Dodge)', 6);
        addFloat(state, target.x, target.y, 'DODGE! SERSEMLETTİ (+1 Q)', '#38bdf8');
        pushEvent(state, `${target.name} Dodge yedirip katili sersemletti! (+1 Q Yükü)`, '#38bdf8');
      } else {
        addFloat(state, target.x, target.y, 'DODGE! SERSEMLETTİ!', '#38bdf8');
      }
    } else {
      addFloat(state, target.x, target.y, 'KAÇINDI!', '#38bdf8');
    }
    emitSound(state, 'dodge', target.x, target.y);
    return false;
  }

  if (!bypassDefenses && (target.protectedTimer ?? 0) > 0) {
    if (fromBasicAttack || triggerRecovery) {
      addFloat(state, target.x, target.y, 'KORUMA ALTINDA!', '#facc15');
      emitSound(state, 'dodge', target.x, target.y);
    }
    return false;
  }

  const aliveSurvivors = state.players.filter((p) => p.role === 'survivor' && !p.dead);
  const allAliveDowned = aliveSurvivors.length > 0 && aliveSurvivors.every((p) => p.downed);

  // While downed with > 1 HP (!downVulnerable), Killer CANNOT kill them UNLESS all living survivors are downed
  if (target.downed && !target.downVulnerable && !allAliveDowned) {
    if (fromBasicAttack) {
      addFloat(state, target.x, target.y, 'YERDE KORUMALI!', '#eab308');
    }
    return false;
  }

  // Held Shield (🛡️): while actively held in hand by a standing survivor, blocks all hit damage (breaks in 2 hits)
  if (
    !bypassDefenses &&
    !target.downed &&
    target.equippedSlot !== null &&
    target.equippedSlot !== undefined &&
    target.inventory?.[target.equippedSlot]?.kind === 'shield' &&
    (fromBasicAttack || triggerRecovery || rawDamage >= 12)
  ) {
    const slotIdx = target.equippedSlot;
    const shieldItem = target.inventory![slotIdx]!;
    const nextDurability = (shieldItem.durability ?? ITEM_SHIELD_HITS) - 1;
    const recoverySeconds = getKillerHitRecoverySeconds(killer.killerId);
    if (triggerRecovery) {
      killer.hitRecoveryTimer = recoverySeconds;
      killer.cdAttack = Math.max(killer.cdAttack, recoverySeconds);
      applySlow(killer, KILLER_HIT_RECOVERY_SLOW, recoverySeconds);
    }
    if (nextDurability <= 0) {
      target.inventory![slotIdx] = null;
      target.equippedSlot = null;
      addFloat(state, target.x, target.y, '🛡️ KALKAN KIRILDI!', '#fb7185');
      pushEvent(state, `${target.name} kalkanı 2. vuruşta kırıldı!`, '#f59e0b');
      emitSound(state, 'break', target.x, target.y);
    } else {
      shieldItem.durability = nextDurability;
      addFloat(
        state,
        target.x,
        target.y,
        `🛡️ KALKAN KORUDU! (${nextDurability}/${shieldItem.maxDurability ?? ITEM_SHIELD_HITS})`,
        '#38bdf8'
      );
      emitSound(state, 'dodge', target.x, target.y);
    }
    triggerShake(state, 3, 0.08);
    return false;
  }

  // Chaplain Q Blessing: blocks the killer's first strike completely
  if (!bypassDefenses && target.blessed && (fromBasicAttack || triggerRecovery || rawDamage >= 15)) {
    target.blessed = false;
    target.blessedTimer = 0;
    target.blessedHealTick = 0;
    const recoverySeconds = getKillerHitRecoverySeconds(killer.killerId);
    if (triggerRecovery) {
      killer.hitRecoveryTimer = recoverySeconds;
      killer.cdAttack = Math.max(killer.cdAttack, recoverySeconds);
      applySlow(killer, KILLER_HIT_RECOVERY_SLOW, recoverySeconds);
    }
    addFloat(state, target.x, target.y, 'KUTSAMA KORUDU! ✝️', '#fde047');
    pushEvent(state, `${target.name} kutsama sayesinde hasar almadı!`, '#fde047');
    emitSound(state, 'dodge', target.x, target.y);
    triggerShake(state, 3, 0.08);
    return false;
  }

  // Juggernaut R: hitting while invisible breaks invisibility
  let dmg = rawDamage;
  if (!bypassDefenses && killer.killerId === 'juggernaut' && killer.invisibleTimer > 0) {
    if (fromBasicAttack) {
      dmg = Math.max(dmg, 55);
    }
    killer.invisibleTimer = 0;
    addFloat(state, killer.x, killer.y, 'GÖRÜNMEZLİK BOZULDU!', '#94a3b8');
  }

  // Farmer crop 25% damage resistance (4s)
  if (!bypassDefenses && (target.damageResistTimer ?? 0) > 0 && (target.damageResistAmount ?? 0) > 0) {
    dmg = Math.max(1, Math.round(dmg * (1 - target.damageResistAmount!)));
  }

  // Protector Q: extra decaying shield absorbs damage before real HP is reduced
  if (!bypassDefenses && (target.shieldHp ?? 0) > 0) {
    const absorbed = Math.min(target.shieldHp!, dmg);
    target.shieldHp = Math.max(0, target.shieldHp! - absorbed);
    dmg -= absorbed;
    if (absorbed > 0) {
      addFloat(state, target.x, target.y, `-${Math.ceil(absorbed)} KALKAN`, '#38bdf8');
    }
    if (dmg <= 0) {
      const recoverySeconds = getKillerHitRecoverySeconds(killer.killerId);
      if (triggerRecovery) {
        killer.hitRecoveryTimer = recoverySeconds;
        killer.cdAttack = Math.max(killer.cdAttack, recoverySeconds);
        applySlow(killer, KILLER_HIT_RECOVERY_SLOW, recoverySeconds);
      }
      emitSound(state, 'dodge', target.x, target.y);
      triggerShake(state, 3, 0.08);
      return false;
    }
  }

  target.hp -= dmg;
  target.channel = null; // Interrupt any bandage/lock/revive
  killer.damageDealt += dmg;
  addCoinReward(state, killer, 'Hasar Verme', 3);

  // Sawblooder R: hitting a survivor while Kanlı Katliam is active increases remaining duration by +2s
  if (killer.killerId === 'sawblooder' && killer.chainsawFlurryTimer && killer.chainsawFlurryTimer > 0) {
    killer.chainsawFlurryTimer += 2.0;
    addFloat(state, killer.x, killer.y, 'SÜRE UZADI! (+2sn)', '#dc2626');
  }

  // Blood burst + persistent floor blood stains on every landed hit!
  const hitAng = Math.atan2(target.y - killer.y, target.x - killer.x);
  state.effects.push({
    id: uid('fx'),
    kind: 'blood_splatter',
    x: target.x,
    y: target.y,
    angle: hitAng,
    radius: 46,
    ttl: 0.42,
    maxTtl: 0.42,
    color: '#dc2626',
  });
  state.bloodStains.push({
    id: uid('bld'),
    x: target.x + (Math.random() - 0.5) * 10,
    y: target.y + (Math.random() - 0.5) * 10,
    radius: 13 + Math.random() * 8,
    angle: hitAng,
    seed: Math.random() * Math.PI * 2,
    alpha: 0.72 + Math.random() * 0.2,
  });
  state.bloodStains.push({
    id: uid('bld'),
    x: target.x + Math.cos(hitAng) * (16 + Math.random() * 14),
    y: target.y + Math.sin(hitAng) * (16 + Math.random() * 14),
    radius: 7 + Math.random() * 6,
    angle: hitAng + (Math.random() - 0.5) * 0.6,
    seed: Math.random() * Math.PI * 2,
    alpha: 0.6 + Math.random() * 0.25,
  });
  while (state.bloodStains.length > 90) {
    state.bloodStains.shift();
  }

  // Killer DBD-style hit recovery: 50% slow + weapon wipe / reload
  const recoverySeconds = getKillerHitRecoverySeconds(killer.killerId);
  if (triggerRecovery) {
    killer.hitRecoveryTimer = recoverySeconds;
    killer.cdAttack = Math.max(killer.cdAttack, recoverySeconds);
    applySlow(killer, KILLER_HIT_RECOVERY_SLOW, recoverySeconds);
  }

  addFloat(state, target.x, target.y, `-${Number(dmg.toFixed(1))}`, '#fb7185');
  emitSound(state, 'hit', target.x, target.y);
  triggerShake(state, 5, 0.14);

  if (target.downed) {
    // Immediate kill with realistic per-killer in-world animation (no 3-second freeze lock!)
    finalizeVictimKill(state, killer, target, hitAng, 'execution');
  } else if (target.hp <= 0) {
    target.downCount += 1;
    if (target.downCount >= MAX_DOWNS_BEFORE_DEATH) {
      // 3rd time reaching 0 HP -> Instant death with killer-specific kill animation!
      finalizeVictimKill(state, killer, target, hitAng, 'third_down');
    } else {
      // 1st or 2nd down: 100 yellow HP (-5/sec), 50% slow, immune until reaching 1 HP
      if (target.carryingSurvivorId) {
        dropCarriedSurvivor(state, target, true);
      }
      target.downed = true;
      target.downVulnerable = false;
      target.hp = DOWNED_HP;
      target.bleedoutTimer = DOWNED_BLEEDOUT_SECONDS;
      target.downGraceTimer = 0;
      state.timeRemaining += DOWN_TIME_BONUS_SECONDS;
      addFloat(state, target.x, target.y - 12, `YERE DÜŞTÜ! (+${DOWN_TIME_BONUS_SECONDS}sn)`, '#eab308');
      const nowAllDowned = aliveSurvivors.every((p) => p.downed);
      if (nowAllDowned) {
        pushEvent(state, `Herkes yere düştü! (+${DOWN_TIME_BONUS_SECONDS}sn Süre · Katil öldürebilir!)`, '#ef4444');
      } else {
        pushEvent(state, `${target.name} yere düştü! (+${DOWN_TIME_BONUS_SECONDS}sn Süre)`, '#eab308');
      }
      emitSound(state, 'downed', target.x, target.y);
      addCoinReward(state, killer, 'Yere Düşürme', 7);
    }
  }

  return true;
}

function isPositionBlockedForPlayer(state: GameState, p: PlayerState, x: number, y: number): boolean {
  const minC = Math.max(0, Math.floor((x - p.radius - 2) / TILE_SIZE));
  const maxC = Math.min(state.cols - 1, Math.floor((x + p.radius + 2) / TILE_SIZE));
  const minR = Math.max(0, Math.floor((y - p.radius - 2) / TILE_SIZE));
  const maxR = Math.min(state.rows - 1, Math.floor((y + p.radius + 2) / TILE_SIZE));

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (isSolidTile(getTileAt(state.tiles, state.cols, state.rows, c, r))) {
        if (circleIntersectsRect(x, y, p.radius, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE)) {
          return true;
        }
      }
    }
  }
  if (p.role === 'killer') {
    for (const door of state.doors) {
      if (!door.broken && door.locked && circleIntersectsRect(x, y, p.radius, door.x, door.y, door.w, door.h)) {
        return true;
      }
    }
  }
  for (const bar of state.barricades) {
    if (
      (bar.kind === 'wood' || (bar.kind === 'shadow' && p.role === 'survivor')) &&
      circleIntersectsRect(x, y, p.radius, bar.x, bar.y, bar.w, bar.h)
    ) {
      return true;
    }
  }
  return false;
}

function ejectFromObstacles(state: GameState, p: PlayerState): void {
  if (!isPositionBlockedForPlayer(state, p, p.x, p.y)) return;
  for (let dist = 12; dist <= 160; dist += 12) {
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const nx = Math.max(
        TILE_SIZE + p.radius,
        Math.min(state.mapWidth - TILE_SIZE - p.radius, p.x + Math.cos(ang) * dist)
      );
      const ny = Math.max(
        TILE_SIZE + p.radius,
        Math.min(state.mapHeight - TILE_SIZE - p.radius, p.y + Math.sin(ang) * dist)
      );
      if (!isPositionBlockedForPlayer(state, p, nx, ny)) {
        p.x = nx;
        p.y = ny;
        return;
      }
    }
  }
}

function distToRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): number {
  const cx = Math.max(rx, Math.min(rx + rw, px));
  const cy = Math.max(ry, Math.min(ry + rh, py));
  return Math.hypot(px - cx, py - cy);
}

function resolveEntityMapCollisions(state: GameState, p: PlayerState): boolean {
  let hitWall = false;
  const phasing =
    (p.role === 'killer' && ((p.darknessModeTimer ?? 0) > 0 || p.dashKind === 'darkness_e')) ||
    (p.role === 'survivor' && p.dashKind === 'shadow_e');

  if (!phasing) {
    // 1. Tile collisions
    const minC = Math.max(0, Math.floor((p.x - p.radius - 4) / TILE_SIZE));
    const maxC = Math.min(state.cols - 1, Math.floor((p.x + p.radius + 4) / TILE_SIZE));
    const minR = Math.max(0, Math.floor((p.y - p.radius - 4) / TILE_SIZE));
    const maxR = Math.min(state.rows - 1, Math.floor((p.y + p.radius + 4) / TILE_SIZE));

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const tile = getTileAt(state.tiles, state.cols, state.rows, c, r);
        if (isSolidTile(tile)) {
          const res = resolveCircleRect(
            p.x,
            p.y,
            p.radius,
            c * TILE_SIZE,
            r * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE
          );
          if (res.collided) {
            p.x = res.x;
            p.y = res.y;
            hitWall = true;
          }
        }
      }
    }

    // 2. Locked Doors block Killer (and broken=false, locked=true)
    for (const door of state.doors) {
      if (door.broken || !door.locked) continue;
      // Locked door blocks the killer; survivors can slip past friendly-locked doors
      if (p.role === 'killer') {
        const res = resolveCircleRect(p.x, p.y, p.radius, door.x, door.y, door.w, door.h);
        if (res.collided) {
          p.x = res.x;
          p.y = res.y;
          hitWall = true;
        }
      }
    }

    // 3. Barricades
    for (const bar of state.barricades) {
      if (bar.kind === 'wood') {
        // Builder's wood barricade blocks both killer and survivors
        const res = resolveCircleRect(p.x, p.y, p.radius, bar.x, bar.y, bar.w, bar.h);
        if (res.collided) {
          p.x = res.x;
          p.y = res.y;
          hitWall = true;
        }
      } else if (bar.kind === 'shadow' && p.role === 'survivor') {
        // Smile's black barricade blocks survivors, Smile walks right through
        const res = resolveCircleRect(p.x, p.y, p.radius, bar.x, bar.y, bar.w, bar.h);
        if (res.collided) {
          p.x = res.x;
          p.y = res.y;
          hitWall = true;
        }
      }
    }
  }

  p.x = Math.max(TILE_SIZE + p.radius, Math.min(state.mapWidth - TILE_SIZE - p.radius, p.x));
  p.y = Math.max(TILE_SIZE + p.radius, Math.min(state.mapHeight - TILE_SIZE - p.radius, p.y));

  // Anti-stacking / Push apart overlap between players so killer cannot walk directly inside survivor hitbox
  for (const other of state.players) {
    if (other.id === p.id || other.dead) continue;
    const dist = Math.hypot(other.x - p.x, other.y - p.y);
    const minDist =
      p.radius + other.radius + (p.role === 'killer' || other.role === 'killer' ? 4 : 0);
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      const nx = (p.x - other.x) / dist;
      const ny = (p.y - other.y) / dist;
      if (p.role === 'killer') {
        // Killer pushes survivor slightly away without getting stuck
        other.x -= nx * (overlap * 0.5) * 1.3;
        other.y -= ny * (overlap * 0.5) * 1.3;
      } else if (other.role === 'killer') {
        p.x += nx * (overlap * 0.5) * 1.3;
        p.y += ny * (overlap * 0.5) * 1.3;
      } else {
        p.x += nx * (overlap * 0.5);
        p.y += ny * (overlap * 0.5);
      }
    }
  }

  return hitWall;
}

function resolveCircleMapCollisions(
  state: GameState,
  cx: number,
  cy: number,
  radius: number,
  options?: { blockWoodBarricades?: boolean; blockLockedDoors?: boolean }
): { x: number; y: number } {
  let x = cx;
  let y = cy;
  const minC = Math.max(0, Math.floor((x - radius - 4) / TILE_SIZE));
  const maxC = Math.min(state.cols - 1, Math.floor((x + radius + 4) / TILE_SIZE));
  const minR = Math.max(0, Math.floor((y - radius - 4) / TILE_SIZE));
  const maxR = Math.min(state.rows - 1, Math.floor((y + radius + 4) / TILE_SIZE));

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const tile = getTileAt(state.tiles, state.cols, state.rows, c, r);
      if (isSolidTile(tile)) {
        const res = resolveCircleRect(
          x,
          y,
          radius,
          c * TILE_SIZE,
          r * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE
        );
        if (res.collided) {
          x = res.x;
          y = res.y;
        }
      }
    }
  }

  if (options?.blockLockedDoors) {
    for (const door of state.doors) {
      if (door.broken || !door.locked) continue;
      const res = resolveCircleRect(x, y, radius, door.x, door.y, door.w, door.h);
      if (res.collided) {
        x = res.x;
        y = res.y;
      }
    }
  }

  if (options?.blockWoodBarricades) {
    for (const bar of state.barricades) {
      if (bar.kind !== 'wood') continue;
      const res = resolveCircleRect(x, y, radius, bar.x, bar.y, bar.w, bar.h);
      if (res.collided) {
        x = res.x;
        y = res.y;
      }
    }
  }

  x = Math.max(TILE_SIZE + radius, Math.min(state.mapWidth - TILE_SIZE - radius, x));
  y = Math.max(TILE_SIZE + radius, Math.min(state.mapHeight - TILE_SIZE - radius, y));
  return { x, y };
}

function emptyInput(angle = 0): PlayerInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    angle,
    attack: false,
    attackHeld: false,
    useQ: false,
    useE: false,
    useR: false,
    useCtrl: false,
    holdF: false,
  };
}

function steerToward(
  input: PlayerInput,
  bot: PlayerState,
  tx: number,
  ty: number
) {
  const dx = tx - bot.x;
  const dy = ty - bot.y;
  if (Math.abs(dx) > 6) {
    input.right = dx > 0;
    input.left = dx < 0;
  }
  if (Math.abs(dy) > 6) {
    input.down = dy > 0;
    input.up = dy < 0;
  }
  input.angle = Math.atan2(dy, dx);
}

function predictAimAngle(
  shooter: PlayerState,
  target: PlayerState,
  projectileSpeed: number
): number {
  const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
  const travel = Math.min(0.45, dist / Math.max(100, projectileSpeed));
  const px = target.x + target.vx * travel;
  const py = target.y + target.vy * travel;
  return Math.atan2(py - shooter.y, px - shooter.x);
}

type BotGoalKind = NonNullable<PlayerState['botGoal']>['kind'];

function assignBotGoal(
  bot: PlayerState,
  kind: BotGoalKind,
  x: number,
  y: number,
  until: number,
  targetId?: string
) {
  const prev = bot.botGoal;
  const changed =
    !prev ||
    prev.kind !== kind ||
    prev.targetId !== targetId ||
    Math.hypot(prev.x - x, prev.y - y) > 52;

  bot.botGoal = { kind, targetId, x, y, until };
  if (changed) {
    bot.botPath = undefined;
    bot.botRepathTimer = 0;
  }
}

function followBotGoal(
  state: GameState,
  bot: PlayerState,
  input: PlayerInput,
  dt: number,
  isStuck: boolean,
  options: {
    avoidPos?: { x: number; y: number; radius: number };
    blockedDoors?: typeof state.doors;
    blockedBarricades?: typeof state.barricades;
    repathInterval?: number;
    pad?: number;
  }
): { x: number; y: number } {
  const goal = bot.botGoal!;
  const pad = options.pad ?? (bot.role === 'killer' ? 16 : 13);

  // If stuck, flip strafe side & force clean path recompute
  if (isStuck) {
    bot.botStrafeDir = -(bot.botStrafeDir || (Math.random() > 0.5 ? 1 : -1));
    bot.botPath = undefined;
    bot.botRepathTimer = 0;
  }

  bot.botRepathTimer = (bot.botRepathTimer ?? 0) - dt;

  // Check if direct clear corridor exists and we aren't actively skirting around the killer
  const avoidTooClose =
    options.avoidPos &&
    Math.hypot(options.avoidPos.x - bot.x, options.avoidPos.y - bot.y) < options.avoidPos.radius * 0.9;

  const directClear =
    !isStuck &&
    !avoidTooClose &&
    hasWalkableLine(state.tiles, state.cols, state.rows, bot.x, bot.y, goal.x, goal.y, pad);

  if (directClear) {
    bot.botPath = [{ x: goal.x, y: goal.y }];
  } else if (!bot.botPath || bot.botPath.length === 0 || (bot.botRepathTimer ?? 0) <= 0) {
    bot.botPath = findPathWaypoints(
      state.tiles,
      state.cols,
      state.rows,
      bot.x,
      bot.y,
      goal.x,
      goal.y,
      {
        avoidPos: options.avoidPos,
        blockedDoors: options.blockedDoors,
        blockedBarricades: options.blockedBarricades,
        pad,
      }
    );
    bot.botRepathTimer = options.repathInterval ?? 0.65;
  }

  // Advance waypoint chain cleanly
  while (bot.botPath && bot.botPath.length > 1) {
    const wp = bot.botPath[0];
    if (Math.hypot(wp.x - bot.x, wp.y - bot.y) < 28) {
      bot.botPath.shift();
    } else {
      break;
    }
  }

  const nextWp = (bot.botPath && bot.botPath[0]) || { x: goal.x, y: goal.y };
  bot.botTargetPos = nextWp;

  if (isStuck) {
    // Slide perpendicularly around the obstacle corner while aiming toward next waypoint
    const toWp = Math.atan2(nextWp.y - bot.y, nextWp.x - bot.x);
    const dir = bot.botStrafeDir || 1;
    const slideAng = toWp + dir * (Math.PI * 0.42);
    steerToward(input, bot, bot.x + Math.cos(slideAng) * 90, bot.y + Math.sin(slideAng) * 90);
  } else {
    steerToward(input, bot, nextWp.x, nextWp.y);
  }

  return nextWp;
}

function getAllFacilityAnchors(state: GameState): { x: number; y: number; weight: number }[] {
  return [
    // Cages & mid-corridors have multiple exits (great for kiting!)
    ...state.cages.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2, weight: 95 })),
    // Rooms give cover & doors
    ...state.rooms.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, weight: 40 })),
    // Wide outer loop intersections to avoid getting cornered
    { x: 24 * TILE_SIZE, y: 16 * TILE_SIZE, weight: 70 },
    { x: 50 * TILE_SIZE, y: 16 * TILE_SIZE, weight: 70 },
    { x: 24 * TILE_SIZE, y: 36 * TILE_SIZE, weight: 70 },
    { x: 50 * TILE_SIZE, y: 36 * TILE_SIZE, weight: 70 },
  ];
}

function pickBestFleeAnchor(
  state: GameState,
  bot: PlayerState,
  killer: PlayerState
): { x: number; y: number } {
  const anchors = getAllFacilityAnchors(state);
  const toKillerX = killer.x - bot.x;
  const toKillerY = killer.y - bot.y;
  const kLen = Math.max(1, Math.hypot(toKillerX, toKillerY));
  const kx = toKillerX / kLen;
  const ky = toKillerY / kLen;

  let best = anchors[0];
  let bestScore = -Infinity;

  for (const a of anchors) {
    const db = Math.hypot(a.x - bot.x, a.y - bot.y);
    if (db < 130) continue; // Never pick where we already are
    const dk = Math.hypot(a.x - killer.x, a.y - killer.y);

    const ax = (a.x - bot.x) / Math.max(1, db);
    const ay = (a.y - bot.y) / Math.max(1, db);
    // Negative dot means moving away from killer; positive means moving toward killer!
    const dirDot = ax * kx + ay * ky;

    // Penalize moving toward the killer, reward distance from killer and multi-exit hubs
    const score = dk * 1.15 - db * 0.34 - dirDot * 440 + a.weight;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return { x: best.x, y: best.y };
}

// Human-like Strategic AI Bot decision generator (Noob / Normal / Pro tiers + fair stamina)
export function computeBotInput(state: GameState, bot: PlayerState, dt: number): PlayerInput {
  const input = emptyInput(bot.angle);
  if (bot.dead) return input;

  const tier: BotTier = bot.botTier ?? 'pro';
  const isNoob = tier === 'noob';
  const isNormal = tier === 'normal';

  // Update periodic mistake & random-skill timers for Noob / Normal bots
  if (bot.botRandomSkillTimer === undefined) {
    bot.botRandomSkillTimer = 2.0 + Math.random() * 3.5;
  } else {
    bot.botRandomSkillTimer -= dt;
  }
  if (bot.botMistakeTimer === undefined) {
    bot.botMistakeTimer = 1.5 + Math.random() * 2.0;
    bot.botMistakeActive = false;
  } else {
    bot.botMistakeTimer -= dt;
    if (bot.botMistakeTimer <= 0) {
      if (bot.role === 'killer') {
        if (isNoob) {
          bot.botMistakeActive = Math.random() < 0.8;
          bot.botMistakeTimer = 1.3 + Math.random() * 1.4;
        } else if (isNormal) {
          bot.botMistakeActive = Math.random() < 0.58;
          bot.botMistakeTimer = 1.2 + Math.random() * 1.4;
        } else {
          bot.botMistakeActive = Math.random() < 0.36;
          bot.botMistakeTimer = 1.4 + Math.random() * 1.6;
        }
      } else {
        if (isNoob) {
          bot.botMistakeActive = Math.random() < 0.68;
          bot.botMistakeTimer = 1.2 + Math.random() * 1.4;
        } else if (isNormal) {
          bot.botMistakeActive = Math.random() < 0.42;
          bot.botMistakeTimer = 1.0 + Math.random() * 1.5;
        } else {
          bot.botMistakeActive = Math.random() < 0.16;
          bot.botMistakeTimer = 1.5 + Math.random() * 1.8;
        }
      }
    }
  }

  // Helper for noisy / imprecise aim based on tier
  const aimJitter = isNoob ? 0.52 : isNormal ? 0.28 : 0.1;
  const jitterAngle = (ang: number) =>
    aimJitter > 0 ? ang + (Math.random() - 0.5) * 2 * aimJitter : ang;

  // Anti-stuck tracker
  if (bot.botLastX !== undefined && bot.botLastY !== undefined) {
    const moved = Math.hypot(bot.x - bot.botLastX, bot.y - bot.botLastY);
    if (moved < 32 * dt && bot.stunTimer <= 0 && !bot.trappedById && !bot.channel) {
      bot.botStuckTimer = (bot.botStuckTimer ?? 0) + dt;
    } else {
      bot.botStuckTimer = 0;
    }
  }
  bot.botLastX = bot.x;
  bot.botLastY = bot.y;

  const isStuck = (bot.botStuckTimer ?? 0) > (isNoob ? 0.65 : 0.38);
  const killer = state.players.find((p) => p.role === 'killer');
  const aliveSurvivors = state.players.filter((p) => p.role === 'survivor' && !p.dead);

  // Flashlight / Flash blindness: ALL bots (killer & survivor) wander randomly like disoriented humans!
  const isFlashBlinded = (bot.flashBlindTimer ?? 0) > 0;
  if (
    isFlashBlinded &&
    bot.stunTimer <= 0 &&
    !bot.trappedById &&
    (bot.chainsawStuckTimer ?? 0) <= 0
  ) {
    bot.botBlindWanderTimer = (bot.botBlindWanderTimer ?? 0) - dt;
    if ((bot.botBlindWanderTimer ?? 0) <= 0 || bot.botBlindWanderAngle === undefined || isStuck) {
      // Pick a random direction favoring open space so the bot moves organically instead of hugging one wall pixel
      let chosenAngle = Math.random() * Math.PI * 2;
      let bestFree = -1;
      for (let attempt = 0; attempt < 6; attempt++) {
        const cand = Math.random() * Math.PI * 2;
        const probeX = bot.x + Math.cos(cand) * 75;
        const probeY = bot.y + Math.sin(cand) * 75;
        const clear = hasWalkableLine(state.tiles, state.cols, state.rows, bot.x, bot.y, probeX, probeY, bot.radius);
        const score = (clear ? 100 : 0) + Math.random() * 40;
        if (score > bestFree) {
          bestFree = score;
          chosenAngle = cand;
        }
      }
      bot.botBlindWanderAngle = chosenAngle;
      bot.botBlindWanderTimer = 0.32 + Math.random() * 0.42;
    }

    const wandAng = bot.botBlindWanderAngle;
    const dx = Math.cos(wandAng);
    const dy = Math.sin(wandAng);
    if (dx > 0.3) input.right = true;
    else if (dx < -0.3) input.left = true;
    if (dy > 0.3) input.down = true;
    else if (dy < -0.3) input.up = true;
    input.angle = wandAng + Math.sin(state.elapsed * 5.5 + bot.x * 0.02) * 0.35;

    if (!bot.downed && !bot.staminaExhausted && !bot.botSprintResting && bot.stamina > 12) {
      input.sprint = Math.sin(state.elapsed * 3.1) > -0.2;
    }

    // Blinded killer swings blindly at empty air occasionally instead of laser-aiming
    if (bot.role === 'killer' && bot.killerId !== 'sawblooder' && bot.cdAttack <= 0 && Math.random() < 0.03) {
      input.attack = true;
    }
    return input;
  }

  // Stamina depletion & recovery cycle for ALL bots (killers & survivors):
  // Once stamina hits 0 / exhausted, bot enters rest mode so stamina visibly regenerates
  // back up instead of oscillating between 0 and 30.
  if (bot.stamina <= 0 || bot.staminaExhausted) {
    bot.botSprintResting = true;
  } else if (bot.botSprintResting) {
    const recoverTarget =
      bot.role === 'killer'
        ? isNoob
          ? 85
          : isNormal
          ? 92
          : 96
        : isNoob
        ? 55
        : isNormal
        ? 68
        : Math.round(bot.maxStamina * 0.72);
    if (bot.stamina >= Math.min(bot.maxStamina, recoverTarget)) {
      bot.botSprintResting = false;
    }
  }

  // =========================================================================
  // KILLER BOT AI (Kolay = noob, Orta = normal, Zor = pro + Human Stamina)
  // =========================================================================
  if (bot.role === 'killer') {
    const setKillerAttack = () => {
      if (bot.killerId === 'sawblooder') {
        input.attackHeld = true;
      } else if (bot.cdAttack <= 0) {
        input.attack = true;
      }
    };

    // Smooth human-like aim variance instead of 60Hz jitter
    const smoothAimNoise = (ang: number, scale: number) =>
      scale > 0 ? ang + Math.sin(state.elapsed * 2.4 + bot.x * 0.01) * scale : ang;

    // 1. Trapped by Trapper Q -> immediately hold F to escape (1.5s)!
    if (bot.trappedById) {
      input.holdF = true;
      return input;
    }

    // 1.5 If Sawblooder saw is jammed/stuck into wall for 2s, freeze
    if (bot.killerId === 'sawblooder' && (bot.chainsawStuckTimer ?? 0) > 0) {
      return input;
    }

    // 1.75 If Sawblooder chainsaw malfunctioned, hold F to repair while continuing to walk
    if (bot.killerId === 'sawblooder' && bot.sawMalfunction) {
      input.holdF = true;
    }

    // 1.8 Hunter Bot: teleport with F when seal alert fires & survivor is not right next to Hunter
    if (bot.killerId === 'hunter' && (bot.hunterAlertTimer ?? 0) > 0 && !bot.trappedById) {
      const alerted = bot.hunterAlertTargetId
        ? aliveSurvivors.find((s) => s.id === bot.hunterAlertTargetId)
        : undefined;
      const alertDist = alerted ? Math.hypot(alerted.x - bot.x, alerted.y - bot.y) : 999;
      if (alertDist > 165 && (!isNoob || Math.random() < 0.25)) {
        input.holdF = true;
        return input;
      }
    }

    // 2. Continue breaking wood barricade if already channeling
    if (bot.channel?.type === 'break_barricade') {
      input.holdF = true;
      return input;
    }

    // 2.5 If Sawblooder is actively chainsaw rushing, steer smoothly toward target
    if (bot.chainsawChargeTimer && bot.chainsawChargeTimer > 0) {
      const nearestSurv = [...aliveSurvivors].sort(
        (a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y)
      )[0];
      if (nearestSurv) {
        input.angle = Math.atan2(nearestSurv.y - bot.y, nearestSurv.x - bot.x);
      }
      return input;
    }

    const darknessPhasing = (bot.darknessModeTimer ?? 0) > 0 || bot.dashKind === 'darkness_e';

    // 3. Break nearby Builder wood barricade with Hungry E or F (skipped when Darkness phases through walls)
    if (!darknessPhasing) {
      const nearWood = state.barricades.find(
        (b) => b.kind === 'wood' && Math.hypot(b.x + b.w / 2 - bot.x, b.y + b.h / 2 - bot.y) < 82
      );
      if (nearWood) {
        input.angle = Math.atan2(nearWood.y + nearWood.h / 2 - bot.y, nearWood.x + nearWood.w / 2 - bot.x);
        if (!isNoob && bot.killerId === 'hungry' && bot.cdE <= 0) input.useE = true;
        else input.holdF = true;
        return input;
      }

      // 4. Break nearby locked door
      const nearLockedDoor = state.doors.find(
        (d) =>
          d.locked &&
          !d.broken &&
          distToRect(bot.x, bot.y, d.x, d.y, d.w, d.h) < 62
      );
      if (nearLockedDoor) {
        input.angle = Math.atan2(
          nearLockedDoor.y + nearLockedDoor.h / 2 - bot.y,
          nearLockedDoor.x + nearLockedDoor.w / 2 - bot.x
        );
        if (!isNoob && bot.killerId === 'hungry' && bot.cdE <= 0) input.useE = true;
        else setKillerAttack();
        return input;
      }
    }

    // 5. Destroy nearby Builder turret (never attempt to attack through walls/bars)
    const nearTurret = state.turrets.find(
      (t) =>
        Math.hypot(t.x - bot.x, t.y - bot.y) < 82 &&
        hasWalkableLine(state.tiles, state.cols, state.rows, bot.x, bot.y, t.x, t.y, 0)
    );
    if (nearTurret) {
      const tDist = Math.hypot(nearTurret.x - bot.x, nearTurret.y - bot.y);
      input.angle = Math.atan2(nearTurret.y - bot.y, nearTurret.x - bot.x);
      if (tDist > 34) {
        steerToward(input, bot, nearTurret.x, nearTurret.y);
      }
      setKillerAttack();
      return input;
    }

    // 5b. Seek and destroy harassing Builder turret if visible (never target turrets behind walls)
    const woodBarsForTurret = state.barricades.filter((b) => b.kind === 'wood');
    const nearestSurvivorDist = aliveSurvivors.reduce(
      (minD, s) => Math.min(minD, Math.hypot(s.x - bot.x, s.y - bot.y)),
      Infinity
    );
    const turretHuntRange = isNoob ? 105 : isNormal ? 180 : 250;
    const harassingTurret = !bot.botMistakeActive
      ? state.turrets
          .filter((t) => {
            const d = Math.hypot(t.x - bot.x, t.y - bot.y);
            if (d > turretHuntRange) return false;
            return hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, t.x, t.y);
          })
          .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0]
      : undefined;

    if (harassingTurret && nearestSurvivorDist > 120) {
      assignBotGoal(bot, 'hunt', harassingTurret.x, harassingTurret.y, state.elapsed + 2.0, harassingTurret.id);
      followBotGoal(state, bot, input, dt, isStuck, {
        blockedBarricades: woodBarsForTurret,
        repathInterval: 0.9,
        pad: 22,
      });
      input.angle = Math.atan2(harassingTurret.y - bot.y, harassingTurret.x - bot.x);
      input.sprint = false;
      return input;
    }

    // 6. Hungry E wall breach if stuck against an inner wall (Orta & Zor)
    if (!isNoob && isStuck && bot.killerId === 'hungry' && bot.cdE <= 0) {
      input.useE = true;
    }

    // 7. Fair Perception + Target Selection (no global wallhack across facility!)
    let target: PlayerState | null = null;
    const allAliveDowned = aliveSurvivors.length > 0 && aliveSurvivors.every((s) => s.downed);
    const attackableSurvivors = allAliveDowned
      ? aliveSurvivors
      : aliveSurvivors.filter((s) => (!s.downed || s.downVulnerable) && !s.carriedById);
    const targetPool = attackableSurvivors.length > 0 ? attackableSurvivors : aliveSurvivors;

    const visionRange = isNoob ? 390 : isNormal ? 520 : 660;
    const senseRange = isNoob ? 195 : isNormal ? 300 : 410;

    const lockedTarget =
      bot.botGoal?.kind === 'hunt' &&
      bot.botGoal.until > state.elapsed &&
      bot.botGoal.targetId
        ? targetPool.find((s) => s.id === bot.botGoal!.targetId && (s.shadowInvisTimer ?? 0) <= 0) ?? null
        : null;

    const canPerceive = (s: PlayerState) => {
      if ((s.shadowInvisTimer ?? 0) > 0) return false;
      const d = Math.hypot(s.x - bot.x, s.y - bot.y);
      if (d <= senseRange) return true;
      if (d <= visionRange && hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, s.x, s.y)) {
        return true;
      }
      // Sprinting survivors make noise slightly further away
      if ((Math.hypot(s.vx, s.vy) > 185) && d <= senseRange + 130) {
        return true;
      }
      return false;
    };

    const perceivedTargets = targetPool.filter(canPerceive);

    let bestScore = Infinity;
    for (const s of perceivedTargets) {
      const d = Math.hypot(s.x - bot.x, s.y - bot.y);
      let score = d;
      if (isNoob) {
        if (lockedTarget && lockedTarget.id === s.id) {
          score -= 90;
        }
      } else {
        if (s.downed && (s.downVulnerable || allAliveDowned)) {
          score -= 140;
        } else if (s.downed) {
          score += 500;
        } else {
          score -= (1 - s.hp / s.maxHp) * 90;
          if (lockedTarget && lockedTarget.id === s.id) {
            score -= 170;
          }
        }
      }
      if (score < bestScore) {
        bestScore = score;
        target = s;
      }
    }

    if (target) {
      const bestDist = Math.hypot(target.x - bot.x, target.y - bot.y);
      const memorySecs = isNoob ? 1.6 : isNormal ? 2.6 : 3.6;

      // Track chase progress to break infinite loops
      if (bot.botLastChaseTargetId !== target.id) {
        bot.botLastChaseTargetId = target.id;
        bot.botLastChaseDist = bestDist;
        bot.botChaseStagnantTimer = 0;
        bot.botBreakBarricadeId = undefined;
      } else if (bestDist < 88 || bestDist < (bot.botLastChaseDist ?? bestDist) - 24) {
        bot.botLastChaseDist = Math.min(bot.botLastChaseDist ?? bestDist, bestDist);
        bot.botChaseStagnantTimer = Math.max(0, (bot.botChaseStagnantTimer ?? 0) - dt * 1.5);
      } else if (bestDist < 380) {
        bot.botChaseStagnantTimer = (bot.botChaseStagnantTimer ?? 0) + dt;
      }

      const loopThreshold = isNoob ? 6.0 : isNormal ? 4.2 : 2.8;
      const isLooping = (bot.botChaseStagnantTimer ?? 0) > loopThreshold;

      // Detect any wood barricade near the direct chase corridor between Killer and Target
      const woodBars = state.barricades.filter((b) => b.kind === 'wood');
      let blockingBar =
        bot.botBreakBarricadeId
          ? woodBars.find((b) => b.id === bot.botBreakBarricadeId)
          : undefined;

      if (!blockingBar && !isNoob && bestDist < 320) {
        const segLen = Math.max(1, bestDist);
        const ux = (target.x - bot.x) / segLen;
        const uy = (target.y - bot.y) / segLen;
        blockingBar = woodBars.find((b) => {
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          const db = Math.hypot(bx - bot.x, by - bot.y);
          if (db > 190) return false;
          const proj = (bx - bot.x) * ux + (by - bot.y) * uy;
          if (proj < -20 || proj > segLen + 20) return false;
          const perp = Math.abs((bx - bot.x) * -uy + (by - bot.y) * ux);
          return perp < 62;
        });
      }

      // If a wood barricade is creating a loop, smash it directly OR occasionally counter with ability
      if (blockingBar && !darknessPhasing && (isLooping || bestDist > 105)) {
        const bx = blockingBar.x + blockingBar.w / 2;
        const by = blockingBar.y + blockingBar.h / 2;
        const db = Math.hypot(bx - bot.x, by - bot.y);
        const los = hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, target.x, target.y);

        if (!bot.botMistakeActive && (bot.botRandomSkillTimer ?? 0) <= 0) {
          if (bot.killerId === 'darkness' && bot.cdR <= 0) {
            input.useR = true;
            bot.botRandomSkillTimer = isNormal ? 2.4 : 1.3;
            steerToward(input, bot, target.x, target.y);
            return input;
          }
          if (bot.killerId === 'jumper' && bot.cdR <= 0 && bestDist < 200) {
            input.angle = smoothAimNoise(predictAimAngle(bot, target, 380), isNormal ? 0.28 : 0.16);
            input.useR = true;
            bot.botRandomSkillTimer = isNormal ? 2.4 : 1.3;
            bot.botChaseStagnantTimer = 0;
            return input;
          }
          if (bot.killerId === 'hungry' && bot.cdQ <= 0 && los && bestDist < 400) {
            input.angle = smoothAimNoise(predictAimAngle(bot, target, 680), isNormal ? 0.28 : 0.16);
            input.useQ = true;
            bot.botRandomSkillTimer = isNormal ? 2.4 : 1.3;
          }
          if (bot.killerId === 'juggernaut' && bot.cdE <= 0 && los && bestDist < 420) {
            input.angle = smoothAimNoise(predictAimAngle(bot, target, 820), isNormal ? 0.28 : 0.16);
            input.useE = true;
            bot.botRandomSkillTimer = isNormal ? 2.4 : 1.3;
          }
        }

        bot.botBreakBarricadeId = blockingBar.id;
        if (db < 82) {
          input.angle = Math.atan2(by - bot.y, bx - bot.x);
          if (bot.killerId === 'hungry' && bot.cdE <= 0) input.useE = true;
          else input.holdF = true;
          return input;
        }
        assignBotGoal(bot, 'hunt', bx, by, state.elapsed + 2.5, blockingBar.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          repathInterval: 0.9,
          pad: 22,
        });
        input.sprint = false;
        return input;
      }

      assignBotGoal(bot, 'hunt', target.x, target.y, state.elapsed + memorySecs, target.id);

      let moveWp = { x: target.x, y: target.y };
      if (darknessPhasing) {
        steerToward(input, bot, target.x, target.y);
      } else {
        moveWp = followBotGoal(state, bot, input, dt, isStuck, {
          blockedBarricades: isLooping ? undefined : woodBars,
          repathInterval: isNoob ? 1.6 : isNormal ? 1.2 : 0.92,
          pad: 22,
        });
      }

      const walkableDirect = hasWalkableLine(
        state.tiles,
        state.cols,
        state.rows,
        bot.x,
        bot.y,
        target.x,
        target.y,
        22
      );
      const los = hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, target.x, target.y);

      const aimAngle = isNoob
        ? smoothAimNoise(Math.atan2(target.y - bot.y, target.x - bot.x), 0.5)
        : isNormal
        ? smoothAimNoise(predictAimAngle(bot, target, 620), 0.34)
        : smoothAimNoise(predictAimAngle(bot, target, 620), 0.22);

      if (los && bestDist < 420) {
        input.angle = aimAngle;
      } else {
        input.angle = Math.atan2(moveWp.y - bot.y, moveWp.x - bot.x);
      }

      // Fair Killer Stamina Economy: slows down & pauses sprint during mistake windows
      const cannotSprintNow =
        bot.hitRecoveryTimer > 0 ||
        bot.stunTimer > 0 ||
        (bot.chainsawStuckTimer ?? 0) > 0 ||
        bot.trappedById !== null ||
        bot.staminaExhausted ||
        Boolean(bot.botSprintResting) ||
        Boolean(bot.botMistakeActive) ||
        (bot.slowTimer > 0 && bot.slowAmount >= 0.35) ||
        Boolean(bot.channel);

      if (cannotSprintNow) {
        input.sprint = false;
      } else if (isNoob) {
        if (los && bestDist > 85 && bestDist < 380) {
          input.sprint = true;
        }
      } else if (isNormal) {
        if (bestDist > 68 && bestDist < 520 && (los || bestDist < 230)) {
          input.sprint = true;
        }
      } else {
        const juggInvisAmbush = bot.killerId === 'juggernaut' && bot.invisibleTimer > 0;
        if (bestDist > 58 && bestDist < 640 && (los || bestDist < 300 || juggInvisAmbush)) {
          input.sprint = true;
        }
      }

      // Direct melee attack (reduced reach & human hesitation/aim drift so players can juke!)
      const attackReach =
        bot.killerId === 'sawblooder'
          ? isNoob
            ? 58
            : isNormal
            ? 66
            : 72
          : isNoob
          ? 54
          : isNormal
          ? 62
          : 68;
      const meleeMissSkip =
        Boolean(bot.botMistakeActive) &&
        Math.random() < (isNoob ? 0.72 : isNormal ? 0.54 : 0.34);

      if (bestDist < attackReach && !meleeMissSkip) {
        const swingAngle = smoothAimNoise(
          Math.atan2(target.y - bot.y, target.x - bot.x),
          isNoob ? 0.52 : isNormal ? 0.33 : 0.2
        );
        if (bot.killerId === 'sawblooder') {
          input.angle = swingAngle;
          input.attackHeld = true;
        } else if (bot.cdAttack <= 0) {
          input.angle = swingAngle;
          input.attack = true;
        }
      }

      // Kolay (noob): rare sloppy / delayed ability usage
      if (isNoob) {
        if ((bot.botRandomSkillTimer ?? 0) <= 0 && !bot.botMistakeActive && los && bestDist < 265) {
          bot.botRandomSkillTimer = 5.4 + Math.random() * 3.8;
          input.angle = smoothAimNoise(Math.atan2(target.y - bot.y, target.x - bot.x), 0.46);
          const roll = Math.random();
          if (roll < 0.4 && bot.cdQ <= 0) input.useQ = true;
          else if (roll < 0.75 && bot.cdE <= 0) input.useE = true;
          else if (bot.cdR <= 0) input.useR = true;
        }
        return input;
      }

      // Orta (normal) & Zor (pro): spaced-out, non-instant ability usage with imperfect aim
      if (!bot.botMistakeActive && (bot.botRandomSkillTimer ?? 0) <= 0) {
        let usedAbility = false;
        if (bot.killerId === 'jumper') {
          if ((walkableDirect || isLooping) && bestDist > 85 && bestDist < 210 && bot.cdQ <= 0) {
            input.angle = aimAngle;
            input.useQ = true;
            usedAbility = true;
          } else if (walkableDirect && bestDist > 130 && bestDist < 320 && bot.cdE <= 0) {
            input.angle = aimAngle;
            input.useE = true;
            usedAbility = true;
          } else if (bestDist > 75 && bestDist < 195 && bot.cdR <= 0) {
            input.angle = aimAngle;
            input.useR = true;
            usedAbility = true;
          }
        } else if (bot.killerId === 'juggernaut') {
          if (walkableDirect && bestDist > 75 && bestDist < 260 && bot.cdQ <= 0) {
            input.angle = aimAngle;
            input.useQ = true;
            usedAbility = true;
          } else if (los && bestDist > 110 && bestDist < 400 && bot.cdE <= 0) {
            input.angle = smoothAimNoise(predictAimAngle(bot, target, 820), isNormal ? 0.28 : 0.15);
            input.useE = true;
            usedAbility = true;
          } else if (bestDist > 240 && bestDist < 440 && bot.stamina >= 55 && bot.cdR <= 0) {
            input.useR = true;
            usedAbility = true;
          }
        } else if (bot.killerId === 'smile') {
          if (los && bestDist > 90 && bestDist < 420 && bot.cdQ <= 0) {
            input.angle = smoothAimNoise(predictAimAngle(bot, target, 680), isNormal ? 0.28 : 0.15);
            input.useQ = true;
            usedAbility = true;
          } else if (bestDist < 220 && bot.cdE <= 0) {
            input.useE = true;
            usedAbility = true;
          } else if (bestDist < 520 && state.smileMinions.length === 0 && bot.cdR <= 0) {
            input.useR = true;
            usedAbility = true;
          }
        } else if (bot.killerId === 'hungry') {
          if (los && bestDist > 100 && bestDist < 400 && bot.cdQ <= 0) {
            input.angle = smoothAimNoise(predictAimAngle(bot, target, 680), isNormal ? 0.28 : 0.15);
            input.useQ = true;
            usedAbility = true;
          } else if (bestDist < 84 && bot.cdE <= 0) {
            input.angle = smoothAimNoise(Math.atan2(target.y - bot.y, target.x - bot.x), 0.2);
            input.useE = true;
            usedAbility = true;
          } else if (los && bestDist > 110 && bestDist < 320 && bot.cdR <= 0) {
            input.useR = true;
            usedAbility = true;
          }
        } else if (bot.killerId === 'sawblooder' && !bot.sawMalfunction) {
          if (walkableDirect && bestDist > 120 && bestDist < 340 && bot.cdQ <= 0) {
            input.angle = aimAngle;
            input.useQ = true;
            usedAbility = true;
          } else if (walkableDirect && bestDist > 130 && bestDist < 390 && bot.cdE <= 0) {
            input.angle = aimAngle;
            input.useE = true;
            usedAbility = true;
          } else if (los && bestDist < 230 && bot.cdR <= 0) {
            input.useR = true;
            usedAbility = true;
          }
        } else if (bot.killerId === 'darkness') {
          if (bot.cdQ <= 0 && bestDist > 420) {
            const nearVent = state.vents.find(
              (v) => !v.broken && Math.hypot(v.x - bot.x, v.y - bot.y) <= 78
            );
            if (nearVent) {
              const destVent = state.vents
                .filter((v) => !v.broken && v.id !== nearVent.id)
                .sort(
                  (a, b) =>
                    Math.hypot(a.x - target.x, a.y - target.y) -
                    Math.hypot(b.x - target.x, b.y - target.y)
                )[0];
              if (destVent && Math.hypot(destVent.x - target.x, destVent.y - target.y) + 200 < bestDist) {
                input.useQ = true;
                input.ventTargetId = destVent.id;
                usedAbility = true;
              }
            }
          }
          if (!input.useQ && bot.cdR <= 0 && (isLooping || (!walkableDirect && bestDist > 130 && bestDist < 380))) {
            input.useR = true;
            usedAbility = true;
          } else if (
            !input.useQ &&
            bot.cdE <= 0 &&
            bestDist > 115 &&
            bestDist < 420 &&
            (!walkableDirect || bestDist > 175)
          ) {
            input.angle = smoothAimNoise(
              Math.atan2(target.y - bot.y, target.x - bot.x),
              isNormal ? 0.3 : 0.18
            );
            input.useE = true;
            usedAbility = true;
          }
        } else if (bot.killerId === 'hunter') {
          if (
            bot.hunterShotgunReady &&
            (bot.hunterShotgunRecoverTimer ?? 0) <= 0 &&
            los &&
            bestDist < 360
          ) {
            input.angle = smoothAimNoise(
              Math.atan2(target.y - bot.y, target.x - bot.x),
              isNormal ? 0.22 : 0.1
            );
            input.attack = true;
            usedAbility = true;
          } else if (
            !bot.hunterShotgunReady &&
            (bot.hunterShotgunRecoverTimer ?? 0) <= 0 &&
            bot.cdR <= 0 &&
            los &&
            bestDist > 95 &&
            bestDist < 340
          ) {
            input.useR = true;
            usedAbility = true;
          } else if (bot.cdE <= 0) {
            const nearUnsealed =
              (state.chests || []).some((ch) => !ch.opened && !ch.sealedByHunter && Math.hypot(ch.x - bot.x, ch.y - bot.y) <= 92) ||
              (state.crops || []).some((cr) => !cr.sealedByHunter && Math.hypot(cr.x - bot.x, cr.y - bot.y) <= 92) ||
              state.doors.some((d) => !d.broken && !d.sealedByHunter && distToRect(bot.x, bot.y, d.x, d.y, d.w, d.h) <= 92) ||
              state.vents.some((v) => !v.broken && !v.sealedByHunter && Math.hypot(v.x - bot.x, v.y - bot.y) <= 92);
            if (nearUnsealed) {
              input.useE = true;
              usedAbility = true;
            }
          }
          if (!usedAbility && bot.cdQ <= 0 && bestDist < 340) {
            input.useQ = true;
            usedAbility = true;
          }
        }

        if (usedAbility) {
          bot.botRandomSkillTimer = isNormal ? 3.2 + Math.random() * 2.5 : 1.8 + Math.random() * 1.8;
        }
      }
      return input;
    }

    // 8. No survivor currently perceived: check last remembered spot briefly, otherwise patrol!
    const hasActiveMemory =
      bot.botGoal?.kind === 'hunt' &&
      bot.botGoal.until > state.elapsed &&
      Math.hypot(bot.botGoal.x - bot.x, bot.botGoal.y - bot.y) > 54;

    if (hasActiveMemory) {
      const wp = followBotGoal(state, bot, input, dt, isStuck, {
        blockedBarricades: woodBarsForTurret,
        repathInterval: 1.15,
        pad: 22,
      });
      input.angle = Math.atan2(wp.y - bot.y, wp.x - bot.x);
      input.sprint = false;
      return input;
    }

    // Patrol random facility rooms/cages when no target is in sight/hearing range
    const hasPatrol =
      bot.botGoal?.kind === 'patrol' &&
      bot.botGoal.until > state.elapsed &&
      Math.hypot(bot.botGoal.x - bot.x, bot.botGoal.y - bot.y) > 58;

    if (!hasPatrol) {
      const anchors = getAllFacilityAnchors(state);
      const farAnchors = anchors.filter((a) => Math.hypot(a.x - bot.x, a.y - bot.y) > 260);
      const pool = farAnchors.length > 0 ? farAnchors : anchors;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      assignBotGoal(bot, 'patrol', pick.x, pick.y, state.elapsed + 6.5);
    }

    const wp = followBotGoal(state, bot, input, dt, isStuck, {
      blockedBarricades: woodBarsForTurret,
      repathInterval: 1.3,
      pad: 22,
    });
    input.angle = Math.atan2(wp.y - bot.y, wp.x - bot.x);
    input.sprint = false;
    return input;
  }

  // =========================================================================
  // SURVIVOR BOT AI (Noob / Normal / Pro Tiers + Fair Human-Like Stamina)
  // =========================================================================
  const killerStealthed = killer
    ? killer.invisibleTimer > 0 || (killer.darknessStealthTimer ?? 0) > 0
    : false;
  const visibleKiller = killer && !killerStealthed ? killer : undefined;
  const distToKiller = visibleKiller ? Math.hypot(visibleKiller.x - bot.x, visibleKiller.y - bot.y) : 9999;
  const killerVisible = visibleKiller ? bot.blindTimer <= 0 || distToKiller < 105 : false;
  const killerLOS =
    visibleKiller && killerVisible && bot.blindTimer <= 0
      ? hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, visibleKiller.x, visibleKiller.y)
      : false;
  const shadowBarricades = state.barricades.filter((b) => b.kind === 'shadow' || b.kind === 'wood');
  const myClass = bot.survivorClass!;

  const canBotSprint =
    !bot.downed &&
    !bot.staminaExhausted &&
    !bot.botSprintResting &&
    !bot.trappedById &&
    !bot.channel;

  // Helper: applies tier-appropriate stamina spending when not in immediate danger
  const maybeSprintSafeTask = () => {
    if (!canBotSprint) return;
    if (isNoob) {
      input.sprint = true; // Noob burns stamina everywhere until exhausted
    } else if (isNormal && bot.stamina > 30) {
      input.sprint = true; // Normal sprints while traveling until low
    } else if (bot.stamina > 55) {
      input.sprint = true; // Pro sprints bursts when stamina is high while traveling
    }
  };

  // Downed survivor bot behavior:
  if (bot.downed) {
    const beingRevived = state.players.some(
      (other) => !other.dead && other.channel?.type === 'revive' && other.channel.targetId === bot.id
    );
    if (beingRevived) {
      return input;
    }

    const healthyBuddy = aliveSurvivors
      .filter((s) => s.id !== bot.id && !s.downed)
      .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];

    if (!bot.downVulnerable && healthyBuddy && !isNoob) {
      const db = Math.hypot(healthyBuddy.x - bot.x, healthyBuddy.y - bot.y);
      if (db > 48) {
        assignBotGoal(bot, 'heal_ally', healthyBuddy.x, healthyBuddy.y, state.elapsed + 1.5, healthyBuddy.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          blockedBarricades: shadowBarricades,
          repathInterval: 0.6,
        });
      }
      return input;
    }
  }

  // Noob bots randomly press abilities for no reason ("alakasız özellik basar")
  if (isNoob && !bot.downed && !bot.channel && (bot.botRandomSkillTimer ?? 0) <= 0) {
    bot.botRandomSkillTimer = 2.6 + Math.random() * 3.4;
    input.angle = bot.angle + (Math.random() - 0.5) * 2.4;
    if (Math.random() < 0.55 && bot.cdQ <= 0) input.useQ = true;
    else if (bot.cdE <= 0) input.useE = true;
  }

  // -------------------------------------------------------------------------
  // Channel Commitment Guards (never accidentally drop a revive/lock/bandage!)
  // -------------------------------------------------------------------------
  if (bot.channel?.type === 'revive') {
    const killerDangerClose =
      visibleKiller &&
      killerVisible &&
      distToKiller < 95 &&
      visibleKiller.stunTimer <= 0.2 &&
      bot.dodgeTimer <= 0 &&
      bot.channel.progress < REVIVE_DURATION_SECONDS - 0.8;
    if (!killerDangerClose) {
      input.holdF = true;
      return input;
    }
  }
  if (bot.channel?.type === 'lock_door') {
    if (!visibleKiller || !killerVisible || distToKiller > 165 || visibleKiller.stunTimer > 0.3) {
      return input;
    }
  }
  if (bot.channel?.type === 'bandage') {
    const patient = aliveSurvivors.find((s) => s.id === bot.channel!.targetId);
    if (patient && (!visibleKiller || distToKiller > 145 || visibleKiller.stunTimer > 0.3)) {
      const dp = Math.hypot(patient.x - bot.x, patient.y - bot.y);
      if (dp > 55) {
        steerToward(input, bot, patient.x, patient.y);
      }
      return input;
    }
  }
  if (bot.channel?.type === 'loot_chest') {
    if (!visibleKiller || !killerVisible || distToKiller > 220) {
      input.holdF = true;
      return input;
    }
  }
  if (bot.channel?.type === 'use_medkit' || bot.channel?.type === 'drink_coffee') {
    if (!visibleKiller || distToKiller > 130) {
      return input;
    }
  }

  // Bot smart item use (Medkit when safe & injured, Shield/Flashlight/Coffee during chase)
  if (!bot.downed && !bot.channel && bot.inventory) {
    const shieldIdx = bot.inventory.findIndex((sl) => sl?.kind === 'shield');
    const flashIdx = bot.inventory.findIndex((sl) => sl?.kind === 'flashlight');
    const coffeeIdx = bot.inventory.findIndex((sl) => sl?.kind === 'coffee');
    const medkitIdx = bot.inventory.findIndex((sl) => sl?.kind === 'medkit');

    if (
      flashIdx >= 0 &&
      visibleKiller &&
      killerVisible &&
      killerLOS &&
      distToKiller < 210 &&
      (visibleKiller.flashBlindTimer ?? 0) <= 0.2 &&
      !isNoob
    ) {
      input.angle = jitterAngle(Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x));
      if (bot.equippedSlot !== flashIdx) {
        input.selectSlot = flashIdx;
      } else {
        input.useItem = true;
      }
      return input;
    }

    if (shieldIdx >= 0 && visibleKiller && distToKiller < 230 && bot.equippedSlot !== shieldIdx) {
      input.selectSlot = shieldIdx;
    }

    if (coffeeIdx >= 0 && visibleKiller && distToKiller < 260 && (bot.coffeeBuffTimer ?? 0) <= 0) {
      if (bot.equippedSlot !== coffeeIdx) {
        input.selectSlot = coffeeIdx;
      } else {
        input.useItem = true;
      }
    } else if (
      medkitIdx >= 0 &&
      bot.hp <= bot.maxHp - 25 &&
      (!visibleKiller || distToKiller > 420)
    ) {
      if (bot.equippedSlot !== medkitIdx) {
        input.selectSlot = medkitIdx;
      } else {
        input.useItem = true;
      }
      return input;
    }
  }

  // -------------------------------------------------------------------------
  // Priority 1: Rescue Downed Teammate (only if killer is VERY FAR and no bot stampede!)
  // -------------------------------------------------------------------------
  const downedAllies = aliveSurvivors
    .filter((s) => s.id !== bot.id && s.downed && !s.carriedById)
    .sort((a, b) => a.bleedoutTimer - b.bleedoutTimer);

  if (downedAllies.length > 0 && !bot.downed) {
    const downedAlly = downedAllies[0];
    const dAlly = Math.hypot(downedAlly.x - bot.x, downedAlly.y - bot.y);
    const killerDistToDowned = visibleKiller ? Math.hypot(visibleKiller.x - downedAlly.x, visibleKiller.y - downedAlly.y) : 9999;

    const alreadyBeingRevived = aliveSurvivors.some(
      (s) =>
        s.id !== bot.id &&
        s.channel?.type === 'revive' &&
        s.channel.targetId === downedAlly.id
    );

    // Pick only the SINGLE closest safe survivor bot to rescue so bots don't rush straight in as a group
    const myEffectiveDist = myClass === 'runner' ? dAlly * 0.85 : dAlly;
    const eligibleRescuerBots = aliveSurvivors
      .filter((s) => {
        if (!s.isBot || s.downed || s.trappedById || s.id === downedAlly.id) return false;
        const sKillerDist = visibleKiller ? Math.hypot(s.x - visibleKiller.x, s.y - visibleKiller.y) : 9999;
        return !visibleKiller || sKillerDist >= 380 || visibleKiller.stunTimer > 0.6;
      })
      .map((s) => {
        const d = Math.hypot(s.x - downedAlly.x, s.y - downedAlly.y);
        return { id: s.id, eff: s.survivorClass === 'runner' ? d * 0.85 : d };
      })
      .sort((a, b) => a.eff - b.eff);

    const bestRescuerId = eligibleRescuerBots[0]?.id;
    const isDesignatedRescuer = bestRescuerId === bot.id;

    // Require killer to be VERY far away from both the downed player and the rescuing bot
    const killerStunned = Boolean(visibleKiller && visibleKiller.stunTimer > 0.6);
    const killerFarFromDowned = !visibleKiller || killerDistToDowned >= 620 || (killerStunned && killerDistToDowned >= 460);
    const killerFarFromMe = !visibleKiller || distToKiller >= 420 || (killerStunned && distToKiller >= 300);

    // Wait briefly after a player goes down (first ~4s) instead of snapping straight toward them immediately
    const justWentDownWait = downedAlly.bleedoutTimer > DOWNED_BLEEDOUT_SECONDS - 4.0 && !downedAlly.downVulnerable;
    const allyCameToMe = dAlly <= 85;
    const safeToReviveHere =
      !visibleKiller ||
      (killerDistToDowned >= 440 && distToKiller >= 360) ||
      killerStunned ||
      bot.dodgeTimer > 0;

    const shouldHeadToRescue =
      !alreadyBeingRevived &&
      (allyCameToMe ||
        (!justWentDownWait &&
          (isDesignatedRescuer || downedAlly.bleedoutTimer < 8 || (downedAlly.downVulnerable && myEffectiveDist < 420))));

    const canRescueNow =
      (allyCameToMe && safeToReviveHere) ||
      (killerFarFromDowned && killerFarFromMe);

    if (shouldHeadToRescue && canRescueNow) {
      if (!isNoob && myClass === 'engineer' && bot.cdQ <= 0 && dAlly > 700) {
        const nearVent = state.vents
          .filter((v) => !v.broken)
          .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
        if (nearVent && Math.hypot(nearVent.x - bot.x, nearVent.y - bot.y) < 220) {
          const destVent = state.vents
            .filter((v) => !v.broken && v.id !== nearVent.id)
            .sort(
              (a, b) =>
                Math.hypot(a.x - nearVent.x, a.y - nearVent.y) -
                Math.hypot(b.x - nearVent.x, b.y - nearVent.y)
            )[0];
          if (destVent && Math.hypot(destVent.x - downedAlly.x, destVent.y - downedAlly.y) + 250 < dAlly) {
            if (Math.hypot(nearVent.x - bot.x, nearVent.y - bot.y) < 70) {
              input.useQ = true;
              return input;
            }
            assignBotGoal(bot, 'vent_escape', nearVent.x, nearVent.y, state.elapsed + 2.0, nearVent.id);
            followBotGoal(state, bot, input, dt, isStuck, { blockedBarricades: shadowBarricades });
            if (canBotSprint) input.sprint = true;
            return input;
          }
        }
      }

      if (dAlly < 70 && safeToReviveHere) {
        input.angle = Math.atan2(downedAlly.y - bot.y, downedAlly.x - bot.x);
        input.holdF = true;
        return input;
      }

      assignBotGoal(bot, 'rescue', downedAlly.x, downedAlly.y, state.elapsed + 2.5, downedAlly.id);
      const wp = followBotGoal(state, bot, input, dt, isStuck, {
        avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: isNoob ? 220 : 380 } : undefined,
        blockedBarricades: shadowBarricades,
        repathInterval: isNoob ? 0.85 : 0.45,
      });

      if (!isNoob && myClass === 'runner' && dAlly > 280) {
        if (bot.cdQ <= 0) {
          input.useQ = true;
        } else if (!isNormal && bot.cdE <= 0 && dAlly > 360) {
          const rushAng = Math.atan2(wp.y - bot.y, wp.x - bot.x);
          const ex = bot.x + Math.cos(rushAng) * 280;
          const ey = bot.y + Math.sin(rushAng) * 280;
          if (
            ex > 80 &&
            ex < state.mapWidth - 80 &&
            ey > 80 &&
            ey < state.mapHeight - 80 &&
            hasWalkableLine(state.tiles, state.cols, state.rows, bot.x, bot.y, ex, ey, 16)
          ) {
            input.angle = rushAng;
            input.useE = true;
          }
        }
      }

      if (canBotSprint) {
        input.sprint = true;
      }
      return input;
    }
  }

  // -------------------------------------------------------------------------
  // Priority 2: Active Chase / Threat Escape & Class Counterplay
  // -------------------------------------------------------------------------
  const threatRange = isNoob ? 230 : isNormal ? 320 : 395;
  const losRange = isNoob ? 280 : isNormal ? 410 : 490;
  const underThreat =
    visibleKiller && killerVisible && (distToKiller < threatRange || (killerLOS && distToKiller < losRange));

  if (underThreat && visibleKiller) {
    // Engineer special: escape via nearby vent if safer! (Normal & Pro)
    if (!isNoob && !bot.botMistakeActive && myClass === 'engineer' && bot.cdQ <= 0 && !bot.downed) {
      const nearVent = state.vents
        .filter((v) => !v.broken)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (nearVent) {
        const dv = Math.hypot(nearVent.x - bot.x, nearVent.y - bot.y);
        const destVent = state.vents
          .filter((v) => !v.broken && v.id !== nearVent.id)
          .sort(
            (a, b) =>
              Math.hypot(a.x - nearVent.x, a.y - nearVent.y) -
              Math.hypot(b.x - nearVent.x, b.y - nearVent.y)
          )[0];
        const destSafe =
          destVent && Math.hypot(destVent.x - visibleKiller.x, destVent.y - visibleKiller.y) > distToKiller + 120;

        if (destSafe && dv < 72) {
          input.useQ = true;
          return input;
        } else if (
          destSafe &&
          dv < 260 &&
          Math.hypot(nearVent.x - visibleKiller.x, nearVent.y - visibleKiller.y) > 105
        ) {
          assignBotGoal(bot, 'vent_escape', nearVent.x, nearVent.y, state.elapsed + 2.0, nearVent.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            blockedBarricades: shadowBarricades,
            repathInterval: 0.4,
          });
          if (canBotSprint) input.sprint = true;
          return input;
        }
      }
    }

    // Flee Goal selection — Noob & mistaking Normal sometimes pick poor escape routes!
    const curGoal = bot.botGoal;
    const killerCloserToGoal =
      curGoal?.kind === 'flee' &&
      Math.hypot(visibleKiller.x - curGoal.x, visibleKiller.y - curGoal.y) <
        Math.hypot(bot.x - curGoal.x, bot.y - curGoal.y) - 35;
    const arrivedAtFlee =
      curGoal?.kind === 'flee' && Math.hypot(curGoal.x - bot.x, curGoal.y - bot.y) < 85;
    const needNewFlee =
      !curGoal ||
      curGoal.kind !== 'flee' ||
      state.elapsed >= curGoal.until ||
      arrivedAtFlee ||
      killerCloserToGoal ||
      isStuck;

    if (needNewFlee) {
      let anchor: { x: number; y: number };
      const pickPoorAnchor =
        (isNoob && Math.random() < 0.72) || (isNormal && bot.botMistakeActive && Math.random() < 0.65);
      if (pickPoorAnchor) {
        const allAnchors = getAllFacilityAnchors(state);
        anchor = allAnchors[Math.floor(Math.random() * Math.max(1, allAnchors.length))] ?? {
          x: state.mapWidth / 2,
          y: state.mapHeight / 2,
        };
      } else {
        anchor = pickBestFleeAnchor(state, bot, visibleKiller);
      }
      assignBotGoal(bot, 'flee', anchor.x, anchor.y, state.elapsed + (isNoob ? 3.4 : 2.6));
    }

    // Noob & mistaking Normal bots sometimes hesitate briefly when killer gets close
    const noobPanicStumble =
      ((isNoob && distToKiller < 185 && bot.botMistakeActive && Math.random() < 0.24) ||
        (isNormal && distToKiller < 135 && bot.botMistakeActive && Math.random() < 0.14));
    let moveWp = { x: bot.x, y: bot.y };
    if (!noobPanicStumble) {
      moveWp = followBotGoal(state, bot, input, dt, isStuck, {
        avoidPos:
          (isNoob || isNormal) && bot.botMistakeActive
            ? undefined
            : { x: visibleKiller.x, y: visibleKiller.y, radius: isNoob ? 190 : isNormal ? 230 : 370 },
        blockedBarricades: shadowBarricades,
        repathInterval: isNoob ? 1.2 : isNormal ? 0.88 : 0.6,
        pad: 13,
      });
    }

    // Real Stamina Usage During Chase: bots sprint to escape until stamina hits 0 & exhausts
    if (canBotSprint) {
      if (isNoob || isNormal) {
        input.sprint = true;
      } else if (distToKiller < 470 || killerLOS) {
        input.sprint = true;
      }
    }

    // Class-specific defensive & trap counterplay during active chase
    if (!bot.downed && !bot.botMistakeActive) {
      if (myClass === 'fighter') {
        const fighterCanQ = (bot.fighterQCharges ?? 0) > 0 && bot.cdQ <= 0;
        if (distToKiller < 74 && fighterCanQ && visibleKiller.stunTimer <= 0) {
          input.angle = jitterAngle(Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x));
          input.useQ = true;
        } else if (!isNoob && distToKiller < 105 && bot.cdE <= 0 && Math.random() < (isNormal ? 0.55 : 0.8)) {
          input.useE = true;
        }
      } else if (myClass === 'runner') {
        if (distToKiller < 310 && bot.cdQ <= 0 && (!isNoob || Math.random() < 0.25)) {
          input.useQ = true;
        } else if (!isNoob && distToKiller < 270 && bot.cdE <= 0 && (!isNormal || !bot.botMistakeActive)) {
          const rushAngle = jitterAngle(Math.atan2(moveWp.y - bot.y, moveWp.x - bot.x));
          const endX = bot.x + Math.cos(rushAngle) * 290;
          const endY = bot.y + Math.sin(rushAngle) * 290;
          if (
            endX > 80 &&
            endX < state.mapWidth - 80 &&
            endY > 80 &&
            endY < state.mapHeight - 80 &&
            hasWalkableLine(state.tiles, state.cols, state.rows, bot.x, bot.y, endX, endY, 16)
          ) {
            input.angle = rushAngle;
            input.useE = true;
          }
        }
      } else if (myClass === 'builder') {
        if (distToKiller < 195 && bot.cdQ <= 0 && (!isNoob || Math.random() < 0.25)) {
          const aimAng = jitterAngle(Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x));
          const horiz = Math.abs(Math.sin(aimAng)) >= Math.abs(Math.cos(aimAng));
          const dw = horiz ? 84 : 24;
          const dh = horiz ? 24 : 84;
          const dx = Math.max(TILE_SIZE, Math.min(state.mapWidth - TILE_SIZE - dw, bot.x + Math.cos(aimAng) * 44 - dw / 2));
          const dy = Math.max(TILE_SIZE, Math.min(state.mapHeight - TILE_SIZE - dh, bot.y + Math.sin(aimAng) * 44 - dh / 2));
          const overlaps = state.doors.some(
            (d) => !d.broken && dx < d.x + d.w && dx + dw > d.x && dy < d.y + d.h && dy + dh > d.y
          );
          if (!overlaps) {
            input.angle = aimAng;
            input.useQ = true;
          }
        } else if (
          !isNoob &&
          distToKiller < 360 &&
          distToKiller > 160 &&
          bot.cdE <= 0 &&
          state.turrets.filter((t) => t.ownerId === bot.id).length < 2
        ) {
          input.angle = jitterAngle(Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x));
          input.useE = true;
        }
      } else if (myClass === 'trapper' && !isNoob) {
        const passingDoor = state.doors.some(
          (d) => !d.broken && Math.hypot(d.x + d.w / 2 - bot.x, d.y + d.h / 2 - bot.y) < 75
        );
        const alreadyTrappedHere = state.traps.some((t) => Math.hypot(t.x - bot.x, t.y - bot.y) < 78);
        if (!alreadyTrappedHere && (passingDoor || (distToKiller > 125 && distToKiller < 260))) {
          if (bot.cdQ <= 0) input.useQ = true;
          else if (bot.cdE <= 0) input.useE = true;
        }
      } else if (myClass === 'doctor') {
        const healThresh = isNoob ? 0.55 : isNormal ? 0.72 : 0.82;
        if (
          (bot.hp < bot.maxHp * healThresh ||
            aliveSurvivors.some(
              (a) => a.id !== bot.id && a.hp < a.maxHp * 0.8 && Math.hypot(a.x - bot.x, a.y - bot.y) < 195
            )) &&
          bot.cdQ <= 0
        ) {
          input.useQ = true;
        }
      } else if (myClass === 'protector') {
        const nearestAlly = aliveSurvivors
          .filter(
            (a) =>
              a.id !== bot.id &&
              Math.hypot(a.x - bot.x, a.y - bot.y) <= PROTECTOR_STAFF_RANGE
          )
          .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
        if (nearestAlly) {
          const killerNearAlly = visibleKiller ? Math.hypot(visibleKiller.x - nearestAlly.x, visibleKiller.y - nearestAlly.y) : 9999;
          if (bot.cdE <= 0 && killerNearAlly < 240 && (nearestAlly.protectedTimer ?? 0) <= 0) {
            input.angle = Math.atan2(nearestAlly.y - bot.y, nearestAlly.x - bot.x);
            input.useE = true;
          } else if (
            bot.cdQ <= 0 &&
            (nearestAlly.shieldHp ?? 0) < 10 &&
            (nearestAlly.hp < nearestAlly.maxHp * 0.85 || nearestAlly.downed || killerNearAlly < 270)
          ) {
            input.angle = Math.atan2(nearestAlly.y - bot.y, nearestAlly.x - bot.x);
            input.useQ = true;
          }
        } else if (distToKiller < 230) {
          if (bot.cdE <= 0 && (bot.protectedTimer ?? 0) <= 0) {
            input.useE = true;
          } else if (bot.cdQ <= 0 && (bot.shieldHp ?? 0) < 10) {
            input.useQ = true;
          }
        }
      } else if (myClass === 'bomber') {
        if (
          distToKiller < 340 &&
          bot.cdQ <= 0 &&
          hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, visibleKiller.x, visibleKiller.y)
        ) {
          input.angle = jitterAngle(Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x));
          input.useQ = true;
        } else if (distToKiller < 200 && distToKiller > 80 && bot.cdE <= 0) {
          input.useE = true;
        }
      } else if (myClass === 'chaplain') {
        if (
          (bot.chaplainKnifeCharges ?? 0) > 0 &&
          bot.cdE <= 0 &&
          visibleKiller.stunTimer <= 0 &&
          distToKiller <= CHAPLAIN_KNIFE_RANGE + visibleKiller.radius - 4 &&
          (!isNoob || Math.random() < 0.65)
        ) {
          input.angle = Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x);
          input.useE = true;
        } else if (bot.cdQ <= 0) {
          const unblessedAlly = aliveSurvivors
            .filter(
              (a) =>
                a.id !== bot.id &&
                !a.blessed &&
                Math.hypot(a.x - bot.x, a.y - bot.y) <= CHAPLAIN_BLESS_RANGE - 10
            )
            .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
          if (unblessedAlly) {
            input.angle = Math.atan2(unblessedAlly.y - bot.y, unblessedAlly.x - bot.x);
            input.useQ = true;
          }
        }
      } else if (myClass === 'farmer') {
        if (
          bot.cdE <= 0 &&
          visibleKiller.stunTimer <= 0 &&
          distToKiller <= FARMER_SCYTHE_RANGE + visibleKiller.radius - 4 &&
          (!isNoob || Math.random() < 0.7)
        ) {
          input.angle = Math.atan2(visibleKiller.y - bot.y, visibleKiller.x - bot.x);
          input.useE = true;
        }
      } else if (myClass === 'shadow') {
        if (bot.cdQ <= 0 && distToKiller < 260 && (!isNoob || Math.random() < 0.65)) {
          input.useQ = true;
        } else if (!isNoob && bot.cdE <= 0 && distToKiller < 185) {
          const dashAng = jitterAngle(Math.atan2(moveWp.y - bot.y, moveWp.x - bot.x));
          const dashDist = SHADOW_DASH_SPEED * SPEED_TO_PX * SHADOW_DASH_DURATION;
          const endX = bot.x + Math.cos(dashAng) * dashDist;
          const endY = bot.y + Math.sin(dashAng) * dashDist;
          if (
            endX > 70 &&
            endX < state.mapWidth - 70 &&
            endY > 70 &&
            endY < state.mapHeight - 70
          ) {
            input.angle = dashAng;
            input.useE = true;
          }
        }
      }
    }
    return input;
  }

  // -------------------------------------------------------------------------
  // Priority 3: Proactive Human-Like Class Macro Strategy (When Killer is Far)
  // -------------------------------------------------------------------------
  if (!bot.downed && !isNoob) {
    // 3A. DOCTOR: Actively find & heal hurt teammates, or escort healthy teammates!
    if (myClass === 'doctor') {
      const hurtAllies = aliveSurvivors
        .filter((s) => s.hp < s.maxHp * (isNormal ? 0.75 : 0.9))
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);

      if (hurtAllies.length > 0) {
        const patient = hurtAllies[0];
        const dp = Math.hypot(patient.x - bot.x, patient.y - bot.y);
        const killerNearPatient = visibleKiller ? Math.hypot(visibleKiller.x - patient.x, visibleKiller.y - patient.y) : 9999;

        if (dp < 190 && bot.cdQ <= 0) {
          input.useQ = true;
          return input;
        }
        if (patient.id !== bot.id && bot.cdE <= 0) {
          if (dp < 145) {
            input.useE = true;
            return input;
          } else if (killerNearPatient > 230) {
            assignBotGoal(bot, 'heal_ally', patient.x, patient.y, state.elapsed + 2.0, patient.id);
            followBotGoal(state, bot, input, dt, isStuck, {
              avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 340 } : undefined,
              blockedBarricades: shadowBarricades,
              repathInterval: isNormal ? 0.7 : 0.55,
            });
            if (canBotSprint && (isNormal || bot.stamina > 45)) input.sprint = true;
            return input;
          }
        } else if (patient.id !== bot.id && killerNearPatient > 260 && dp > 160) {
          assignBotGoal(bot, 'heal_ally', patient.x, patient.y, state.elapsed + 2.0, patient.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 340 } : undefined,
            blockedBarricades: shadowBarricades,
          });
          maybeSprintSafeTask();
          return input;
        }
      }

      if (!isNormal) {
        const buddy = aliveSurvivors
          .filter((s) => s.id !== bot.id && !s.downed && (!visibleKiller || Math.hypot(s.x - visibleKiller.x, s.y - visibleKiller.y) > 400))
          .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
        if (buddy) {
          const db = Math.hypot(buddy.x - bot.x, buddy.y - bot.y);
          if (db > 210) {
            assignBotGoal(bot, 'heal_ally', buddy.x, buddy.y, state.elapsed + 2.5, buddy.id);
            followBotGoal(state, bot, input, dt, isStuck, {
              avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 360 } : undefined,
              blockedBarricades: shadowBarricades,
              repathInterval: 0.8,
            });
            return input;
          }
        }
      }
    }

    // 3B. FIGHTER: Bodyguard teammates who are being threatened/chased!
    const fighterCanAct = ((bot.fighterQCharges ?? 0) > 0 && bot.cdQ <= 0) || bot.cdE <= 0;
    if (myClass === 'fighter' && visibleKiller && fighterCanAct && (!isNormal || !bot.botMistakeActive)) {
      const threatenedAlly = aliveSurvivors
        .filter((s) => s.id !== bot.id && !s.downed && Math.hypot(s.x - visibleKiller.x, s.y - visibleKiller.y) < 360)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (threatenedAlly) {
        const ix = (threatenedAlly.x + visibleKiller.x) / 2;
        const iy = (threatenedAlly.y + visibleKiller.y) / 2;
        assignBotGoal(bot, 'bodyguard', ix, iy, state.elapsed + 1.8, threatenedAlly.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          blockedBarricades: shadowBarricades,
          repathInterval: 0.45,
        });
        if (canBotSprint && (isNormal || bot.stamina > 25)) input.sprint = true;
        return input;
      }
    }

    // 3C. TRAPPER: Proactively travel to high-value untrapped doors to set traps!
    if (myClass === 'trapper' && (bot.cdQ <= 0 || bot.cdE <= 0)) {
      const candidateDoors = state.doors
        .filter((d) => {
          if (d.broken) return false;
          const dx = d.x + d.w / 2;
          const dy = d.y + d.h / 2;
          if (visibleKiller && Math.hypot(dx - visibleKiller.x, dy - visibleKiller.y) < 280) return false;
          return !state.traps.some((t) => Math.hypot(t.x - dx, t.y - dy) < 78);
        })
        .sort((a, b) => {
          const ax = a.x + a.w / 2;
          const ay = a.y + a.h / 2;
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          const aCageBonus = a.id.includes('cage') ? -320 : 0;
          const bCageBonus = b.id.includes('cage') ? -320 : 0;
          return (
            Math.hypot(ax - bot.x, ay - bot.y) +
            aCageBonus -
            (Math.hypot(bx - bot.x, by - bot.y) + bCageBonus)
          );
        });

      const targetDoor =
        (bot.botGoal?.kind === 'place_trap' &&
          bot.botGoal.until > state.elapsed &&
          candidateDoors.find((d) => d.id === bot.botGoal!.targetId)) ||
        candidateDoors[0];

      if (targetDoor) {
        const tx = targetDoor.x + targetDoor.w / 2;
        const ty = targetDoor.y + targetDoor.h / 2;
        const dd = Math.hypot(tx - bot.x, ty - bot.y);
        if (dd < 34) {
          if (bot.cdQ <= 0) input.useQ = true;
          else if (bot.cdE <= 0) input.useE = true;
          bot.botGoal = undefined;
          return input;
        }
        assignBotGoal(bot, 'place_trap', tx, ty, state.elapsed + 4.5, targetDoor.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 340 } : undefined,
          blockedBarricades: shadowBarricades,
          repathInterval: 0.7,
        });
        maybeSprintSafeTask();
        return input;
      }
    }

    // 3D. ENGINEER: Proactively seek high-value unlocked doors away from killer and lock them (3s)
    if (myClass === 'engineer' && bot.cdE <= 0) {
      const candidateDoors = state.doors
        .filter((d) => {
          if (d.broken || d.locked) return false;
          const dx = d.x + d.w / 2;
          const dy = d.y + d.h / 2;
          return !visibleKiller || Math.hypot(dx - visibleKiller.x, dy - visibleKiller.y) > 280;
        })
        .sort((a, b) => {
          const ax = a.x + a.w / 2;
          const ay = a.y + a.h / 2;
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          const aCageBonus = a.id.includes('cage') ? -240 : 0;
          const bCageBonus = b.id.includes('cage') ? -240 : 0;
          return (
            Math.hypot(ax - bot.x, ay - bot.y) +
            aCageBonus -
            (Math.hypot(bx - bot.x, by - bot.y) + bCageBonus)
          );
        });

      const targetDoor =
        (bot.botGoal?.kind === 'lock_door' &&
          bot.botGoal.until > state.elapsed &&
          candidateDoors.find((d) => d.id === bot.botGoal!.targetId)) ||
        candidateDoors[0];

      if (targetDoor) {
        const tx = targetDoor.x + targetDoor.w / 2;
        const ty = targetDoor.y + targetDoor.h / 2;
        const dd = Math.hypot(tx - bot.x, ty - bot.y);
        if (dd < 70) {
          input.useE = true;
          bot.botGoal = undefined;
          return input;
        }
        if (dd < 900) {
          assignBotGoal(bot, 'lock_door', tx, ty, state.elapsed + 4.5, targetDoor.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 340 } : undefined,
            blockedBarricades: shadowBarricades,
            repathInterval: 0.7,
          });
          maybeSprintSafeTask();
          return input;
        }
      }
    }

    // 3E. BUILDER: Place turrets at strategic spots
    if (myClass === 'builder' && bot.cdE <= 0 && state.turrets.filter((t) => t.ownerId === bot.id).length < 2) {
      const turretSpots = [
        { id: 'tur_c_w', x: 28 * TILE_SIZE, y: 25 * TILE_SIZE },
        { id: 'tur_c_e', x: 45 * TILE_SIZE, y: 25 * TILE_SIZE },
        { id: 'tur_c_n', x: 36 * TILE_SIZE, y: 17 * TILE_SIZE },
        { id: 'tur_c_s', x: 36 * TILE_SIZE, y: 34 * TILE_SIZE },
      ].filter(
        (sp) =>
          (!visibleKiller || Math.hypot(sp.x - visibleKiller.x, sp.y - visibleKiller.y) > 280) &&
          !state.turrets.some((t) => Math.hypot(t.x - sp.x, t.y - sp.y) < 180)
      );

      if (turretSpots.length > 0) {
        turretSpots.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y));
        const spot = turretSpots[0];
        const ds = Math.hypot(spot.x - bot.x, spot.y - bot.y);
        if (ds < 58) {
          input.angle = Math.atan2(state.mapHeight / 2 - bot.y, state.mapWidth / 2 - bot.x);
          input.useE = true;
          bot.botGoal = undefined;
          return input;
        }
        assignBotGoal(bot, 'place_turret', spot.x, spot.y, state.elapsed + 5.0, spot.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 340 } : undefined,
          blockedBarricades: shadowBarricades,
          repathInterval: 0.75,
        });
        maybeSprintSafeTask();
        return input;
      }
    }

    // 3F. PROTECTOR: Escort & shield/protect endangered or injured teammates within staff range!
    if (myClass === 'protector' && (bot.cdQ <= 0 || bot.cdE <= 0)) {
      const candidateAlly = aliveSurvivors
        .filter((a) => a.id !== bot.id)
        .sort((a, b) => {
          const aKiller = visibleKiller ? Math.hypot(a.x - visibleKiller.x, a.y - visibleKiller.y) : 9999;
          const bKiller = visibleKiller ? Math.hypot(b.x - visibleKiller.x, b.y - visibleKiller.y) : 9999;
          const aScore = aKiller - (a.maxHp - a.hp) * 2;
          const bScore = bKiller - (b.maxHp - b.hp) * 2;
          return aScore - bScore;
        })[0];
      if (candidateAlly) {
        const da = Math.hypot(candidateAlly.x - bot.x, candidateAlly.y - bot.y);
        const allyThreat = visibleKiller ? Math.hypot(candidateAlly.x - visibleKiller.x, candidateAlly.y - visibleKiller.y) < 330 : false;
        const allyHurt = candidateAlly.hp < candidateAlly.maxHp * 0.8 || candidateAlly.downed;
        if (da <= PROTECTOR_STAFF_RANGE) {
          if (bot.cdE <= 0 && allyThreat && (candidateAlly.protectedTimer ?? 0) <= 0) {
            input.angle = Math.atan2(candidateAlly.y - bot.y, candidateAlly.x - bot.x);
            input.useE = true;
            return input;
          }
          if (bot.cdQ <= 0 && (allyHurt || allyThreat) && (candidateAlly.shieldHp ?? 0) < 10) {
            input.angle = Math.atan2(candidateAlly.y - bot.y, candidateAlly.x - bot.x);
            input.useQ = true;
            return input;
          }
        } else if ((allyThreat || allyHurt) && da < 900) {
          assignBotGoal(bot, 'bodyguard', candidateAlly.x, candidateAlly.y, state.elapsed + 2.0, candidateAlly.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 280 } : undefined,
            blockedBarricades: shadowBarricades,
            repathInterval: 0.65,
          });
          maybeSprintSafeTask();
          return input;
        }
      }
    }

    // 3G. BOMBER: Place hidden bomb traps near doors or cage approaches!
    if (myClass === 'bomber' && bot.cdE <= 0) {
      const candidateDoors = state.doors
        .filter((d) => {
          if (d.broken) return false;
          const dx = d.x + d.w / 2;
          const dy = d.y + d.h / 2;
          if (visibleKiller && Math.hypot(dx - visibleKiller.x, dy - visibleKiller.y) < 280) return false;
          return !state.traps.some((t) => Math.hypot(t.x - dx, t.y - dy) < 78);
        })
        .sort((a, b) => {
          const ax = a.x + a.w / 2;
          const ay = a.y + a.h / 2;
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          return Math.hypot(ax - bot.x, ay - bot.y) - Math.hypot(bx - bot.x, by - bot.y);
        });

      const targetDoor = candidateDoors[0];
      if (targetDoor) {
        const tx = targetDoor.x + targetDoor.w / 2;
        const ty = targetDoor.y + targetDoor.h / 2;
        const dd = Math.hypot(tx - bot.x, ty - bot.y);
        if (dd < 70) {
          input.useE = true;
          return input;
        }
      }
    }

    // 3H. CHAPLAIN: Proactively bless nearby unblessed teammates with Q!
    if (myClass === 'chaplain' && bot.cdQ <= 0) {
      const unblessed = aliveSurvivors
        .filter((a) => a.id !== bot.id && !a.blessed)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (unblessed) {
        const da = Math.hypot(unblessed.x - bot.x, unblessed.y - bot.y);
        if (da <= CHAPLAIN_BLESS_RANGE - 12) {
          input.angle = Math.atan2(unblessed.y - bot.y, unblessed.x - bot.x);
          input.useQ = true;
          return input;
        } else if (da < 680) {
          assignBotGoal(bot, 'bodyguard', unblessed.x, unblessed.y, state.elapsed + 2.0, unblessed.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 280 } : undefined,
            blockedBarricades: shadowBarricades,
            repathInterval: 0.65,
          });
          maybeSprintSafeTask();
          return input;
        }
      }
    }

    // 3I. FARMER: Proactively plant crops when safe!
    if (
      myClass === 'farmer' &&
      bot.cdQ <= 0 &&
      (!visibleKiller || distToKiller > 290) &&
      (state.crops || []).filter((c) => c.ownerId === bot.id).length < 3
    ) {
      input.useQ = true;
      return input;
    }

    // 3J. ANY INJURED SURVIVOR: Harvest nearby ready Farmer crop to heal!
    if (bot.hp <= bot.maxHp - 20 && (!visibleKiller || distToKiller > 320)) {
      const readyCrop = (state.crops || [])
        .filter((cr) => cr.ready && Math.hypot(cr.x - bot.x, cr.y - bot.y) < 420)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (readyCrop) {
        const dc = Math.hypot(readyCrop.x - bot.x, readyCrop.y - bot.y);
        if (dc <= 64) {
          input.holdF = true;
          return input;
        }
        assignBotGoal(bot, 'patrol', readyCrop.x, readyCrop.y, state.elapsed + 3.0, readyCrop.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          avoidPos: visibleKiller ? { x: visibleKiller.x, y: visibleKiller.y, radius: 320 } : undefined,
          blockedBarricades: shadowBarricades,
          repathInterval: 0.7,
        });
        maybeSprintSafeTask();
        return input;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Priority 4: Loot nearby unopened Chest if safe & inventory has free slot
  // -------------------------------------------------------------------------
  if (
    !bot.downed &&
    !isNoob &&
    (!visibleKiller || distToKiller > 440) &&
    (bot.inventory ?? [null, null, null]).some((sl) => !sl)
  ) {
    const openChest = (state.chests || [])
      .filter((c) => !c.opened && Math.hypot(c.x - bot.x, c.y - bot.y) < 380)
      .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
    if (openChest) {
      const dc = Math.hypot(openChest.x - bot.x, openChest.y - bot.y);
      if (dc <= 68) {
        input.holdF = true;
        return input;
      }
      assignBotGoal(bot, 'patrol', openChest.x, openChest.y, state.elapsed + 3.0, openChest.id);
      followBotGoal(state, bot, input, dt, isStuck, {
        avoidPos: killer ? { x: killer.x, y: killer.y, radius: 340 } : undefined,
        blockedBarricades: shadowBarricades,
        repathInterval: 0.7,
      });
      maybeSprintSafeTask();
      return input;
    }
  }

  // -------------------------------------------------------------------------
  // Priority 5: Committed Safe Patrol (Noob wastes sprint here too!)
  // -------------------------------------------------------------------------
  const curPatrol = bot.botGoal;
  const patrolArrived =
    curPatrol?.kind === 'patrol' && Math.hypot(curPatrol.x - bot.x, curPatrol.y - bot.y) < 75;
  const patrolUnsafe =
    curPatrol?.kind === 'patrol' &&
    visibleKiller &&
    Math.hypot(curPatrol.x - visibleKiller.x, curPatrol.y - visibleKiller.y) < 380;

  if (
    !curPatrol ||
    curPatrol.kind !== 'patrol' ||
    state.elapsed >= curPatrol.until ||
    patrolArrived ||
    patrolUnsafe ||
    isStuck
  ) {
    const candidates = getAllFacilityAnchors(state).filter((pt) => {
      const db = Math.hypot(pt.x - bot.x, pt.y - bot.y);
      const dk = visibleKiller ? Math.hypot(pt.x - visibleKiller.x, pt.y - visibleKiller.y) : 9999;
      return db > 220 && dk > 460;
    });
    const pool =
      candidates.length > 0
        ? candidates
        : getAllFacilityAnchors(state).filter((pt) => Math.hypot(pt.x - bot.x, pt.y - bot.y) > 150);
    const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))] ?? {
      x: state.mapWidth / 2,
      y: state.mapHeight / 2,
    };
    assignBotGoal(bot, 'patrol', pick.x, pick.y, state.elapsed + 5.5);
  }

  if (bot.botGoal && Math.hypot(bot.botGoal.x - bot.x, bot.botGoal.y - bot.y) > 36) {
    followBotGoal(state, bot, input, dt, isStuck, {
      avoidPos: killer ? { x: killer.x, y: killer.y, radius: isNoob ? 180 : 360 } : undefined,
      blockedBarricades: shadowBarricades,
      repathInterval: isNoob ? 1.1 : 0.8,
    });
    maybeSprintSafeTask();
  }
  return input;
}

export function stepGame(
  state: GameState,
  inputs: Record<string, PlayerInput>,
  dt: number
): void {
  if (state.phase !== 'playing') return;

  // Clear per-tick sound queue
  state.soundEvents = [];

  if (!state.survivorChat) {
    state.survivorChat = [];
  }
  for (const [playerId, inp] of Object.entries(inputs)) {
    if (inp?.chatTextToSend) {
      const p = state.players.find((pl) => pl.id === playerId);
      if (p && p.role === 'survivor') {
        const text = String(inp.chatTextToSend).trim().slice(0, 140);
        if (text) {
          state.survivorChat.push({
            id: `schat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            senderName: p.dead ? `${p.name} (Ölü)` : p.name,
            text,
            ts: Date.now(),
          });
          if (state.survivorChat.length > 50) {
            state.survivorChat.shift();
          }
        }
      }
    }
  }

  state.elapsed += dt;
  state.timeRemaining = Math.max(0, state.timeRemaining - dt);
  if (state.shakeTimer > 0) {
    state.shakeTimer = Math.max(0, state.shakeTimer - dt);
    if (state.shakeTimer === 0) state.shakeIntensity = 0;
  }

  // Chest 2-minute refresh timer (4 random rooms)
  if (state.rooms && state.rooms.length > 0 && state.chests && state.chests.length > 0) {
    state.chestRefreshTimer = Math.max(0, (state.chestRefreshTimer ?? CHEST_REFRESH_SECONDS) - dt);
    if (state.chestRefreshTimer <= 0) {
      state.chestRefreshTimer = CHEST_REFRESH_SECONDS;
      for (const pl of state.players) {
        if (pl.channel?.type === 'loot_chest') {
          pl.channel = null;
        }
      }
      state.chests = spawnRandomChests(
        state.rooms,
        state.tiles,
        state.cols,
        state.rows,
        state.vents,
        state.doors
      );
      pushEvent(state, '📦 Sandıklar yenilendi! 4 rastgele odada yeni eşyalar belirdi!', '#fbbf24');
    }
  }

  // Grow Farmer crops (30s to full maturity; indestructible by killers)
  for (const crop of state.crops || []) {
    if (!crop.ready) {
      crop.growth = Math.min(crop.maxGrowth, crop.growth + dt);
      if (crop.growth >= crop.maxGrowth) {
        crop.ready = true;
        addFloat(state, crop.x, crop.y - 12, '🌾 HASAT HAZIR!', '#a3e635');
        emitSound(state, 'heal', crop.x, crop.y);
      }
    }
  }

  // Expire temporary effects, event feed & Smile shadow barricades
  state.barricades = state.barricades.filter(
    (b) => b.hp > 0 && (b.expiresAt === undefined || state.elapsed < b.expiresAt)
  );
  state.effects = state.effects
    .map((e) => ({ ...e, ttl: e.ttl - dt }))
    .filter((e) => e.ttl > 0);
  state.floatingTexts = state.floatingTexts
    .map((f) => ({ ...f, y: f.y - 24 * dt, ttl: f.ttl - dt }))
    .filter((f) => f.ttl > 0);
  state.eventFeed = state.eventFeed
    .map((ev) => ({ ...ev, ttl: ev.ttl - dt }))
    .filter((ev) => ev.ttl > 0);

  state.activeExecution = null;

  // Validate & sync active carry links before ticking players
  for (const pl of state.players) {
    if (pl.carryingSurvivorId) {
      const carried = state.players.find((c) => c.id === pl.carryingSurvivorId);
      if (!carried || carried.dead || !carried.downed || pl.dead || pl.downed || carried.carriedById !== pl.id) {
        if (carried && carried.carriedById === pl.id) {
          carried.carriedById = null;
          ejectFromObstacles(state, carried);
        }
        pl.carryingSurvivorId = null;
      }
    }
    if (pl.carriedById) {
      const carrier = state.players.find((c) => c.id === pl.carriedById);
      if (!carrier || carrier.dead || carrier.downed || pl.dead || !pl.downed || carrier.carryingSurvivorId !== pl.id) {
        if (carrier && carrier.carryingSurvivorId === pl.id) {
          carrier.carryingSurvivorId = null;
        }
        pl.carriedById = null;
        ejectFromObstacles(state, pl);
      }
    }
  }

  // Update each player
  for (const p of state.players) {
    if (p.dead) continue;

    // Tick cooldowns & timers
    p.cdAttack = Math.max(0, p.cdAttack - dt);
    p.cdQ = Math.max(0, p.cdQ - dt);
    p.cdE = Math.max(0, p.cdE - dt);
    p.cdR = Math.max(0, p.cdR - dt);
    p.hitRecoveryTimer = Math.max(0, p.hitRecoveryTimer - dt);
    p.stunTimer = Math.max(0, p.stunTimer - dt);
    p.frozenTimer = Math.max(0, (p.frozenTimer ?? 0) - dt);
    if (p.slowTimer > 0) {
      p.slowTimer = Math.max(0, p.slowTimer - dt);
      if (p.slowTimer === 0) p.slowAmount = 0;
    }
    if (p.speedBoostTimer > 0) {
      p.speedBoostTimer = Math.max(0, p.speedBoostTimer - dt);
      if (p.speedBoostTimer === 0) p.speedBoostAmount = 0;
    }
    p.dodgeTimer = Math.max(0, p.dodgeTimer - dt);
    p.invisibleTimer = Math.max(0, p.invisibleTimer - dt);
    p.shadowInvisTimer = Math.max(0, (p.shadowInvisTimer ?? 0) - dt);
    p.darknessStealthTimer = Math.max(0, (p.darknessStealthTimer ?? 0) - dt);
    const wasDarknessMode = (p.darknessModeTimer ?? 0) > 0;
    p.darknessModeTimer = Math.max(0, (p.darknessModeTimer ?? 0) - dt);
    if (wasDarknessMode && p.darknessModeTimer === 0) {
      ejectFromObstacles(state, p);
    }
    p.blindTimer = Math.max(0, p.blindTimer - dt);
    p.flashBlindTimer = Math.max(0, (p.flashBlindTimer ?? 0) - dt);
    p.coffeeBuffTimer = Math.max(0, (p.coffeeBuffTimer ?? 0) - dt);
    if ((p.medkitRegenTimer ?? 0) > 0) {
      p.medkitRegenTimer = Math.max(0, (p.medkitRegenTimer ?? 0) - dt);
      if (!p.downed) {
        p.medkitRegenTick = (p.medkitRegenTick ?? 0) + dt;
        if (p.medkitRegenTick >= 1.0) {
          p.medkitRegenTick -= 1.0;
          const before = p.hp;
          p.hp = Math.min(p.maxHp, p.hp + ITEM_MEDKIT_REGEN_PER_SEC);
          if (p.hp > before) {
            addFloat(state, p.x, p.y, `+${ITEM_MEDKIT_REGEN_PER_SEC} ❤️`, '#34d399');
          }
        }
      }
      if (p.medkitRegenTimer === 0) {
        p.medkitRegenTick = 0;
      }
    }
    p.frenzyTimer = Math.max(0, p.frenzyTimer - dt);
    p.protectedTimer = Math.max(0, (p.protectedTimer ?? 0) - dt);
    if ((p.damageResistTimer ?? 0) > 0) {
      p.damageResistTimer = Math.max(0, (p.damageResistTimer ?? 0) - dt);
      if (p.damageResistTimer === 0) {
        p.damageResistAmount = 0;
      }
    }
    if (p.blessed) {
      p.blessedTimer = Math.max(0, (p.blessedTimer ?? 0) - dt);
      if (p.blessedTimer <= 0 || p.dead) {
        p.blessed = false;
        p.blessedTimer = 0;
        p.blessedHealTick = 0;
        if (!p.dead) {
          addFloat(state, p.x, p.y, 'KUTSAMA BİTTİ', '#94a3b8');
        }
      } else if (!p.downed) {
        p.blessedHealTick = (p.blessedHealTick ?? 0) + dt;
        if (p.blessedHealTick >= 1.0) {
          p.blessedHealTick -= 1.0;
          const before = p.hp;
          p.hp = Math.min(p.maxHp, p.hp + 2);
          if (p.hp > before) {
            addFloat(state, p.x, p.y, '+2 ✝️', '#fde047');
          }
        }
      }
    }
    if ((p.shieldHp ?? 0) > 0) {
      p.shieldHp = Math.max(0, (p.shieldHp ?? 0) - PROTECTOR_SHIELD_DECAY_PER_SEC * dt);
    }
    if (p.protectorTargetId) {
      const sel = state.players.find(
        (pl) => pl.id === p.protectorTargetId && pl.role === 'survivor' && !pl.dead
      );
      if (!sel) p.protectorTargetId = null;
    }
    p.chainsawFlurryTimer = Math.max(0, (p.chainsawFlurryTimer ?? 0) - dt);
    p.chainsawStuckTimer = Math.max(0, (p.chainsawStuckTimer ?? 0) - dt);
    p.hunterShotgunRecoverTimer = Math.max(0, (p.hunterShotgunRecoverTimer ?? 0) - dt);
    if ((p.hunterAlertTimer ?? 0) > 0) {
      p.hunterAlertTimer = Math.max(0, (p.hunterAlertTimer ?? 0) - dt);
      if (p.hunterAlertTargetId) {
        const alertTarget = state.players.find((pl) => pl.id === p.hunterAlertTargetId);
        if (!alertTarget || alertTarget.dead) {
          p.hunterAlertTimer = 0;
        } else {
          p.hunterAlertX = alertTarget.x;
          p.hunterAlertY = alertTarget.y;
        }
      }
      if (p.hunterAlertTimer === 0) {
        p.hunterAlertTargetId = null;
        p.hunterAlertObjectLabel = undefined;
      }
    }
    p.downGraceTimer = Math.max(0, p.downGraceTimer - dt);

    // Sawblooder 18s chainsaw malfunction cycle
    if (p.role === 'killer' && p.killerId === 'sawblooder' && !p.sawMalfunction) {
      p.sawMalfunctionTimer = Math.max(0, (p.sawMalfunctionTimer ?? 18.0) - dt);
      const busyWithDashOrStuck =
        p.dashTimer > 0 ||
        (p.chainsawChargeTimer ?? 0) > 0 ||
        (p.chainsawStuckTimer ?? 0) > 0;
      if (p.sawMalfunctionTimer <= 0 && !busyWithDashOrStuck) {
        p.sawMalfunction = true;
        p.sawHoldTimer = 0;
        p.sawRevving = false;
        addFloat(state, p.x, p.y, 'TESTERE ARIZALANDI! (F Tamir)', '#f59e0b');
        emitSound(state, 'break', p.x, p.y);
      }
    }

    // Smile E: Black aura around Smile (SMILE_DARK_ZONE_RADIUS -> 25% slow + 10 damage/sec)
    if (p.darkZoneTimer > 0) {
      p.darkZoneTimer = Math.max(0, p.darkZoneTimer - dt);
      const darkRadius = SMILE_DARK_ZONE_RADIUS;
      for (const s of state.players) {
        if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - p.x, s.y - p.y) <= darkRadius) {
          applySlow(s, 0.25, 0.2);
        }
      }
      p.darkZoneTick += dt;
      while (p.darkZoneTick >= 0.5 - 1e-6) {
        p.darkZoneTick = Math.max(0, p.darkZoneTick - 0.5);
        for (const s of state.players) {
          if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - p.x, s.y - p.y) <= darkRadius) {
            dealDamageToSurvivor(state, p, s, 5, false, false);
          }
        }
      }
      if (p.darkZoneTimer === 0) {
        p.darkZoneTick = 0;
      }
    }

    // Doctor Q healing aura tick (7 HP/s for 5s)
    if (p.healAuraTimer > 0) {
      p.healAuraTimer = Math.max(0, p.healAuraTimer - dt);
      p.healAuraTick += dt;
      if (p.healAuraTick >= 1.0) {
        p.healAuraTick -= 1.0;
        for (const ally of state.players) {
          if (
            ally.role === 'survivor' &&
            !ally.dead &&
            !ally.downed &&
            Math.hypot(ally.x - p.x, ally.y - p.y) <= 210
          ) {
            const before = ally.hp;
            ally.hp = Math.min(ally.maxHp, ally.hp + 7);
            if (ally.hp > before) {
              addFloat(state, ally.x, ally.y, '+7', '#34d399');
            }
          }
        }
      }
    }

    // Downed bleedout: starts at 100 yellow HP, drops by 5/sec while protected.
    // If not rescued before reaching 1 HP -> becomes critical (80% slow & killable)!
    if (p.downed && !p.downVulnerable) {
      const beingHealed = state.players.some(
        (other) =>
          !other.dead &&
          other.channel &&
          (other.channel.type === 'revive' || other.channel.type === 'bandage') &&
          other.channel.targetId === p.id
      );
      if (!beingHealed) {
        p.hp = Math.max(1, p.hp - DOWNED_BLEEDOUT_RATE * dt);
        p.bleedoutTimer = Math.max(0, (p.hp - 1) / DOWNED_BLEEDOUT_RATE);
        if (p.hp <= 1) {
          p.hp = 1;
          p.downVulnerable = true;
          p.bleedoutTimer = 0;
          addFloat(state, p.x, p.y, 'KRİTİK! 1 CAN (-%80 Hız)', '#ef4444');
          pushEvent(state, `${p.name} kurtarılamadı — artık öldürülebilir!`, '#ef4444');
        }
      }
    }

    const inp = p.isBot ? computeBotInput(state, p, dt) : inputs[p.id] ?? emptyInput(p.angle);

    // Jumper R airborne slam handling (no free stamina regeneration while airborne)
    if (p.airborneTimer > 0) {
      p.airborneTimer = Math.max(0, p.airborneTimer - dt);
      const stepT = Math.min(1, dt / Math.max(0.05, p.airborneTimer + dt));
      p.x += (p.airborneTargetX - p.x) * stepT;
      p.y += (p.airborneTargetY - p.y) * stepT;
      resolveEntityMapCollisions(state, p);

      if (p.airborneTimer === 0) {
        // Landed! AoE 95 dmg
        const slamRadius = 145;
        state.effects.push({
          id: uid('fx'),
          kind: 'jumper_slam',
          x: p.x,
          y: p.y,
          radius: slamRadius,
          ttl: 0.45,
          maxTtl: 0.45,
          color: '#f59e0b',
        });
        emitSound(state, 'break', p.x, p.y);
        triggerShake(state, 8, 0.22);
        for (const s of state.players) {
          if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - p.x, s.y - p.y) <= slamRadius) {
            dealDamageToSurvivor(state, p, s, 95);
          }
        }
      }
      continue;
    }

    // Active Dash / Rush handling (no free stamina regeneration while dashing)
    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      p.x += p.dashVx * dt;
      p.y += p.dashVy * dt;
      const collidedWall = resolveEntityMapCollisions(state, p);

      if (p.dashKind === 'runner_rush') {
        if (collidedWall || p.dashTimer === 0) {
          p.dashTimer = 0;
          p.dashKind = 'none';
          addFloat(state, p.x, p.y, 'TOSLADI!', '#38bdf8');
          emitSound(state, 'hit', p.x, p.y);
        }
      } else if (p.dashKind === 'sawblooder_q') {
        for (const s of state.players) {
          if (
            s.role === 'survivor' &&
            !s.dead &&
            !p.dashHitIds.includes(s.id) &&
            Math.hypot(s.x - p.x, s.y - p.y) <= p.radius + s.radius + 12
          ) {
            p.dashHitIds.push(s.id);
            dealDamageToSurvivor(state, p, s, 95); // 95 damage on Q hit
            p.dashTimer = 0;
            p.dashKind = 'none';
            addFloat(state, s.x, s.y, 'VAHŞİ ATILIM! 95 HASAR', '#dc2626');
            emitSound(state, 'slash', s.x, s.y);
            triggerShake(state, 8, 0.25);
            break;
          }
        }
        if (p.dashKind === 'sawblooder_q' && (collidedWall || p.dashTimer === 0)) {
          p.dashTimer = 0;
          p.dashKind = 'none';
          if (p.dashHitIds.length === 0) {
            applySlow(p, 0.3, 1.2);
            addFloat(state, p.x, p.y, 'ISKALI! (-%30 Hız 1.2sn)', '#dc2626');
            emitSound(state, 'hit', p.x, p.y);
          }
        }
      } else if (p.dashKind === 'jumper_q') {
        for (const s of state.players) {
          if (
            s.role === 'survivor' &&
            !s.dead &&
            !p.dashHitIds.includes(s.id) &&
            Math.hypot(s.x - p.x, s.y - p.y) <= p.radius + s.radius + 10
          ) {
            p.dashHitIds.push(s.id);
            dealDamageToSurvivor(state, p, s, 80);
            p.dashTimer = 0;
            p.dashKind = 'none';
            break;
          }
        }
        if (p.dashTimer === 0 && p.dashKind === 'jumper_q') {
          p.dashKind = 'none';
          if (p.dashHitIds.length === 0) {
            // Missed -> 1.5s 25% slow
            applySlow(p, 0.25, 1.5);
            addFloat(state, p.x, p.y, 'ISKADI! -%25 Hız', '#fbbf24');
          }
        }
      } else if (p.dashKind === 'jumper_e') {
        if (p.dashTimer === 0) {
          const hopSlamRadius = 92;
          // 1st jump (remaining=4) = 35, 2nd (3) = 30, 3rd (2) = 28, 4th (1) = 25, 5th (0) = 25
          const hopDamages = [25, 25, 28, 30, 35];
          const hopDamage = hopDamages[p.multiJumpRemaining] ?? 25;
          state.effects.push({
            id: uid('fx'),
            kind: 'jumper_slam',
            x: p.x,
            y: p.y,
            radius: hopSlamRadius,
            ttl: 0.32,
            maxTtl: 0.32,
            color: '#f59e0b',
          });
          emitSound(state, 'break', p.x, p.y);
          triggerShake(state, 4, 0.12);
          for (const s of state.players) {
            if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - p.x, s.y - p.y) <= hopSlamRadius) {
              if (dealDamageToSurvivor(state, p, s, hopDamage, false, false)) {
                p.multiJumpHitAny = true;
              }
            }
          }

          if (p.multiJumpRemaining > 0) {
            p.multiJumpRemaining -= 1;
            p.angle = inp.angle;
            p.dashTimer = 0.22;
            p.dashHitIds = [];
            const spd = (p.baseSpeed + 13) * SPEED_TO_PX;
            p.dashVx = Math.cos(p.angle) * spd;
            p.dashVy = Math.sin(p.angle) * spd;
            emitSound(state, 'jump', p.x, p.y);
          } else {
            p.dashKind = 'none';
            if (p.multiJumpHitAny) {
              p.hitRecoveryTimer = JUMPER_HIT_RECOVERY_SECONDS;
              p.cdAttack = Math.max(p.cdAttack, JUMPER_HIT_RECOVERY_SECONDS);
              applySlow(p, KILLER_HIT_RECOVERY_SLOW, JUMPER_HIT_RECOVERY_SECONDS);
            }
            p.multiJumpHitAny = false;
          }
        }
      } else if (p.dashKind === 'juggernaut_q') {
        for (const s of state.players) {
          if (
            s.role === 'survivor' &&
            !s.dead &&
            !p.dashHitIds.includes(s.id) &&
            Math.hypot(s.x - p.x, s.y - p.y) <= p.radius + s.radius + 14
          ) {
            p.dashHitIds.push(s.id);
            dealDamageToSurvivor(state, p, s, 55);
          }
        }
        if (p.dashTimer === 0) p.dashKind = 'none';
      } else if (p.dashKind === 'pull') {
        if (p.dashTimer === 0) p.dashKind = 'none';
      } else if (p.dashKind === 'darkness_e') {
        if (p.dashTimer === 0) {
          p.dashKind = 'none';
          if ((p.darknessModeTimer ?? 0) <= 0) {
            ejectFromObstacles(state, p);
          }
        }
      } else if (p.dashKind === 'shadow_e') {
        if (p.dashTimer === 0) {
          p.dashKind = 'none';
          ejectFromObstacles(state, p);
        }
      }
      continue;
    }

    // Sawblooder E Chainsaw Rush handling (accelerates from 16 to 30 over 3s, runs indefinitely until hitting a wall/obstacle or survivor)
    if (p.chainsawChargeTimer && p.chainsawChargeTimer > 0) {
      if (p.stunTimer > 0 || p.trappedById) {
        p.chainsawChargeTimer = 0;
        p.chainsawChargeDuration = 0;
      } else {
        p.chainsawChargeDuration = (p.chainsawChargeDuration ?? 0) + dt;
        const chargeP = Math.min(1, p.chainsawChargeDuration / 3.0);
        const speedUnits = 16 + (30 - 16) * chargeP;
        const speedPx = speedUnits * SPEED_TO_PX;

        p.angle = inp.angle;
        p.vx = Math.cos(p.angle) * speedPx;
        p.vy = Math.sin(p.angle) * speedPx;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        let hitSurvivor: PlayerState | null = null;
        for (const s of state.players) {
          if (
            s.role === 'survivor' &&
            !s.dead &&
            Math.hypot(s.x - p.x, s.y - p.y) <= p.radius + s.radius + 12
          ) {
            hitSurvivor = s;
            break;
          }
        }

        if (hitSurvivor) {
          dealDamageToSurvivor(state, p, hitSurvivor, 85);
          p.chainsawChargeTimer = 0;
          p.chainsawChargeDuration = 0;
          applySlow(p, 0.20, 2.0);
          addFloat(state, p.x, p.y, 'TESTERE DARBESİ! 85 HASAR', '#dc2626');
          emitSound(state, 'slash', p.x, p.y);
          triggerShake(state, 8, 0.25);
          state.bloodStains.push({
            id: uid('blood'),
            x: hitSurvivor.x,
            y: hitSurvivor.y,
            radius: 28,
            angle: Math.random() * Math.PI * 2,
            seed: Math.random() * 100,
            alpha: 0.9,
          });
        } else {
          const collidedWall = resolveEntityMapCollisions(state, p);
          if (collidedWall) {
            p.chainsawChargeTimer = 0;
            p.chainsawChargeDuration = 0;
            p.chainsawStuckTimer = 1.3;
            p.chainsawStuckAngle = p.angle;
            p.vx = 0;
            p.vy = 0;
            addFloat(state, p.x, p.y, 'TESTERE SAPLANDI! (1.3sn)', '#ef4444');
            emitSound(state, 'break', p.x, p.y);
            triggerShake(state, 7, 0.25);
          }
        }
      }
      continue;
    }

    // Facing angle (locked during stun/trap/chainsaw stuck)
    if (p.stunTimer <= 0 && !p.trappedById && (p.chainsawStuckTimer ?? 0) <= 0) {
      p.angle = inp.angle;
    } else if ((p.chainsawStuckTimer ?? 0) > 0 && p.chainsawStuckAngle !== undefined) {
      p.angle = p.chainsawStuckAngle;
    }

    // --- CHANNELING (F key or Doctor E / Engineer E) ---
    if (p.channel) {
      if (p.stunTimer > 0 || p.downed || (p.chainsawStuckTimer ?? 0) > 0) {
        p.channel = null;
      } else if (p.channel.type === 'revive') {
        const target = state.players.find((s) => s.id === p.channel!.targetId);
        if (!inp.holdF || !target || target.dead || !target.downed || Math.hypot(target.x - p.x, target.y - p.y) > 86) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            target.downed = false;
            target.downVulnerable = false;
            target.hp = Math.min(target.maxHp, 45);
            target.bleedoutTimer = 0;
            p.rescues += 1;
            addCoinReward(state, p, 'Kurtarma', 8);
            p.channel = null;
            addFloat(state, target.x, target.y, 'KURTARILDI!', '#34d399');
            pushEvent(state, `${p.name}, ${target.name} oyuncusunu kurtardı!`, '#34d399');
            emitSound(state, 'revive', target.x, target.y);
          }
        }
      } else if (p.channel.type === 'escape_trap') {
        if (!inp.holdF || !p.trappedById) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            state.traps = state.traps.filter((t) => t.id !== p.trappedById);
            p.trappedById = null;
            p.channel = null;
            addFloat(state, p.x, p.y, 'TUZAKTAN KURTULDU!', '#fbbf24');
            emitSound(state, 'break', p.x, p.y);
          }
        }
      } else if (p.channel.type === 'break_barricade') {
        const bar = state.barricades.find((b) => b.id === p.channel!.targetId);
        if (!inp.holdF || !bar || Math.hypot(bar.x + bar.w / 2 - p.x, bar.y + bar.h / 2 - p.y) > 92) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          bar.breakProgress = p.channel.progress;
          if (p.channel.progress >= p.channel.duration) {
            bar.hp = 0;
            p.channel = null;
            addFloat(state, bar.x + bar.w / 2, bar.y + bar.h / 2, 'BARİKAT KIRILDI', '#f97316');
            emitSound(state, 'break', bar.x, bar.y);
          }
        }
      } else if (p.channel.type === 'lock_door') {
        const door = state.doors.find((d) => d.id === p.channel!.targetId);
        if (!door || door.broken || door.locked || distToRect(p.x, p.y, door.x, door.y, door.w, door.h) > 84) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            door.locked = true;
            door.open = false;
            door.lockHits = 0;
            door.maxLockHits = Math.max(door.maxLockHits ?? 0, DOOR_MAX_LOCK_HITS);
            if (p.survivorClass === 'engineer') {
              addCoinReward(state, p, 'Engineer E (Kapı Kilitleme)', 4);
            }
            p.channel = null;
            addFloat(state, door.x + door.w / 2, door.y, `KAPI KİLİTLENDİ! (${door.maxLockHits} Can)`, '#f59e0b');
            pushEvent(state, `${door.label || 'Kapı'} kilitlendi (${door.maxLockHits} Can)`, '#f59e0b');
            emitSound(state, 'lock', door.x, door.y);
          }
        }
      } else if (p.channel.type === 'bandage') {
        const target = state.players.find((s) => s.id === p.channel!.targetId);
        if (!target || target.dead) {
          p.channel = null;
        } else {
          // Doctor moves toward target if > 44px away ("yanına gidip 4 saniyede sargı sarar")
          const d = Math.hypot(target.x - p.x, target.y - p.y);
          if (d > 50 && d < 220) {
            const ang = Math.atan2(target.y - p.y, target.x - p.x);
            p.x += Math.cos(ang) * p.baseSpeed * SPEED_TO_PX * 0.9 * dt;
            p.y += Math.sin(ang) * p.baseSpeed * SPEED_TO_PX * 0.9 * dt;
            resolveEntityMapCollisions(state, p);
          } else if (d >= 220) {
            p.channel = null;
          }
          if (p.channel) {
            p.channel.progress += dt;
            if (p.channel.progress >= p.channel.duration) {
              target.hp = target.maxHp;
              target.downed = false;
              target.downVulnerable = false;
              target.bleedoutTimer = 0;
              if (p.survivorClass === 'doctor') {
                addCoinReward(state, p, 'Doctor E (Sargı)', 9);
              }
              p.channel = null;
              addFloat(state, target.x, target.y, 'FULL CAN! ➕', '#10b981');
              emitSound(state, 'heal', target.x, target.y);
            }
          }
        }
      } else if (p.channel.type === 'repair_saw') {
        if (!inp.holdF || !p.sawMalfunction || p.trappedById) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            p.sawMalfunction = false;
            p.sawMalfunctionTimer = 18.0;
            p.channel = null;
            addFloat(state, p.x, p.y, 'TESTERE TAMİR EDİLDİ!', '#10b981');
            emitSound(state, 'lock', p.x, p.y);
          }
        }
      } else if (p.channel.type === 'loot_chest') {
        const chest = (state.chests || []).find((ch) => ch.id === p.channel!.targetId);
        if (!inp.holdF || !chest || chest.opened || Math.hypot(chest.x - p.x, chest.y - p.y) > 84) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            if (!p.inventory) p.inventory = [null, null, null];
            const emptyIdx = p.inventory.findIndex((sl) => !sl);
            if (emptyIdx === -1) {
              p.channel = null;
              addFloat(state, p.x, p.y, 'ENVANTER DOLU! (3/3)', '#fbbf24');
            } else {
              if (chest.sealedByHunter) {
                chest.sealedByHunter = false;
                triggerHunterSealAlert(state, p, 'Sandık', chest.x, chest.y);
              }
              chest.opened = true;
              const pickedKind =
                CHEST_ITEM_POOL[Math.floor(Math.random() * CHEST_ITEM_POOL.length)];
              p.inventory[emptyIdx] = {
                id: uid('item'),
                kind: pickedKind,
                ...(pickedKind === 'shield'
                  ? { durability: ITEM_SHIELD_HITS, maxDurability: ITEM_SHIELD_HITS }
                  : {}),
              };
              if (p.equippedSlot === null || p.equippedSlot === undefined) {
                p.equippedSlot = emptyIdx;
              }
              const meta = INVENTORY_ITEM_META[pickedKind];
              p.channel = null;
              addCoinReward(state, p, 'Sandık Açma', 4);
              addFloat(
                state,
                p.x,
                p.y - 10,
                `+${meta.emoji} ${meta.name} [${emptyIdx + 1}]`,
                meta.accent
              );
              emitSound(state, 'lock', chest.x, chest.y);
            }
          }
        }
      } else if (p.channel.type === 'use_medkit') {
        const slotIdx = Number(p.channel.targetId);
        const slotItem = p.inventory?.[slotIdx];
        if (!slotItem || slotItem.kind !== 'medkit') {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            p.inventory![slotIdx] = null;
            if (p.equippedSlot === slotIdx) p.equippedSlot = null;
            p.hp = Math.min(p.maxHp, p.hp + ITEM_MEDKIT_INSTANT_HEAL);
            p.medkitRegenTimer = ITEM_MEDKIT_REGEN_SECONDS;
            p.medkitRegenTick = 0;
            p.channel = null;
            addFloat(
              state,
              p.x,
              p.y,
              `+${ITEM_MEDKIT_INSTANT_HEAL} CAN · +${ITEM_MEDKIT_REGEN_PER_SEC}/sn (10sn)`,
              '#10b981'
            );
            emitSound(state, 'heal', p.x, p.y);
          }
        }
      } else if (p.channel.type === 'drink_coffee') {
        const slotIdx = Number(p.channel.targetId);
        const slotItem = p.inventory?.[slotIdx];
        if (!slotItem || slotItem.kind !== 'coffee') {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            p.inventory![slotIdx] = null;
            if (p.equippedSlot === slotIdx) p.equippedSlot = null;
            p.coffeeBuffTimer = ITEM_COFFEE_BUFF_SECONDS;
            p.channel = null;
            addFloat(state, p.x, p.y, '☕ +%20 HIZ · -%20 STAMİNA (10sn)!', '#f59e0b');
            emitSound(state, 'heal', p.x, p.y);
          }
        }
      }
    }

    // Inventory Slot Select (1, 2, 3) & Active Consumable Item Activation (for Survivors)
    const triggerSurvivorItemUse = (slotIdx: number) => {
      if (!p.inventory) return;
      const item = p.inventory[slotIdx];
      if (!item || p.channel || p.downed || p.stunTimer > 0 || p.trappedById) return;
      if (item.kind === 'medkit') {
        p.channel = {
          type: 'use_medkit',
          targetId: String(slotIdx),
          progress: 0,
          duration: ITEM_MEDKIT_USE_SECONDS,
        };
        addFloat(state, p.x, p.y, '❤️ SAĞLIK KİTİ KULLANILIYOR...', '#ef4444');
      } else if (item.kind === 'coffee') {
        p.channel = {
          type: 'drink_coffee',
          targetId: String(slotIdx),
          progress: 0,
          duration: ITEM_COFFEE_DRINK_SECONDS,
        };
        addFloat(state, p.x, p.y, '☕ KAHVE İÇİLİYOR... (-%50 Hız)', '#d97706');
      } else if (item.kind === 'flashlight') {
        p.inventory[slotIdx] = null;
        if (p.equippedSlot === slotIdx) p.equippedSlot = null;
        emitSound(state, 'dodge', p.x, p.y);
        state.effects.push({
          id: uid('fx'),
          kind: 'flash_cone',
          x: p.x,
          y: p.y,
          angle: p.angle,
          radius: ITEM_FLASH_RANGE,
          ttl: 0.36,
          maxTtl: 0.36,
          color: '#e2e8f0',
        });
        let blindedCount = 0;
        let blindedKiller = false;
        for (const other of state.players) {
          if (other.id === p.id || other.dead) continue;
          const d = Math.hypot(other.x - p.x, other.y - p.y);
          if (d > ITEM_FLASH_RANGE + other.radius) continue;
          const angTo = Math.atan2(other.y - p.y, other.x - p.x);
          const diff = Math.abs(Math.atan2(Math.sin(angTo - p.angle), Math.cos(angTo - p.angle)));
          if (
            (diff <= ITEM_FLASH_HALF_ANGLE || d <= p.radius + other.radius + 22) &&
            hasWalkableLine(state.tiles, state.cols, state.rows, p.x, p.y, other.x, other.y, 0)
          ) {
            other.flashBlindTimer = Math.max(other.flashBlindTimer ?? 0, ITEM_FLASH_BLIND_SECONDS);
            addFloat(state, other.x, other.y, '🔦 KÖR OLDU! (2sn)', '#e2e8f0');
            blindedCount += 1;
            if (other.role === 'killer') {
              blindedKiller = true;
            }
          }
        }
        if (blindedKiller) {
          addCoinReward(state, p, 'Flash (Katil Kör)', 6);
          pushEvent(state, `${p.name} flash ile katili 2 saniye kör etti!`, '#e2e8f0');
        } else if (blindedCount > 0) {
          pushEvent(state, `${p.name} flash attı ve ${blindedCount} kişiyi kör etti!`, '#cbd5e1');
        }
      }
    };

    if (p.role === 'survivor' && !p.downed && !p.dead && p.stunTimer <= 0 && !p.trappedById) {
      if (inp.dropSlot !== undefined && inp.dropSlot >= 0 && inp.dropSlot <= 2) {
        const dropIdx = inp.dropSlot;
        const dropped = p.inventory?.[dropIdx] ?? null;
        if (dropped && p.inventory) {
          if (
            (p.channel?.type === 'use_medkit' || p.channel?.type === 'drink_coffee') &&
            Number(p.channel.targetId) === dropIdx
          ) {
            p.channel = null;
          }
          p.inventory[dropIdx] = null;
          if (p.equippedSlot === dropIdx) {
            const nextOccupied = p.inventory.findIndex((sl) => Boolean(sl));
            p.equippedSlot = nextOccupied >= 0 ? nextOccupied : null;
          }
          const dMeta = INVENTORY_ITEM_META[dropped.kind];
          addFloat(state, p.x, p.y - 10, `-${dMeta.emoji} Bırakıldı`, '#94a3b8');
        }
      }

      if (inp.selectSlot === -1) {
        if (p.channel?.type === 'use_medkit' || p.channel?.type === 'drink_coffee') {
          p.channel = null;
        }
        p.equippedSlot = null;
      } else if (inp.selectSlot !== undefined && inp.selectSlot >= 0 && inp.selectSlot <= 2) {
        if (p.channel?.type === 'use_medkit' || p.channel?.type === 'drink_coffee') {
          p.channel = null;
        }
        const slotIdx = inp.selectSlot;
        const slotItem = p.inventory?.[slotIdx] ?? null;
        if (p.equippedSlot === slotIdx) {
          if (slotItem?.kind === 'shield' || !slotItem) {
            p.equippedSlot = null;
          } else {
            triggerSurvivorItemUse(slotIdx);
          }
        } else if (slotItem) {
          p.equippedSlot = slotIdx;
        } else {
          p.equippedSlot = null;
        }
      } else if (
        (inp.useItem || inp.attack) &&
        !p.channel &&
        p.equippedSlot !== null &&
        p.equippedSlot !== undefined
      ) {
        const held = p.inventory?.[p.equippedSlot];
        if (held && held.kind !== 'shield') {
          triggerSurvivorItemUse(p.equippedSlot);
        }
      }
    }

    // Start new F-hold interaction if not currently channeling
    if (!p.channel && inp.holdF && (p.chainsawStuckTimer ?? 0) <= 0) {
      if (p.role === 'killer' && p.trappedById) {
        p.channel = { type: 'escape_trap', targetId: p.trappedById, progress: 0, duration: TRAP_ESCAPE_DURATION_SECONDS };
      } else if (p.role === 'killer' && p.killerId === 'sawblooder' && p.sawMalfunction) {
        p.channel = { type: 'repair_saw', targetId: p.id, progress: 0, duration: 0.8 };
      } else if (p.role === 'killer' && p.killerId === 'hunter' && (p.hunterAlertTimer ?? 0) > 0) {
        const alertedSurv = p.hunterAlertTargetId
          ? state.players.find((s) => s.id === p.hunterAlertTargetId && !s.dead)
          : undefined;
        const destX = alertedSurv ? alertedSurv.x : (p.hunterAlertX ?? p.x);
        const destY = alertedSurv ? alertedSurv.y : (p.hunterAlertY ?? p.y);
        const oldX = p.x;
        const oldY = p.y;
        p.x = destX;
        p.y = destY;
        resolveEntityMapCollisions(state, p);
        if (alertedSurv) {
          p.angle = Math.atan2(alertedSurv.y - p.y, alertedSurv.x - p.x);
        }
        p.hunterAlertTimer = 0;
        p.hunterAlertTargetId = null;
        p.hunterAlertObjectLabel = undefined;
        p.cdAttack = Math.max(p.cdAttack, 0.35);
        emitSound(state, 'vent', p.x, p.y);
        triggerShake(state, 5, 0.16);
        state.effects.push(
          {
            id: uid('fx'),
            kind: 'hunter_teleport',
            x: oldX,
            y: oldY,
            radius: 44,
            ttl: 0.45,
            maxTtl: 0.45,
            color: '#f59e0b',
          },
          {
            id: uid('fx'),
            kind: 'hunter_teleport',
            x: p.x,
            y: p.y,
            radius: 52,
            ttl: 0.5,
            maxTtl: 0.5,
            color: '#fbbf24',
          }
        );
        addFloat(state, p.x, p.y, 'MÜHÜR IŞINLANMASI!', '#fbbf24');
        pushEvent(state, 'Hunter mühürlenen insanın yanına ışınlandı!', '#f59e0b');
      } else if (p.role === 'killer') {
        const bar = state.barricades.find(
          (b) => b.kind === 'wood' && Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y) < 86
        );
        if (bar) {
          p.channel = { type: 'break_barricade', targetId: bar.id, progress: bar.breakProgress, duration: 4.0 };
        }
      } else if (p.role === 'survivor' && !p.downed) {
        const downedAlly = state.players.find(
          (s) =>
            s.role === 'survivor' &&
            s.id !== p.id &&
            !s.dead &&
            s.downed &&
            !s.carriedById &&
            Math.hypot(s.x - p.x, s.y - p.y) < 72
        );
        if (downedAlly) {
          p.channel = {
            type: 'revive',
            targetId: downedAlly.id,
            progress: 0,
            duration: REVIVE_DURATION_SECONDS,
          };
        } else {
          const nearCrop = (state.crops || [])
            .filter((cr) => cr.ready && Math.hypot(cr.x - p.x, cr.y - p.y) <= 72)
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
          if (nearCrop) {
            const cropIdx = state.crops.findIndex((cr) => cr.id === nearCrop.id);
            if (cropIdx !== -1) state.crops.splice(cropIdx, 1);
            if (nearCrop.sealedByHunter) {
              triggerHunterSealAlert(state, p, 'Hasat', nearCrop.x, nearCrop.y);
              const hunter = state.players.find(
                (pl) => pl.role === 'killer' && pl.killerId === 'hunter' && !pl.dead
              );
              if (hunter) {
                dealDamageToSurvivor(state, hunter, p, FARMER_CROP_POISON_DAMAGE, false, false, true);
              } else {
                p.hp = Math.max(1, p.hp - FARMER_CROP_POISON_DAMAGE);
              }
              addFloat(state, p.x, p.y - 14, `☠️ ZEHİRLİ HASAT! -${FARMER_CROP_POISON_DAMAGE} Can`, '#ef4444');
              pushEvent(
                state,
                `${p.name} Hunter tarafından zehirlenmiş hasatı yedi! (-${FARMER_CROP_POISON_DAMAGE} Can)`,
                '#ef4444'
              );
            } else {
              const beforeHp = p.hp;
              p.hp = Math.min(p.maxHp, p.hp + FARMER_CROP_HEAL);
              const healed = Math.round(p.hp - beforeHp);
              p.damageResistTimer = FARMER_CROP_RESIST_SECONDS;
              p.damageResistAmount = FARMER_CROP_RESIST_AMOUNT;
              emitSound(state, 'heal', p.x, p.y);
              addFloat(
                state,
                p.x,
                p.y - 12,
                `🌾 +${FARMER_CROP_HEAL} CAN · %25 DAYANIKLILIK (4sn)`,
                '#a3e635'
              );
              pushEvent(
                state,
                `${p.name} olgun hasatı topladı! (+${healed > 0 ? healed : FARMER_CROP_HEAL} Can, 4sn %25 dayanıklılık)`,
                '#84cc16'
              );
              const farmerOwner = state.players.find((pl) => pl.id === nearCrop.ownerId);
              addCoinReward(state, farmerOwner, 'Farmer Q (Hasat)', 10);
              state.effects.push({
                id: uid('fx'),
                kind: 'doctor_heal',
                x: nearCrop.x,
                y: nearCrop.y,
                radius: 46,
                ttl: 0.45,
                maxTtl: 0.45,
                color: '#84cc16',
              });
            }
          } else {
            const nearChest = (state.chests || [])
              .filter((ch) => !ch.opened && Math.hypot(ch.x - p.x, ch.y - p.y) <= 76)
              .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
            if (nearChest) {
              if (nearChest.sealedByHunter) {
                nearChest.sealedByHunter = false;
                triggerHunterSealAlert(state, p, 'Sandık', nearChest.x, nearChest.y);
              }
              const hasEmpty = (p.inventory ?? [null, null, null]).some((sl) => !sl);
              if (hasEmpty) {
                p.channel = {
                  type: 'loot_chest',
                  targetId: nearChest.id,
                  progress: 0,
                  duration: CHEST_LOOT_SECONDS,
                };
              } else if (
                !p.isBot &&
                !state.floatingTexts.some(
                  (ft) => ft.text.includes('ENVANTER DOLU') && Math.hypot(ft.x - p.x, ft.y - p.y) < 60
                )
              ) {
                addFloat(state, p.x, p.y, 'ENVANTER DOLU! (3/3)', '#fbbf24');
              }
            }
          }
        }
      }
    }

    // Movement calculation
    const beingRevived = state.players.some(
      (other) => !other.dead && other.channel?.type === 'revive' && other.channel.targetId === p.id
    );
    const cannotMove =
      p.stunTimer > 0 ||
      Boolean(p.carriedById) ||
      (p.chainsawStuckTimer ?? 0) > 0 ||
      p.trappedById !== null ||
      beingRevived ||
      (p.channel !== null &&
        p.channel.type !== 'bandage' &&
        p.channel.type !== 'repair_saw' &&
        p.channel.type !== 'drink_coffee');

    let mx = 0;
    let my = 0;
    if (!cannotMove) {
      if (inp.up) my -= 1;
      if (inp.down) my += 1;
      if (inp.left) mx -= 1;
      if (inp.right) mx += 1;
    }

    const isMoving = mx !== 0 || my !== 0;
    if (isMoving) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    }

    // Stamina & Sprint (with exhaust hysteresis so it never flickers at 0 stamina)
    const canSprint =
      !cannotMove &&
      isMoving &&
      !p.downed &&
      !p.staminaExhausted &&
      p.stamina > 0 &&
      p.channel?.type !== 'repair_saw';
    const wantsSprint = inp.sprint && canSprint;
    if (wantsSprint) {
      const baseDrain = p.role === 'killer' ? KILLER_STAMINA_DRAIN_RATE : SURVIVOR_STAMINA_DRAIN_RATE;
      let staminaDrainRate = p.frenzyTimer > 0 ? baseDrain * 0.5 : baseDrain;
      if ((p.coffeeBuffTimer ?? 0) > 0) {
        staminaDrainRate *= ITEM_COFFEE_STAMINA_MULT;
      }
      p.stamina = Math.max(0, p.stamina - staminaDrainRate * dt);
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.staminaExhausted = true;
      }
    } else {
      const regenRate = (p.shadowInvisTimer ?? 0) > 0 ? 18 * SHADOW_INVIS_STAMINA_REGEN_MULT : 18;
      p.stamina = Math.min(p.maxStamina, p.stamina + regenRate * dt);
      if (p.staminaExhausted && p.stamina >= STAMINA_EXHAUST_RECOVER) {
        p.staminaExhausted = false;
      }
    }

    let currentSpeed =
      p.baseSpeed +
      p.speedBoostAmount +
      (p.frenzyTimer > 0 ? 5 : 0) +
      (p.killerId === 'sawblooder' && (p.chainsawFlurryTimer ?? 0) > 0 ? 6 : 0);
    if (wantsSprint) {
      currentSpeed += p.role === 'killer' ? KILLER_SPRINT_BONUS : SURVIVOR_SPRINT_BONUS;
    }
    if ((p.coffeeBuffTimer ?? 0) > 0) {
      currentSpeed *= ITEM_COFFEE_SPEED_MULT;
    }
    if (p.invisibleTimer > 0) {
      currentSpeed *= 1.5; // Juggernaut R: +50% speed while invisible
    }
    if ((p.darknessModeTimer ?? 0) > 0) {
      currentSpeed *= 1.45; // Darkness R: +45% speed while in Darkness Mode
    }
    if (p.hitRecoveryTimer > 0 && p.role === 'killer') {
      currentSpeed *= 0.5; // Killer attack recovery deceleration / slowdown
    }
    if (p.channel?.type === 'repair_saw') {
      currentSpeed *= 0.5; // 50% slow while repairing malfunctioning chainsaw with F
    }
    if (p.channel?.type === 'drink_coffee') {
      currentSpeed *= ITEM_COFFEE_DRINK_SLOW; // 50% slow while drinking coffee
    }
    if (p.slowTimer > 0) {
      currentSpeed *= Math.max(0.15, 1 - p.slowAmount);
    }
    if (p.carryingSurvivorId) {
      currentSpeed *= CARRY_SPEED_MULT; // Taşırken %10 yavaşlama
    }
    if (p.downed) {
      currentSpeed *= p.downVulnerable ? DOWNED_CRITICAL_SPEED_MULT : DOWNED_SPEED_MULT;
    }

    p.vx = mx * currentSpeed * SPEED_TO_PX;
    p.vy = my * currentSpeed * SPEED_TO_PX;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    resolveEntityMapCollisions(state, p);

    // Check Hunter sealed doors if a standing survivor touches/crosses them
    if (p.role === 'survivor' && !p.dead && !p.downed) {
      for (const door of state.doors) {
        if (
          !door.broken &&
          door.sealedByHunter &&
          distToRect(p.x, p.y, door.x, door.y, door.w, door.h) <= p.radius + 6
        ) {
          door.sealedByHunter = false;
          triggerHunterSealAlert(state, p, 'Kapı', door.x + door.w / 2, door.y + door.h / 2);
          break;
        }
      }
    }

    // Check Trapper traps if Killer moves onto them
    if (p.role === 'killer' && !p.trappedById) {
      for (let i = state.traps.length - 1; i >= 0; i--) {
        const trap = state.traps[i];
        if (trap.kind === 'smile_mine' || trap.kind === 'hunter_scythe') continue;
        if (!trap.triggered && Math.hypot(p.x - trap.x, p.y - trap.y) <= p.radius + trap.radius - 4) {
          trap.triggered = true;
          emitSound(state, 'trap', trap.x, trap.y);
          const trapOwner = state.players.find((pl) => pl.id === trap.ownerId);
          if (trap.kind === 'snare') {
            p.trappedById = trap.id;
            addCoinReward(state, trapOwner, 'Trapper Q (Kapan)', 5);
            addFloat(state, p.x, p.y, 'KAPANA YAKALANDI!', '#a855f7');
          } else if (trap.kind === 'bomb') {
            applySlow(p, 0.50, 4.0); // 50% slow for 4s
            state.traps.splice(i, 1);
            addCoinReward(state, trapOwner, 'Bomber E (Gizli Bomba)', 7);
            addFloat(state, p.x, p.y, 'GİZLİ BOMBA! -%50 Hız (4sn)', '#ea580c');
            pushEvent(state, `Gizli bomba patladı! Katil 4 saniye %50 yavaşladı!`, '#ea580c');
            emitSound(state, 'break', trap.x, trap.y);
            state.effects.push({
              id: uid('fx'),
              kind: 'fighter_punch',
              x: trap.x,
              y: trap.y,
              radius: 64,
              ttl: 0.45,
              maxTtl: 0.45,
              color: '#ea580c',
            });
            triggerShake(state, 6, 0.2);
          } else {
            applySlow(p, 0.37, 4.0); // 37% slow for 4s
            state.traps.splice(i, 1);
            addCoinReward(state, trapOwner, 'Trapper E (Yavaşlatma)', 7);
            addFloat(state, p.x, p.y, 'TUZAK! -%37 Hız (4sn)', '#c084fc');
          }
          break;
        }
      }
    }

    // Check Smile E Mines & Hunter Invisible Scythe Traps if Survivor steps onto them
    if (p.role === 'survivor' && !p.dead && !p.carriedById) {
      for (let i = state.traps.length - 1; i >= 0; i--) {
        const trap = state.traps[i];
        if ((trap.kind !== 'smile_mine' && trap.kind !== 'hunter_scythe') || trap.triggered) continue;
        if (Math.hypot(p.x - trap.x, p.y - trap.y) <= p.radius + trap.radius - 2) {
          trap.triggered = true;
          state.traps.splice(i, 1);
          if (trap.kind === 'hunter_scythe') {
            applySlow(p, HUNTER_SCYTHE_SLOW, HUNTER_SCYTHE_SLOW_SECONDS);
            const scytheOwner = state.players.find((pl) => pl.id === trap.ownerId);
            if (scytheOwner) {
              dealDamageToSurvivor(state, scytheOwner, p, HUNTER_SCYTHE_DAMAGE, false, false);
            } else {
              p.hp = Math.max(0, p.hp - HUNTER_SCYTHE_DAMAGE);
            }
            emitSound(state, 'slash', trap.x, trap.y);
            state.effects.push({
              id: uid('fx'),
              kind: 'slash',
              x: trap.x,
              y: trap.y,
              angle: Math.atan2(p.y - trap.y, p.x - trap.x),
              radius: 44,
              ttl: 0.35,
              maxTtl: 0.35,
              color: '#f59e0b',
            });
            triggerShake(state, 5, 0.16);
            addFloat(
              state,
              p.x,
              p.y,
              `GİZLİ TIRPAN! -${HUNTER_SCYTHE_DAMAGE} Can · -%25 Hız (3sn)`,
              '#f59e0b'
            );
            pushEvent(
              state,
              `${p.name} Hunter'ın görünmez tırpanına yakalandı! (-${HUNTER_SCYTHE_DAMAGE} Can, 3sn %25 yavaşlama)`,
              '#f59e0b'
            );
          } else {
            applySlow(p, 0.45, 2.5); // 2.5 seconds 45% slow
            const mineOwner = state.players.find((pl) => pl.id === trap.ownerId);
            if (mineOwner) {
              dealDamageToSurvivor(state, mineOwner, p, 60, false, false);
            } else {
              p.hp = Math.max(0, p.hp - 60);
            }
            emitSound(state, 'break', trap.x, trap.y);
            state.effects.push({
              id: uid('fx'),
              kind: 'fighter_punch',
              x: trap.x,
              y: trap.y,
              radius: 62,
              ttl: 0.42,
              maxTtl: 0.42,
              color: '#e11d48',
            });
            triggerShake(state, 5, 0.16);
            addFloat(state, p.x, p.y, 'SMİLE MAYINI! -60 Can · -%45 Hız (2.5sn)', '#e11d48');
            pushEvent(state, `${p.name} Smile mayınına bastı! (-60 Can, 2.5sn %45 yavaşlama)`, '#e11d48');
          }
          break;
        }
      }
    }

    // --- ABILITIES & ATTACKS ---
    if (p.stunTimer > 0 || p.downed || p.trappedById || (p.chainsawStuckTimer ?? 0) > 0) {
      p.sawHoldTimer = 0;
      p.sawRevving = false;
      continue;
    }

    // Killer Basic Attack
    if (p.role === 'killer' && p.killerId === 'sawblooder') {
      // Sawblooder: hold-to-attack ONLY (disabled while malfunctioning)
      if (p.sawMalfunction) {
        p.sawHoldTimer = 0;
        p.sawRevving = false;
      } else {
        if (inp.attackHeld) {
          p.sawHoldTimer = (p.sawHoldTimer ?? 0) + dt;
        } else {
          p.sawHoldTimer = 0;
        }
        const isRevving = (p.sawHoldTimer ?? 0) >= 0.14;
        p.sawRevving = isRevving;

        if (isRevving && p.cdAttack <= 0) {
          const sawReach = 78;
          let hitAnything = false;

          for (const s of state.players) {
            if (s.role !== 'survivor' || s.dead) continue;
            const d = Math.hypot(s.x - p.x, s.y - p.y);
            if (d <= sawReach + s.radius) {
              const angTo = Math.atan2(s.y - p.y, s.x - p.x);
              const diff = Math.abs(Math.atan2(Math.sin(angTo - p.angle), Math.cos(angTo - p.angle)));
              if (diff <= Math.PI * 0.55 || d <= p.radius + s.radius + 14) {
                if (dealDamageToSurvivor(state, p, s, KILLERS.sawblooder.damage, true, false)) {
                  hitAnything = true;
                } else if (s.dodgeTimer > 0) {
                  hitAnything = true;
                }
              }
            }
          }

          // Hit Locked Doors
          for (let di = state.doors.length - 1; di >= 0; di--) {
            const door = state.doors[di];
            if (door.broken || !door.locked) continue;
            if (distToRect(p.x, p.y, door.x, door.y, door.w, door.h) <= 68) {
              const maxHits = door.maxLockHits ?? DOOR_MAX_LOCK_HITS;
              door.lockHits += 1;
              emitSound(state, 'break', door.x, door.y);
              if (door.lockHits >= maxHits) {
                if (door.isCustom) {
                  state.doors.splice(di, 1);
                } else {
                  door.broken = true;
                  door.locked = false;
                  door.open = true;
                }
                addFloat(state, door.x + door.w / 2, door.y, 'KAPI KIRILDI!', '#f87171');
                pushEvent(state, `${door.label || 'Kapı'} kırıldı!`, '#f87171');
                triggerShake(state, 6, 0.15);
              } else {
                addFloat(
                  state,
                  door.x + door.w / 2,
                  door.y,
                  `KAPI HASARI ${door.lockHits}/${maxHits}`,
                  '#fbbf24'
                );
              }
              hitAnything = true;
              break;
            }
          }

          // Hit Turrets (must have clear path, never destroy through walls)
          for (let i = state.turrets.length - 1; i >= 0; i--) {
            const t = state.turrets[i];
            if (
              Math.hypot(t.x - p.x, t.y - p.y) <= sawReach &&
              hasWalkableLine(state.tiles, state.cols, state.rows, p.x, p.y, t.x, t.y, 0)
            ) {
              state.turrets.splice(i, 1);
              addFloat(state, t.x, t.y, 'TARET YOK EDİLDİ', '#fb923c');
              emitSound(state, 'break', t.x, t.y);
              hitAnything = true;
            }
          }

          // Hit Trapper Traps (even though invisible to the killer)
          for (let i = state.traps.length - 1; i >= 0; i--) {
            const tr = state.traps[i];
            if (tr.kind === 'smile_mine' || tr.kind === 'hunter_scythe') continue;
            if (!tr.triggered && Math.hypot(tr.x - p.x, tr.y - p.y) <= sawReach) {
              state.traps.splice(i, 1);
              addFloat(state, tr.x, tr.y, 'TUZAK KIRILDI!', '#c084fc');
              emitSound(state, 'break', tr.x, tr.y);
              hitAnything = true;
            }
          }

          if (hitAnything) {
            p.cdAttack = 0.45;
            emitSound(state, 'slash', p.x, p.y);
          }
        }
      }
    } else if (
      p.role === 'killer' &&
      p.killerId === 'hunter' &&
      p.hunterShotgunReady &&
      (p.hunterShotgunRecoverTimer ?? 0) <= 0 &&
      (inp.attack || inp.useR)
    ) {
      fireHunterShotgun(state, p);
    } else if (
      p.role === 'killer' &&
      inp.attack &&
      p.cdAttack <= 0 &&
      !(p.killerId === 'hunter' && (p.hunterShotgunReady || (p.hunterShotgunRecoverTimer ?? 0) > 0))
    ) {
      const reach = 88;
      const spec = KILLERS[p.killerId!];
      p.cdAttack = p.killerId === 'darkness' ? 0.75 : 0.8;
      emitSound(state, 'slash', p.x, p.y);
      state.effects.push({
        id: uid('fx'),
        kind: 'slash',
        x: p.x + Math.cos(p.angle) * 38,
        y: p.y + Math.sin(p.angle) * 38,
        angle: p.angle,
        radius: 58,
        ttl: 0.18,
        maxTtl: 0.18,
        color: p.frenzyTimer > 0 ? '#ef4444' : spec.accentColor,
      });

      // Hit Survivors in wider arc
      for (const s of state.players) {
        if (s.role !== 'survivor' || s.dead) continue;
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d <= reach + s.radius) {
          const angTo = Math.atan2(s.y - p.y, s.x - p.x);
          const diff = Math.abs(Math.atan2(Math.sin(angTo - p.angle), Math.cos(angTo - p.angle)));
          if (diff <= Math.PI * 0.58 || d <= p.radius + s.radius + 14) {
            dealDamageToSurvivor(state, p, s, spec.damage, true);
          }
        }
      }

      // If killer swung melee right next to a dodging Fighter and failed to hit, reward Fighter +1 Q charge
      for (const s of state.players) {
        if (
          s.role === 'survivor' &&
          !s.dead &&
          s.survivorClass === 'fighter' &&
          s.dodgeTimer > 0 &&
          !s.dodgeRewardedThisCast &&
          Math.hypot(s.x - p.x, s.y - p.y) <= reach + s.radius + 24
        ) {
          s.dodgeRewardedThisCast = true;
          s.fighterQCharges = (s.fighterQCharges ?? 0) + 1;
          addCoinReward(state, s, 'Fighter E (Dodge)', 6);
          addFloat(state, s.x, s.y, 'DODGE BAŞARILI! (+1 Q Yükü)', '#38bdf8');
          pushEvent(state, `${s.name} katilin saldırısını dodgeladı! (+1 Q Yükü)`, '#38bdf8');
          emitSound(state, 'dodge', s.x, s.y);
        }
      }

      // Hit Locked Doors
      for (let di = state.doors.length - 1; di >= 0; di--) {
        const door = state.doors[di];
        if (door.broken || !door.locked) continue;
        if (distToRect(p.x, p.y, door.x, door.y, door.w, door.h) <= 70) {
          const maxHits = door.maxLockHits ?? DOOR_MAX_LOCK_HITS;
          door.lockHits += 1;
          emitSound(state, 'break', door.x, door.y);
          if (door.lockHits >= maxHits) {
            if (door.isCustom) {
              state.doors.splice(di, 1);
            } else {
              door.broken = true;
              door.locked = false;
              door.open = true;
            }
            addFloat(state, door.x + door.w / 2, door.y, 'KAPI KIRILDI!', '#f87171');
            pushEvent(state, `${door.label || 'Kapı'} kırıldı!`, '#f87171');
            triggerShake(state, 6, 0.15);
          } else {
            addFloat(
              state,
              door.x + door.w / 2,
              door.y,
              `KAPI HASARI ${door.lockHits}/${maxHits}`,
              '#fbbf24'
            );
          }
          break;
        }
      }

      // Hit Turrets (1 hit kills turret, cannot hit through solid walls)
      for (let i = state.turrets.length - 1; i >= 0; i--) {
        const t = state.turrets[i];
        if (
          Math.hypot(t.x - p.x, t.y - p.y) <= reach &&
          ((p.darknessModeTimer ?? 0) > 0 ||
            hasWalkableLine(state.tiles, state.cols, state.rows, p.x, p.y, t.x, t.y, 0))
        ) {
          state.turrets.splice(i, 1);
          addFloat(state, t.x, t.y, 'TARET YOK EDİLDİ', '#fb923c');
          emitSound(state, 'break', t.x, t.y);
        }
      }

      // Hit Trapper Traps (even though invisible to the killer)
      for (let i = state.traps.length - 1; i >= 0; i--) {
        const tr = state.traps[i];
        if (tr.kind === 'smile_mine') continue;
        if (!tr.triggered && Math.hypot(tr.x - p.x, tr.y - p.y) <= reach) {
          state.traps.splice(i, 1);
          addFloat(state, tr.x, tr.y, 'TUZAK KIRILDI!', '#c084fc');
          emitSound(state, 'break', tr.x, tr.y);
        }
      }
    }

    // --- SURVIVOR ABILITIES & CARRY (R) ---
    if (p.role === 'survivor') {
      if (inp.useR) {
        if (p.carryingSurvivorId) {
          dropCarriedSurvivor(state, p);
        } else {
          const downedTarget = state.players
            .filter(
              (s) =>
                s.role === 'survivor' &&
                s.id !== p.id &&
                !s.dead &&
                s.downed &&
                !s.carriedById &&
                Math.hypot(s.x - p.x, s.y - p.y) <= CARRY_PICKUP_RANGE
            )
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];

          if (downedTarget) {
            p.channel = null;
            downedTarget.channel = null;
            downedTarget.dashTimer = 0;
            downedTarget.dashKind = 'none';
            for (const other of state.players) {
              if (other.channel?.type === 'revive' && other.channel.targetId === downedTarget.id) {
                other.channel = null;
              }
            }
            p.carryingSurvivorId = downedTarget.id;
            downedTarget.carriedById = p.id;
            downedTarget.x = p.x;
            downedTarget.y = p.y;
            downedTarget.vx = p.vx;
            downedTarget.vy = p.vy;
            downedTarget.angle = p.angle;
            emitSound(state, 'dodge', p.x, p.y);
            addFloat(state, p.x, p.y - 12, '🎒 SIRTA ALINDI! (-%10 Hız)', '#38bdf8');
            pushEvent(state, `${p.name}, ${downedTarget.name} oyuncusunu sırtına aldı!`, '#38bdf8');
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'Yakında yere düşmüş hayatta kalan yok!', '#94a3b8');
          }
        }
      }

      const cls = p.survivorClass!;

      if (cls === 'doctor') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 25;
          p.healAuraTimer = 5.0;
          p.healAuraTick = 0.85; // First pulse quickly
          p.abilitiesUsed += 1;
          emitSound(state, 'heal', p.x, p.y);
          addFloat(state, p.x, p.y, 'İYİLEŞTİRME HALESİ', '#10b981');
          state.effects.push({
            id: uid('fx'),
            kind: 'doctor_heal',
            x: p.x,
            y: p.y,
            radius: 210,
            ttl: 0.6,
            maxTtl: 0.6,
            color: '#10b981',
          });
        }
        if (inp.useE && p.cdE <= 0) {
          // Choose nearest injured (or downed) survivor within 170px
          const candidates = state.players
            .filter(
              (s) =>
                s.role === 'survivor' &&
                s.id !== p.id &&
                !s.dead &&
                !s.carriedById &&
                (s.hp < s.maxHp || s.downed) &&
                Math.hypot(s.x - p.x, s.y - p.y) <= 170
            )
            .sort(
              (a, b) =>
                Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)
            );
          if (candidates.length > 0) {
            p.cdE = 28;
            p.abilitiesUsed += 1;
            p.channel = {
              type: 'bandage',
              targetId: candidates[0].id,
              progress: 0,
              duration: 4.0,
            };
            addFloat(state, p.x, p.y, 'SARGI SARILIYOR...', '#34d399');
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'Yakında yaralı yok!', '#94a3b8');
          }
        }
      } else if (cls === 'engineer') {
        if (inp.useQ && p.cdQ <= 0) {
          const nearVent = state.vents.find(
            (v) => !v.broken && Math.hypot(v.x - p.x, v.y - p.y) <= 78
          );
          if (nearVent) {
            const others = state.vents
              .filter((v) => !v.broken && v.id !== nearVent.id)
              .sort(
                (a, b) =>
                  Math.hypot(a.x - nearVent.x, a.y - nearVent.y) -
                  Math.hypot(b.x - nearVent.x, b.y - nearVent.y)
              );
            if (others.length > 0) {
              if (nearVent.sealedByHunter) {
                nearVent.sealedByHunter = false;
                triggerHunterSealAlert(state, p, 'Vent', nearVent.x, nearVent.y);
              } else if (others[0].sealedByHunter) {
                others[0].sealedByHunter = false;
                triggerHunterSealAlert(state, p, 'Vent', others[0].x, others[0].y);
              }
              p.cdQ = 27;
              p.abilitiesUsed += 1;
              emitSound(state, 'vent', p.x, p.y);
              addFloat(state, p.x, p.y, 'VENT GEÇİŞİ!', '#f59e0b');
              p.x = others[0].x;
              p.y = others[0].y;
              emitSound(state, 'vent', p.x, p.y);
              addFloat(state, p.x, p.y, others[0].label, '#fbbf24');
            }
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'Yakında sağlam vent yok!', '#94a3b8');
          }
        }
        if (inp.useE && p.cdE <= 0) {
          const nearDoor = state.doors.find(
            (d) =>
              !d.broken &&
              !d.locked &&
              Math.hypot(d.x + d.w / 2 - p.x, d.y + d.h / 2 - p.y) <= 84
          );
          if (nearDoor) {
            if (nearDoor.sealedByHunter) {
              nearDoor.sealedByHunter = false;
              triggerHunterSealAlert(
                state,
                p,
                'Kapı',
                nearDoor.x + nearDoor.w / 2,
                nearDoor.y + nearDoor.h / 2
              );
            }
            p.cdE = 20;
            p.abilitiesUsed += 1;
            p.channel = {
              type: 'lock_door',
              targetId: nearDoor.id,
              progress: 0,
              duration: 3.0,
            };
            addFloat(state, p.x, p.y, 'KAPI KİLİTLENİYOR...', '#f59e0b');
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'Yakında kilitlenebilir kapı yok!', '#94a3b8');
          }
        }
      } else if (cls === 'fighter') {
        if (inp.useQ && p.cdQ <= 0) {
          if ((p.fighterQCharges ?? 0) > 0) {
            p.fighterQCharges = Math.max(0, (p.fighterQCharges ?? 1) - 1);
            p.cdQ = 10;
            p.abilitiesUsed += 1;
            applySlow(p, 0.25, 1.0);
            emitSound(state, 'slash', p.x, p.y);
            state.effects.push({
              id: uid('fx'),
              kind: 'fighter_punch',
              x: p.x,
              y: p.y,
              angle: p.angle,
              radius: FIGHTER_Q_RADIUS,
              ttl: 0.36,
              maxTtl: 0.36,
              color: '#ef4444',
            });
            const killer = state.players.find((k) => k.role === 'killer');
            if (killer && Math.hypot(killer.x - p.x, killer.y - p.y) <= FIGHTER_Q_RADIUS + killer.radius) {
              killer.stunTimer = 2.0; // 2s full stun (no post-stun 30% slow)
              killer.dashTimer = 0;
              killer.dashKind = 'none';
              killer.multiJumpRemaining = 0;
              killer.channel = null;
              addCoinReward(state, p, 'Fighter Q (Yumruk)', 11);
              addFloat(state, killer.x, killer.y, 'SERSEMLEDİ! (2sn)', '#ef4444');
              emitSound(state, 'hit', killer.x, killer.y);
            }
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'ÖNCE E İLE DODGE YEDİR!', '#fbbf24');
          }
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 22;
          p.dodgeTimer = 1.5;
          p.dodgeRewardedThisCast = false;
          p.abilitiesUsed += 1;
          addFloat(state, p.x, p.y, 'DODGE MODU!', '#38bdf8');
          emitSound(state, 'dodge', p.x, p.y);
        }
      } else if (cls === 'trapper') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 17;
          p.abilitiesUsed += 1;
          state.traps.push({
            id: uid('trap'),
            ownerId: p.id,
            kind: 'snare',
            x: p.x,
            y: p.y,
            radius: 20,
            triggered: false,
          });
          addFloat(state, p.x, p.y, 'KAPAN KURULDU', '#a855f7');
          emitSound(state, 'lock', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 30;
          p.abilitiesUsed += 1;
          state.traps.push({
            id: uid('trap'),
            ownerId: p.id,
            kind: 'slow',
            x: p.x,
            y: p.y,
            radius: 22,
            triggered: false,
          });
          addFloat(state, p.x, p.y, 'YAVAŞLATMA TUZAĞI', '#c084fc');
          emitSound(state, 'lock', p.x, p.y);
        }
      } else if (cls === 'runner') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 14;
          p.abilitiesUsed += 1;
          p.speedBoostTimer = 4.0;
          p.speedBoostAmount = 4;
          addFloat(state, p.x, p.y, '+4 HIZ!', '#06b6d4');
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 25;
          p.abilitiesUsed += 1;
          const rushSpeed =
            (p.baseSpeed + 14) * SPEED_TO_PX * (p.carryingSurvivorId ? CARRY_SPEED_MULT : 1);
          p.dashKind = 'runner_rush';
          p.dashTimer = 5.0; // stops on wall hit
          p.dashVx = Math.cos(p.angle) * rushSpeed;
          p.dashVy = Math.sin(p.angle) * rushSpeed;
          addFloat(state, p.x, p.y, 'RUSH!', '#22d3ee');
          emitSound(state, 'jump', p.x, p.y);
        }
      } else if (cls === 'builder') {
        if (inp.useQ && p.cdQ <= 0) {
          // Open space: immediately build a larger locked 3-HP door
          const horiz = Math.abs(Math.sin(p.angle)) >= Math.abs(Math.cos(p.angle));
          const dw = horiz ? 84 : 24;
          const dh = horiz ? 24 : 84;
          const dx = Math.max(
            TILE_SIZE,
            Math.min(state.mapWidth - TILE_SIZE - dw, p.x + Math.cos(p.angle) * 44 - dw / 2)
          );
          const dy = Math.max(
            TILE_SIZE,
            Math.min(state.mapHeight - TILE_SIZE - dh, p.y + Math.sin(p.angle) * 44 - dh / 2)
          );
          const overlapsDoor = state.doors.some(
            (d) =>
              !d.broken &&
              dx < d.x + d.w &&
              dx + dw > d.x &&
              dy < d.y + d.h &&
              dy + dh > d.y
          );
          if (overlapsDoor) {
            if (!p.isBot) {
              addFloat(state, p.x, p.y, 'BURAYA KAPI KURULAMAZ!', '#f87171');
            }
          } else {
            p.cdQ = 14;
            p.abilitiesUsed += 1;
            state.doors.push({
              id: uid('bdoor'),
              x: dx,
              y: dy,
              w: dw,
              h: dh,
              orientation: horiz ? 'h' : 'v',
              locked: true,
              lockHits: 0,
              maxLockHits: 3,
              broken: false,
              open: false,
              isCustom: true,
              label: 'Builder Kapısı',
            });
            // Push any overlapping killer outside the new door; survivors pass freely
            for (const pl of state.players) {
              if (!pl.dead && pl.role === 'killer') {
                const res = resolveCircleRect(pl.x, pl.y, pl.radius, dx, dy, dw, dh);
                if (res.collided) {
                  pl.x = res.x;
                  pl.y = res.y;
                }
              }
            }
            addFloat(state, p.x, p.y, 'KİTLİ KAPI KURULDU! (3 Can)', '#f97316');
            emitSound(state, 'lock', p.x, p.y);
          }
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 17;
          p.abilitiesUsed += 1;
          state.turrets.push({
            id: uid('tur'),
            ownerId: p.id,
            x: p.x + Math.cos(p.angle) * 34,
            y: p.y + Math.sin(p.angle) * 34,
            angle: p.angle,
            fireCooldown: 0.4,
            hp: 1,
          });
          addFloat(state, p.x, p.y, 'TARET KURULDU', '#fb923c');
          emitSound(state, 'lock', p.x, p.y);
        }
      } else if (cls === 'protector') {
        const staffTipX = p.x + Math.cos(p.angle) * 24;
        const staffTipY = p.y + Math.sin(p.angle) * 24;

        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 12;
          p.abilitiesUsed += 1;
          state.projectiles.push({
            id: uid('spell'),
            ownerId: p.id,
            kind: 'protector_shield',
            x: staffTipX,
            y: staffTipY,
            startX: p.x,
            startY: p.y,
            vx: Math.cos(p.angle) * 620,
            vy: Math.sin(p.angle) * 620,
            radius: 26,
            damage: 0,
            maxRange: 960,
            homingElapsed: 0,
          });
          emitSound(state, 'heal', staffTipX, staffTipY);
        }

        if (inp.useE && p.cdE <= 0) {
          p.cdE = 11;
          p.abilitiesUsed += 1;
          state.projectiles.push({
            id: uid('spell'),
            ownerId: p.id,
            kind: 'protector_protect',
            x: staffTipX,
            y: staffTipY,
            startX: p.x,
            startY: p.y,
            vx: Math.cos(p.angle) * 620,
            vy: Math.sin(p.angle) * 620,
            radius: 26,
            damage: 0,
            maxRange: 960,
            homingElapsed: 0,
          });
          emitSound(state, 'dodge', staffTipX, staffTipY);
        }
      } else if (cls === 'bomber') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 16;
          p.abilitiesUsed += 1;
          const bombX = p.x + Math.cos(p.angle) * 20;
          const bombY = p.y + Math.sin(p.angle) * 20;
          state.projectiles.push({
            id: uid('proj'),
            ownerId: p.id,
            kind: 'bomber_bomb',
            x: bombX,
            y: bombY,
            startX: p.x,
            startY: p.y,
            vx: Math.cos(p.angle) * 540,
            vy: Math.sin(p.angle) * 540,
            radius: 12,
            damage: 0,
            maxRange: 380,
          });
          emitSound(state, 'jump', bombX, bombY);
        }

        if (inp.useE && p.cdE <= 0) {
          p.cdE = 37;
          p.abilitiesUsed += 1;
          state.traps.push({
            id: uid('trap'),
            ownerId: p.id,
            kind: 'bomb',
            x: p.x,
            y: p.y,
            radius: 24,
            triggered: false,
          });
          addFloat(state, p.x, p.y, 'GİZLİ BOMBA KURULDU', '#f97316');
          emitSound(state, 'lock', p.x, p.y);
        }
      } else if (cls === 'chaplain') {
        if (inp.useQ && p.cdQ <= 0) {
          const nearbyTeammates = state.players
            .filter(
              (s) =>
                s.role === 'survivor' &&
                s.id !== p.id &&
                !s.dead &&
                Math.hypot(s.x - p.x, s.y - p.y) <= CHAPLAIN_BLESS_RANGE
            )
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));

          const target = nearbyTeammates.find((s) => !s.blessed);
          if (target) {
            p.cdQ = 13;
            p.abilitiesUsed += 1;
            const wasDowned = target.downed;
            target.blessed = true;
            target.blessedTimer = CHAPLAIN_BLESS_SECONDS;
            target.blessedHealTick = 0;

            const miracleRevived = wasDowned && Math.random() < 0.2;
            if (miracleRevived) {
              target.downed = false;
              target.downVulnerable = false;
              target.bleedoutTimer = 0;
              target.hp = Math.max(1, Math.round(target.maxHp * 0.4));
              p.rescues += 1;
              addCoinReward(state, p, 'Chaplain Q (Mucize Kalkış)', 15);
              emitSound(state, 'revive', target.x, target.y);
              addFloat(state, target.x, target.y - 16, 'MUCİZE! %40 CANLA KALKTI! ✝️', '#34d399');
              pushEvent(
                state,
                `${p.name} kutsama mucizesiyle ${target.name} oyuncusunu %40 canla ayağa kaldırdı!`,
                '#34d399'
              );
            } else {
              emitSound(state, 'heal', target.x, target.y);
              addFloat(state, target.x, target.y, 'KUTSAMA! ✝️ (+2 Can/sn · 20sn)', '#fde047');
            }

            p.chaplainKnifeCharges = (p.chaplainKnifeCharges ?? 0) + 1;
            addCoinReward(state, p, 'Chaplain Q (Kutsama)', 13);
            addFloat(state, p.x, p.y - 18, `+1 ÇAKI HAKKI! 🔪`, '#38bdf8');
            if (!miracleRevived) {
              pushEvent(state, `${p.name}, ${target.name} oyuncusunu kutsadı! (+1 Çakı)`, '#fde047');
            }
            state.effects.push({
              id: uid('fx'),
              kind: 'protector_beam',
              x: p.x,
              y: p.y,
              targetX: target.x,
              targetY: target.y,
              radius: 38,
              ttl: 0.45,
              maxTtl: 0.45,
              color: miracleRevived ? '#34d399' : '#facc15',
            });
          } else if (!p.isBot) {
            if (nearbyTeammates.length > 0) {
              addFloat(state, p.x, p.y, 'YAKINDAKİLER ZATEN KUTSANMIŞ!', '#facc15');
            } else {
              addFloat(state, p.x, p.y, 'Yakında takım arkadaşı yok! (Kendine basılamaz)', '#94a3b8');
            }
          }
        }

        if (inp.useE && p.cdE <= 0) {
          if ((p.chaplainKnifeCharges ?? 0) > 0) {
            p.chaplainKnifeCharges = Math.max(0, (p.chaplainKnifeCharges ?? 1) - 1);
            p.cdE = 11;
            p.abilitiesUsed += 1;
            emitSound(state, 'slash', p.x, p.y);
            state.effects.push({
              id: uid('fx'),
              kind: 'slash',
              x: p.x + Math.cos(p.angle) * 24,
              y: p.y + Math.sin(p.angle) * 24,
              angle: p.angle,
              radius: 54,
              ttl: 0.2,
              maxTtl: 0.2,
              color: '#e2e8f0',
            });
            const killer = state.players.find((k) => k.role === 'killer');
            if (killer && !killer.dead && (killer.airborneTimer ?? 0) <= 0) {
              const d = Math.hypot(killer.x - p.x, killer.y - p.y);
              const angTo = Math.atan2(killer.y - p.y, killer.x - p.x);
              const diff = Math.abs(
                Math.atan2(Math.sin(angTo - p.angle), Math.cos(angTo - p.angle))
              );
              if (
                d <= CHAPLAIN_KNIFE_RANGE + killer.radius &&
                (diff <= Math.PI * 0.65 || d <= p.radius + killer.radius + 18)
              ) {
                killer.stunTimer = Math.max(killer.stunTimer, 1.0);
                killer.dashTimer = 0;
                killer.dashKind = 'none';
                killer.multiJumpRemaining = 0;
                killer.channel = null;
                addCoinReward(state, p, 'Chaplain E (Çakı)', 8);
                addFloat(state, killer.x, killer.y, 'ÇAKI! SERSEMLEDİ (1sn)', '#fde047');
                pushEvent(state, `${p.name} çakıyla katili 1 saniye sersemletti!`, '#fde047');
                emitSound(state, 'hit', killer.x, killer.y);
                triggerShake(state, 4, 0.12);
              } else if (!p.isBot) {
                addFloat(state, p.x, p.y, 'ÇAKI ISKA!', '#94a3b8');
              }
            }
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'ÇAKI HAKKI YOK! (Q ile Kutsama Bas)', '#fbbf24');
          }
        }
      } else if (cls === 'farmer') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 25;
          p.abilitiesUsed += 1;
          const ownCrops = (state.crops || []).filter((c) => c.ownerId === p.id);
          if (ownCrops.length >= 4) {
            const oldestIdx = state.crops.findIndex((c) => c.ownerId === p.id);
            if (oldestIdx !== -1) state.crops.splice(oldestIdx, 1);
          }
          const newCrop: CropEntity = {
            id: uid('crop'),
            ownerId: p.id,
            x: p.x,
            y: p.y,
            growth: 0,
            maxGrowth: FARMER_CROP_GROW_SECONDS,
            ready: false,
            sealedByHunter: false,
          };
          state.crops.push(newCrop);
          emitSound(state, 'trap', p.x, p.y);
          addFloat(state, p.x, p.y, '🌱 HASAT DİKİLDİ! (30sn)', '#84cc16');
          pushEvent(state, `${p.name} yere hasat dikti! (30sn içinde olgunlaşacak)`, '#84cc16');
        }

        if (inp.useE && p.cdE <= 0) {
          p.cdE = 15;
          p.abilitiesUsed += 1;
          emitSound(state, 'slash', p.x, p.y);
          state.effects.push({
            id: uid('fx'),
            kind: 'slash',
            x: p.x + Math.cos(p.angle) * 28,
            y: p.y + Math.sin(p.angle) * 28,
            angle: p.angle,
            radius: 58,
            ttl: 0.22,
            maxTtl: 0.22,
            color: '#a3e635',
          });
          const killer = state.players.find((k) => k.role === 'killer');
          if (killer && !killer.dead && (killer.airborneTimer ?? 0) <= 0) {
            const d = Math.hypot(killer.x - p.x, killer.y - p.y);
            const angTo = Math.atan2(killer.y - p.y, killer.x - p.x);
            const diff = Math.abs(
              Math.atan2(Math.sin(angTo - p.angle), Math.cos(angTo - p.angle))
            );
            if (
              d <= FARMER_SCYTHE_RANGE + killer.radius &&
              (diff <= Math.PI * 0.65 || d <= p.radius + killer.radius + 18)
            ) {
              const hitLevel = Math.max(
                1,
                Math.min(FARMER_SCYTHE_MAX_LEVEL, p.farmerScytheLevel ?? 1)
              );
              let effectDesc = '';
              if (hitLevel <= 2) {
                applySlow(killer, 0.25, 1.0);
                effectDesc = '1sn %25 Yavaşlık';
              } else if (hitLevel === 3) {
                killer.stunTimer = Math.max(killer.stunTimer, 1.0);
                killer.frozenTimer = Math.max(killer.frozenTimer ?? 0, 1.0);
                effectDesc = '1sn Donma';
              } else if (hitLevel <= 5) {
                killer.stunTimer = Math.max(killer.stunTimer, 1.5);
                killer.frozenTimer = Math.max(killer.frozenTimer ?? 0, 1.5);
                applySlow(killer, 0.25, killer.stunTimer + 1.0);
                effectDesc = '1.5sn Donma + 1sn %25 Yavaşlık';
              } else if (hitLevel <= 8) {
                killer.stunTimer = Math.max(killer.stunTimer, 2.0);
                killer.frozenTimer = Math.max(killer.frozenTimer ?? 0, 2.0);
                effectDesc = '2sn Donma';
              } else {
                killer.stunTimer = Math.max(killer.stunTimer, 2.5);
                applySlow(killer, 0.3, killer.stunTimer + 3.0);
                effectDesc = '2.5sn STUN + 3sn %30 Yavaşlık';
              }

              if (hitLevel >= 3) {
                killer.dashTimer = 0;
                killer.dashKind = 'none';
                killer.multiJumpRemaining = 0;
                killer.channel = null;
              }

              const nextLevel = Math.min(FARMER_SCYTHE_MAX_LEVEL, hitLevel + 1);
              p.farmerScytheLevel = nextLevel;

              addCoinReward(state, p, 'Farmer E (Tırpan)', 8);
              addFloat(
                state,
                killer.x,
                killer.y,
                `TIRPAN Lv.${hitLevel}! (${effectDesc})`,
                hitLevel >= 9 ? '#fde047' : hitLevel >= 3 ? '#38bdf8' : '#a3e635'
              );
              pushEvent(
                state,
                `${p.name} Lv.${hitLevel} Tırpan ile katili vurdu (${effectDesc})!${
                  nextLevel > hitLevel ? ` Tırpan Lv.${nextLevel} oldu!` : ' (MAX Lv.9!)'
                }`,
                '#84cc16'
              );
              emitSound(state, 'hit', killer.x, killer.y);
              triggerShake(state, hitLevel >= 9 ? 6 : 4, 0.14);
            } else if (!p.isBot) {
              addFloat(state, p.x, p.y, 'TIRPAN ISKA!', '#94a3b8');
            }
          }
        }
      } else if (cls === 'shadow') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 15;
          p.abilitiesUsed += 1;
          p.shadowInvisTimer = SHADOW_INVIS_SECONDS;
          emitSound(state, 'vent', p.x, p.y);
          addFloat(state, p.x, p.y, '🌑 GÖRÜNMEZ! (3sn · +%20 Stamina)', '#a78bfa');
          state.effects.push({
            id: uid('fx'),
            kind: 'hunter_teleport',
            x: p.x,
            y: p.y,
            radius: 36,
            ttl: 0.35,
            maxTtl: 0.35,
            color: '#8b5cf6',
          });
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 25;
          p.abilitiesUsed += 1;
          p.dashKind = 'shadow_e';
          p.dashTimer = SHADOW_DASH_DURATION;
          p.dashHitIds = [];
          const dashSpd =
            SHADOW_DASH_SPEED * SPEED_TO_PX * (p.carryingSurvivorId ? CARRY_SPEED_MULT : 1);
          p.dashVx = Math.cos(p.angle) * dashSpd;
          p.dashVy = Math.sin(p.angle) * dashSpd;
          emitSound(state, 'jump', p.x, p.y);
          addFloat(state, p.x, p.y, '🌑 GÖLGE DASH!', '#a78bfa');
          state.effects.push({
            id: uid('fx'),
            kind: 'hunter_teleport',
            x: p.x,
            y: p.y,
            radius: 32,
            ttl: 0.28,
            maxTtl: 0.28,
            color: '#8b5cf6',
          });
        }
      }
    }

    // --- KILLER ABILITIES ---
    if (p.role === 'killer') {
      const kId = p.killerId!;

      if (kId === 'jumper') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 7;
          p.abilitiesUsed += 1;
          p.dashKind = 'jumper_q';
          p.dashTimer = 0.42;
          p.dashHitIds = [];
          const spd = 610;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          emitSound(state, 'jump', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 12;
          p.abilitiesUsed += 1;
          p.dashKind = 'jumper_e';
          p.dashTimer = 0.22;
          p.multiJumpRemaining = 4; // 1 + 4 = 5 consecutive AoE jumps
          p.multiJumpHitAny = false;
          p.dashHitIds = [];
          const spd = (p.baseSpeed + 13) * SPEED_TO_PX;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          addFloat(state, p.x, p.y, '5x SIÇRAYIŞ!', '#f59e0b');
          emitSound(state, 'jump', p.x, p.y);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 12;
          p.abilitiesUsed += 1;
          p.airborneTimer = 0.58;
          p.airborneTargetX = Math.max(
            TILE_SIZE + p.radius,
            Math.min(state.mapWidth - TILE_SIZE - p.radius, p.x + Math.cos(p.angle) * 200)
          );
          p.airborneTargetY = Math.max(
            TILE_SIZE + p.radius,
            Math.min(state.mapHeight - TILE_SIZE - p.radius, p.y + Math.sin(p.angle) * 200)
          );
          emitSound(state, 'jump', p.x, p.y);
          addFloat(state, p.x, p.y, 'HAVAYA SIÇRADI!', '#f59e0b');
        }
      } else if (kId === 'juggernaut') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 10;
          p.abilitiesUsed += 1;
          p.dashKind = 'juggernaut_q';
          p.dashTimer = 0.48;
          p.dashHitIds = [];
          const spd = 740;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          emitSound(state, 'slash', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 13;
          p.abilitiesUsed += 1;
          const armSpeed = 880;
          state.projectiles.push({
            id: uid('arm'),
            ownerId: p.id,
            kind: 'juggernaut_arm',
            x: p.x + Math.cos(p.angle) * 26,
            y: p.y + Math.sin(p.angle) * 26,
            startX: p.x,
            startY: p.y,
            vx: Math.cos(p.angle) * armSpeed,
            vy: Math.sin(p.angle) * armSpeed,
            radius: 17,
            damage: 32,
            maxRange: 560,
          });
          // Juggernaut E triggers reload / hit recovery motion
          p.hitRecoveryTimer = JUGGERNAUT_HIT_RECOVERY_SECONDS;
          p.cdAttack = Math.max(p.cdAttack, JUGGERNAUT_HIT_RECOVERY_SECONDS);
          applySlow(p, KILLER_HIT_RECOVERY_SLOW, JUGGERNAUT_HIT_RECOVERY_SECONDS);
          emitSound(state, 'slash', p.x, p.y);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 22;
          p.abilitiesUsed += 1;
          p.invisibleTimer = 4.5;
          addFloat(state, p.x, p.y, 'GÖRÜNMEZ! (4.5sn)', '#94a3b8');
        }
      } else if (kId === 'smile') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 9;
          p.abilitiesUsed += 1;
          const ballSpeed = 780;
          state.projectiles.push({
            id: uid('sball'),
            ownerId: p.id,
            kind: 'smile_ball',
            x: p.x + Math.cos(p.angle) * 28,
            y: p.y + Math.sin(p.angle) * 28,
            startX: p.x,
            startY: p.y,
            vx: Math.cos(p.angle) * ballSpeed,
            vy: Math.sin(p.angle) * ballSpeed,
            radius: 12,
            damage: 50,
            maxRange: 950,
          });
          emitSound(state, 'knife', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 12;
          p.abilitiesUsed += 1;
          state.traps.push({
            id: uid('mine'),
            ownerId: p.id,
            kind: 'smile_mine',
            x: p.x,
            y: p.y,
            radius: 21,
            triggered: false,
          });
          addFloat(state, p.x, p.y, 'MAYIN KURULDU!', '#e11d48');
          emitSound(state, 'trap', p.x, p.y);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 14;
          p.abilitiesUsed += 1;
          for (const side of [-1, 1]) {
            const spawnAng = p.angle + side * (Math.PI * 0.35);
            const rawX = p.x + Math.cos(spawnAng) * 34;
            const rawY = p.y + Math.sin(spawnAng) * 34;
            const resolved = resolveCircleMapCollisions(state, rawX, rawY, 13, {
              blockWoodBarricades: true,
              blockLockedDoors: true,
            });
            const minion: SmileMinion = {
              id: uid('smin'),
              ownerId: p.id,
              x: resolved.x,
              y: resolved.y,
              vx: 0,
              vy: 0,
              angle: p.angle,
              radius: 13,
              ttl: 13,
              maxTtl: 13,
              attackCooldown: 0.25,
              hitRecoveryTimer: 0,
              repathTimer: 0,
            };
            state.smileMinions.push(minion);
          }
          addFloat(state, p.x, p.y, '2x GÜLÜCÜK ORDUSU (13sn)!', '#f43f5e');
          pushEvent(state, 'Smile 2 küçük gülücük adam çağırdı!', '#f43f5e');
          emitSound(state, 'teleport', p.x, p.y);
        }
      } else if (kId === 'hungry') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 6;
          p.abilitiesUsed += 1;
          const knifeSpeed = 800;
          state.projectiles.push({
            id: uid('knife'),
            ownerId: p.id,
            kind: 'kitchen_knife',
            x: p.x + Math.cos(p.angle) * 28,
            y: p.y + Math.sin(p.angle) * 28,
            startX: p.x,
            startY: p.y,
            vx: Math.cos(p.angle) * knifeSpeed,
            vy: Math.sin(p.angle) * knifeSpeed,
            radius: 13,
            damage: 60,
            maxRange: 620,
          });
          emitSound(state, 'knife', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 11;
          p.abilitiesUsed += 1;
          const smashX = p.x + Math.cos(p.angle) * 56;
          const smashY = p.y + Math.sin(p.angle) * 56;
          const smashRadius = 80;
          state.effects.push({
            id: uid('fx'),
            kind: 'hungry_cleave',
            x: smashX,
            y: smashY,
            angle: p.angle,
            radius: smashRadius,
            ttl: 0.35,
            maxTtl: 0.35,
            color: '#ef4444',
          });
          emitSound(state, 'break', smashX, smashY);

          // 1. Break inner wall tiles (don't break outer map perimeter 0 or max)
          const minC = Math.max(1, Math.floor((smashX - smashRadius) / TILE_SIZE));
          const maxC = Math.min(state.cols - 2, Math.floor((smashX + smashRadius) / TILE_SIZE));
          const minR = Math.max(1, Math.floor((smashY - smashRadius) / TILE_SIZE));
          const maxR = Math.min(state.rows - 2, Math.floor((smashY + smashRadius) / TILE_SIZE));
          let brokeWall = false;
          for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
              const idx = r * state.cols + c;
              if (state.tiles[idx] === 1 || state.tiles[idx] === 2) {
                if (
                  circleIntersectsRect(
                    smashX,
                    smashY,
                    smashRadius * 0.85,
                    c * TILE_SIZE,
                    r * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE
                  )
                ) {
                  state.tiles[idx] = 3; // Breached wall!
                  brokeWall = true;
                }
              }
            }
          }
          if (brokeWall) {
            addFloat(state, smashX, smashY, 'DUVAR DELİNDİ!', '#ef4444');
            pushEvent(state, 'Hungry duvarı deldi!', '#ef4444');
          }
          triggerShake(state, 9, 0.24);

          // 2. Break vents
          for (const vent of state.vents) {
            if (!vent.broken && Math.hypot(vent.x - smashX, vent.y - smashY) <= smashRadius + 16) {
              vent.broken = true;
              addFloat(state, vent.x, vent.y, 'VENT BOZULDU!', '#f97316');
              pushEvent(state, `${vent.label} bozuldu!`, '#f97316');
            }
          }

          // 3. Damage/break doors (deals 7 damage to locked doors; cannot one-shot 10-HP reinforced doors!)
          for (let di = state.doors.length - 1; di >= 0; di--) {
            const door = state.doors[di];
            if (
              !door.broken &&
              circleIntersectsRect(smashX, smashY, smashRadius, door.x, door.y, door.w, door.h)
            ) {
              if (!door.locked) {
                door.broken = true;
                door.locked = false;
                door.open = true;
                addFloat(state, door.x + door.w / 2, door.y, 'KAPI KIRILDI!', '#ef4444');
                pushEvent(state, `${door.label || 'Kapı'} parçalandı!`, '#ef4444');
              } else {
                const maxHits = door.maxLockHits ?? DOOR_MAX_LOCK_HITS;
                door.lockHits += 7;
                if (door.lockHits >= maxHits) {
                  if (door.isCustom) {
                    state.doors.splice(di, 1);
                  } else {
                    door.broken = true;
                    door.locked = false;
                    door.open = true;
                  }
                  addFloat(state, door.x + door.w / 2, door.y, 'KAPI KIRILDI!', '#ef4444');
                  pushEvent(state, `${door.label || 'Kapı'} parçalandı!`, '#ef4444');
                } else {
                  addFloat(
                    state,
                    door.x + door.w / 2,
                    door.y,
                    `KAPI HASARI ${door.lockHits}/${maxHits}`,
                    '#fbbf24'
                  );
                  pushEvent(
                    state,
                    `${door.label || 'Kapı'} satırdan 7 hasar aldı! (${maxHits - door.lockHits} can kaldı)`,
                    '#fbbf24'
                  );
                }
              }
            }
          }

          // 4. Break barricades
          for (const bar of state.barricades) {
            if (circleIntersectsRect(smashX, smashY, smashRadius, bar.x, bar.y, bar.w, bar.h)) {
              bar.hp = 0;
              addFloat(state, bar.x + bar.w / 2, bar.y, 'BARİKAT PARÇALANDI!', '#f97316');
            }
          }

          // 5. Destroy traps
          for (let i = state.traps.length - 1; i >= 0; i--) {
            const tr = state.traps[i];
            if (tr.kind === 'smile_mine') continue;
            if (Math.hypot(tr.x - smashX, tr.y - smashY) <= smashRadius + tr.radius) {
              state.traps.splice(i, 1);
              addFloat(state, tr.x, tr.y, 'TUZAK KIRILDI!', '#a855f7');
            }
          }

          // 6. Destroy turrets
          for (let i = state.turrets.length - 1; i >= 0; i--) {
            const tur = state.turrets[i];
            if (Math.hypot(tur.x - smashX, tur.y - smashY) <= smashRadius + 16) {
              state.turrets.splice(i, 1);
            }
          }

          // 7. Hit humans for 95 damage
          for (const s of state.players) {
            if (
              s.role === 'survivor' &&
              !s.dead &&
              Math.hypot(s.x - smashX, s.y - smashY) <= smashRadius + s.radius
            ) {
              dealDamageToSurvivor(state, p, s, 95);
            }
          }
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 12;
          p.abilitiesUsed += 1;
          p.frenzyTimer = 6.0;
          addFloat(state, p.x, p.y, 'KIZIL ÖFKE! +5 HIZ (6sn)', '#ef4444');
        }
      } else if (kId === 'sawblooder') {
        if (inp.useQ && p.cdQ <= 0 && !p.sawMalfunction) {
          p.cdQ = 8;
          p.abilitiesUsed += 1;
          p.dashKind = 'sawblooder_q';
          p.dashTimer = 1.05;
          p.dashHitIds = [];
          const spd = 42 * SPEED_TO_PX;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          emitSound(state, 'slash', p.x, p.y);
          addFloat(state, p.x, p.y, 'VAHŞİ ATILIM!', '#dc2626');
          triggerShake(state, 5, 0.2);
        }
        if (inp.useE && p.cdE <= 0 && !p.sawMalfunction) {
          p.cdE = 13;
          p.abilitiesUsed += 1;
          p.chainsawChargeTimer = 1;
          p.chainsawChargeDuration = 0;
          emitSound(state, 'slash', p.x, p.y);
          addFloat(state, p.x, p.y, 'TESTERE HÜCUMU! (85 Hasar)', '#ef4444');
          triggerShake(state, 5, 0.2);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 10;
          p.abilitiesUsed += 1;
          p.chainsawFlurryTimer = 6.0;
          p.chainsawFlurryHitCooldowns = {};
          emitSound(state, 'slash', p.x, p.y);
          addFloat(state, p.x, p.y, 'KANLI KATLİAM (6sn)! +6 HIZ', '#dc2626');
          pushEvent(state, 'Sawblooder kanlı katliama başladı!', '#dc2626');
          triggerShake(state, 6, 0.25);
        }
      } else if (kId === 'darkness') {
        if (inp.useQ && p.cdQ <= 0) {
          const nearVent = state.vents.find(
            (v) => !v.broken && Math.hypot(v.x - p.x, v.y - p.y) <= 84
          );
          if (nearVent) {
            const others = state.vents.filter((v) => !v.broken && v.id !== nearVent.id);
            const picked =
              (inp.ventTargetId && others.find((v) => v.id === inp.ventTargetId)) ||
              [...others].sort(
                (a, b) =>
                  Math.hypot(a.x - nearVent.x, a.y - nearVent.y) -
                  Math.hypot(b.x - nearVent.x, b.y - nearVent.y)
              )[0];
            if (picked) {
              p.cdQ = 7;
              p.abilitiesUsed += 1;
              emitSound(state, 'vent', p.x, p.y);
              addFloat(state, p.x, p.y, 'GÖLGE VENTİ!', '#a855f7');
              p.x = picked.x;
              p.y = picked.y;
              emitSound(state, 'vent', p.x, p.y);
              addFloat(state, p.x, p.y, picked.label, '#c084fc');
            }
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'Yakında sağlam vent yok!', '#94a3b8');
          }
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 10;
          p.abilitiesUsed += 1;
          p.darknessStealthTimer = 5.5;
          p.dashKind = 'darkness_e';
          p.dashTimer = 0.4;
          p.dashHitIds = [];
          const spd = 38 * SPEED_TO_PX;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          emitSound(state, 'vent', p.x, p.y);
          addFloat(state, p.x, p.y, 'GÖLGE ATILIMI! (%95 Şeffaf)', '#a855f7');
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 14;
          p.abilitiesUsed += 1;
          p.darknessModeTimer = 5.0;
          emitSound(state, 'lock', p.x, p.y);
          addFloat(state, p.x, p.y, 'KARANLIK MOD! (+%45 Hız · Duvar Geçişi)', '#a855f7');
          triggerShake(state, 5, 0.16);
        }
      } else if (kId === 'hunter') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 12;
          p.abilitiesUsed += 1;
          const ownScythes = state.traps.filter(
            (tr) => tr.kind === 'hunter_scythe' && tr.ownerId === p.id
          );
          if (ownScythes.length >= 4) {
            const oldestIdx = state.traps.findIndex(
              (tr) => tr.kind === 'hunter_scythe' && tr.ownerId === p.id
            );
            if (oldestIdx !== -1) state.traps.splice(oldestIdx, 1);
          }
          state.traps.push({
            id: uid('trap'),
            ownerId: p.id,
            kind: 'hunter_scythe',
            x: p.x,
            y: p.y,
            radius: 22,
            triggered: false,
          });
          emitSound(state, 'trap', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          type SealCand =
            | { kind: 'chest'; dist: number; obj: ChestEntity; x: number; y: number; label: string }
            | { kind: 'crop'; dist: number; obj: CropEntity; x: number; y: number; label: string }
            | { kind: 'door'; dist: number; obj: GameState['doors'][number]; x: number; y: number; label: string }
            | { kind: 'vent'; dist: number; obj: GameState['vents'][number]; x: number; y: number; label: string };
          const cands: SealCand[] = [];
          for (const ch of state.chests || []) {
            if (!ch.opened && !ch.sealedByHunter) {
              const d = Math.hypot(ch.x - p.x, ch.y - p.y);
              if (d <= 96) cands.push({ kind: 'chest', dist: d, obj: ch, x: ch.x, y: ch.y, label: 'Sandık' });
            }
          }
          for (const cr of state.crops || []) {
            if (!cr.sealedByHunter) {
              const d = Math.hypot(cr.x - p.x, cr.y - p.y);
              if (d <= 96) cands.push({ kind: 'crop', dist: d, obj: cr, x: cr.x, y: cr.y, label: 'Hasat' });
            }
          }
          for (const door of state.doors) {
            if (!door.broken && !door.sealedByHunter) {
              const d = distToRect(p.x, p.y, door.x, door.y, door.w, door.h);
              if (d <= 96) {
                cands.push({
                  kind: 'door',
                  dist: d,
                  obj: door,
                  x: door.x + door.w / 2,
                  y: door.y + door.h / 2,
                  label: 'Kapı',
                });
              }
            }
          }
          for (const vent of state.vents) {
            if (!vent.broken && !vent.sealedByHunter) {
              const d = Math.hypot(vent.x - p.x, vent.y - p.y);
              if (d <= 96) cands.push({ kind: 'vent', dist: d, obj: vent, x: vent.x, y: vent.y, label: 'Vent' });
            }
          }
          cands.sort((a, b) => a.dist - b.dist);
          const picked = cands[0];
          if (picked) {
            picked.obj.sealedByHunter = true;
            p.cdE = 21;
            p.abilitiesUsed += 1;
            emitSound(state, 'lock', picked.x, picked.y);
            addFloat(
              state,
              picked.x,
              picked.y,
              picked.kind === 'crop' ? '☠️ HASAT ZEHİRLENDİ!' : `${picked.label.toUpperCase()} MÜHÜRLENDİ!`,
              picked.kind === 'crop' ? '#ef4444' : '#f59e0b'
            );
          } else if (!p.isBot) {
            addFloat(state, p.x, p.y, 'Yakında mühürlenecek kapı/sandık/vent/hasat yok!', '#94a3b8');
          }
        }
        if (inp.useR && p.cdR <= 0 && !p.hunterShotgunReady && (p.hunterShotgunRecoverTimer ?? 0) <= 0) {
          p.hunterShotgunReady = true;
          emitSound(state, 'lock', p.x, p.y);
          addFloat(state, p.x, p.y, 'ESKİ POMPALI HAZIR! (Sol Tık / R)', '#fbbf24');
        }
      }
    }
  }

  // Keep carried downed survivors synced cleanly on their carrier's back
  for (const carrier of state.players) {
    if (!carrier.carryingSurvivorId) continue;
    const carried = state.players.find((pl) => pl.id === carrier.carryingSurvivorId);
    if (!carried || carried.dead || !carried.downed || carrier.dead || carrier.downed) {
      dropCarriedSurvivor(state, carrier, true);
      continue;
    }
    carried.x = carrier.x;
    carried.y = carrier.y;
    carried.vx = carrier.vx;
    carried.vy = carrier.vy;
    carried.angle = carrier.angle;
  }

  // --- SMILE R MINIONS (10s duration, speed 13, 17 dmg on catch + hit slowdown recovery) ---
  const aliveSurvsForMinions = state.players.filter((p) => p.role === 'survivor' && !p.dead);
  const visibleSurvsForMinions = aliveSurvsForMinions.filter((s) => (s.shadowInvisTimer ?? 0) <= 0);
  const allMinionTargetsDowned =
    visibleSurvsForMinions.length > 0 && visibleSurvsForMinions.every((s) => s.downed);
  const minionPool = allMinionTargetsDowned
    ? visibleSurvsForMinions
    : visibleSurvsForMinions.filter((s) => (!s.downed || s.downVulnerable) && !s.carriedById);
  const effectiveMinionTargets = minionPool.length > 0 ? minionPool : visibleSurvsForMinions;

  for (let i = state.smileMinions.length - 1; i >= 0; i--) {
    const m = state.smileMinions[i];
    m.ttl -= dt;
    if (m.ttl <= 0) {
      state.smileMinions.splice(i, 1);
      continue;
    }

    m.attackCooldown = Math.max(0, m.attackCooldown - dt);
    m.hitRecoveryTimer = Math.max(0, (m.hitRecoveryTimer ?? 0) - dt);
    m.repathTimer = (m.repathTimer ?? 0) - dt;

    // Pick nearest chase target
    const candidateTargets = effectiveMinionTargets;
    let target: PlayerState | null = null;
    let bestD = Infinity;
    for (const s of candidateTargets) {
      const d = Math.hypot(s.x - m.x, s.y - m.y);
      if (d < bestD) {
        bestD = d;
        target = s;
      }
    }

    const woodBarsForMinions = state.barricades.filter((b) => b.kind === 'wood');

    if (target) {
      m.targetId = target.id;
      const blockedDirectByWood = woodBarsForMinions.some((b) => {
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        const dSeg = Math.hypot(target.x - m.x, target.y - m.y);
        if (dSeg < 1) return false;
        const ux = (target.x - m.x) / dSeg;
        const uy = (target.y - m.y) / dSeg;
        const proj = (bx - m.x) * ux + (by - m.y) * uy;
        const perp = Math.abs((bx - m.x) * -uy + (by - m.y) * ux);
        return proj >= -16 && proj <= dSeg + 16 && perp < Math.max(b.w, b.h) * 0.65 + m.radius;
      });
      const directWalk =
        !blockedDirectByWood &&
        hasWalkableLine(
          state.tiles,
          state.cols,
          state.rows,
          m.x,
          m.y,
          target.x,
          target.y,
          m.radius
        );
      if (directWalk) {
        m.path = [{ x: target.x, y: target.y }];
      } else if (!m.path || m.path.length === 0 || (m.repathTimer ?? 0) <= 0) {
        m.path = findPathWaypoints(
          state.tiles,
          state.cols,
          state.rows,
          m.x,
          m.y,
          target.x,
          target.y,
          {
            pad: 15,
            blockedBarricades: woodBarsForMinions,
            blockedDoors: state.doors,
          }
        );
        m.repathTimer = 0.22;
      }

      while (m.path && m.path.length > 1) {
        if (Math.hypot(m.path[0].x - m.x, m.path[0].y - m.y) < 22) {
          m.path.shift();
        } else {
          break;
        }
      }

      const wp = (m.path && m.path[0]) || { x: target.x, y: target.y };
      const dx = wp.x - m.x;
      const dy = wp.y - m.y;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        const speedPx = SMILE_MINION_SPEED * SPEED_TO_PX * ((m.hitRecoveryTimer ?? 0) > 0 ? 0.5 : 1);
        m.vx = (dx / len) * speedPx;
        m.vy = (dy / len) * speedPx;
        m.angle = Math.atan2(dy, dx);
        const pos = resolveCircleMapCollisions(state, m.x + m.vx * dt, m.y + m.vy * dt, m.radius, {
          blockWoodBarricades: true,
          blockLockedDoors: true,
        });
        m.x = pos.x;
        m.y = pos.y;
      } else {
        m.vx = 0;
        m.vy = 0;
      }

      // Catch survivor -> 26 damage + 1.0s post-hit slowdown recovery
      if (m.attackCooldown <= 0) {
        const owner = state.players.find((pl) => pl.id === m.ownerId);
        for (const s of aliveSurvsForMinions) {
          if (Math.hypot(s.x - m.x, s.y - m.y) <= m.radius + s.radius + 6) {
            if (owner) {
              const hit = dealDamageToSurvivor(state, owner, s, 26, false, false);
              if (hit) {
                emitSound(state, 'slash', m.x, m.y);
                state.effects.push({
                  id: uid('fx'),
                  kind: 'slash',
                  x: m.x + Math.cos(m.angle) * 18,
                  y: m.y + Math.sin(m.angle) * 18,
                  angle: m.angle,
                  radius: 28,
                  ttl: 0.18,
                  maxTtl: 0.18,
                  color: '#f43f5e',
                });
                m.attackCooldown = 1.05;
                m.hitRecoveryTimer = 0.85;
                break;
              } else if (s.dodgeTimer > 0) {
                m.attackCooldown = 0.9;
                m.hitRecoveryTimer = 0.85;
                break;
              }
            }
          }
        }
      }
    }
  }

  // --- TURRETS ---
  const killer = state.players.find((p) => p.role === 'killer');
  for (const turret of state.turrets) {
    turret.fireCooldown = Math.max(0, turret.fireCooldown - dt);
    if (
      killer &&
      killer.invisibleTimer <= 0 &&
      (killer.darknessStealthTimer ?? 0) <= 0 &&
      Math.hypot(killer.x - turret.x, killer.y - turret.y) <= 340
    ) {
      turret.angle = Math.atan2(killer.y - turret.y, killer.x - turret.x);
      if (
        turret.fireCooldown <= 0 &&
        hasLineOfSight(state.tiles, state.cols, state.rows, turret.x, turret.y, killer.x, killer.y)
      ) {
        turret.fireCooldown = 1.25;
        state.projectiles.push({
          id: uid('bolt'),
          ownerId: turret.ownerId,
          kind: 'turret_bolt',
          x: turret.x + Math.cos(turret.angle) * 16,
          y: turret.y + Math.sin(turret.angle) * 16,
          startX: turret.x,
          startY: turret.y,
          vx: Math.cos(turret.angle) * 560,
          vy: Math.sin(turret.angle) * 560,
          radius: 6,
          damage: 0,
          maxRange: 380,
        });
        emitSound(state, 'turret', turret.x, turret.y);
      }
    }
  }

  // --- PROJECTILES ---
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];

    if (proj.kind === 'meat_lob') {
      // Lobbed over walls! Duvar arkasından da atılabilir
      proj.lobProgress = Math.min(1, (proj.lobProgress ?? 0) + dt / (proj.lobDuration || 0.65));
      const targetX = proj.targetX ?? proj.startX;
      const targetY = proj.targetY ?? proj.startY;
      proj.x = proj.startX + (targetX - proj.startX) * proj.lobProgress;
      proj.y = proj.startY + (targetY - proj.startY) * proj.lobProgress;
      proj.lobHeight = Math.sin(proj.lobProgress * Math.PI) * 75; // 75px parabolic peak height

      // Trail of bloody droplets in flight
      if (Math.random() < 0.35) {
        state.bloodStains.push({
          id: uid('blood'),
          x: proj.x + (Math.random() - 0.5) * 8,
          y: proj.y + (Math.random() - 0.5) * 8,
          radius: 6 + Math.random() * 8,
          angle: Math.random() * Math.PI * 2,
          seed: Math.random() * 100,
          alpha: 0.6,
        });
      }

      if (proj.lobProgress >= 1) {
        const splashRadius = 78;
        const owner = state.players.find((pl) => pl.id === proj.ownerId);

        // 1. Deal 35 damage to survivors in splash radius
        let hitAny = false;
        for (const s of state.players) {
          if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - proj.x, s.y - proj.y) <= splashRadius + s.radius) {
            if (owner) {
              dealDamageToSurvivor(state, owner, s, 35);
              hitAny = true;
            }
          }
        }

        // 2. "o alan kana bulanır" (Drench area in blood stains)
        for (let b = 0; b < 7; b++) {
          const offA = Math.random() * Math.PI * 2;
          const offD = Math.random() * (splashRadius * 0.85);
          state.bloodStains.push({
            id: uid('blood'),
            x: proj.x + Math.cos(offA) * offD,
            y: proj.y + Math.sin(offA) * offD,
            radius: 22 + Math.random() * 26,
            angle: Math.random() * Math.PI * 2,
            seed: Math.random() * 1000,
            alpha: 0.9,
          });
        }

        // 3. AoE visual burst & sound
        state.effects.push({
          id: uid('fx'),
          kind: 'blood_splatter',
          x: proj.x,
          y: proj.y,
          radius: splashRadius,
          ttl: 0.55,
          maxTtl: 0.55,
          color: '#b91c1c',
        });
        emitSound(state, 'hit', proj.x, proj.y);
        triggerShake(state, 5, 0.18);
        addFloat(state, proj.x, proj.y, hitAny ? 'KANLI ET PATLAMASI! (35 Hasar)' : 'KANLI ET İNFİLAKI!', '#dc2626');

        state.projectiles.splice(i, 1);
      }
      continue;
    }

    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    const explodeSmileBall = () => {
      const splashRadius = 100;
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      let hitCount = 0;
      for (const s of state.players) {
        if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - proj.x, s.y - proj.y) <= splashRadius + s.radius) {
          if (owner && dealDamageToSurvivor(state, owner, s, proj.damage)) {
            hitCount += 1;
          }
        }
      }
      state.effects.push({
        id: uid('fx'),
        kind: 'fighter_punch',
        x: proj.x,
        y: proj.y,
        radius: splashRadius,
        ttl: 0.42,
        maxTtl: 0.42,
        color: '#e11d48',
      });
      emitSound(state, 'break', proj.x, proj.y);
      triggerShake(state, 5, 0.16);
      if (hitCount > 0) {
        addFloat(state, proj.x, proj.y, `KARANLIK PATLAMA! (${proj.damage} Hasar)`, '#e11d48');
      }
      state.projectiles.splice(i, 1);
    };

    const isProtectorProj = proj.kind === 'protector_shield' || proj.kind === 'protector_protect';
    if (isProtectorProj) {
      proj.homingElapsed = (proj.homingElapsed ?? 0) + dt;
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      const refX = owner && !owner.dead ? owner.x : proj.x;
      const refY = owner && !owner.dead ? owner.y : proj.y;
      const nearbyAlly = state.players
        .filter(
          (s) =>
            s.role === 'survivor' &&
            !s.dead &&
            s.id !== proj.ownerId &&
            (Math.hypot(s.x - refX, s.y - refY) <= PROTECTOR_STAFF_RANGE ||
              Math.hypot(s.x - proj.x, s.y - proj.y) <= PROTECTOR_STAFF_RANGE)
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - proj.x, a.y - proj.y) - Math.hypot(b.x - proj.x, b.y - proj.y)
        )[0];

      const homingTarget = nearbyAlly ?? (proj.homingElapsed >= 0.14 && owner && !owner.dead ? owner : undefined);
      if (homingTarget) {
        const ang = Math.atan2(homingTarget.y - proj.y, homingTarget.x - proj.x);
        const speed = 620;
        proj.vx = Math.cos(ang) * speed;
        proj.vy = Math.sin(ang) * speed;
        proj.returning = homingTarget.id === proj.ownerId;
      }
    }

    const c = Math.floor(proj.x / TILE_SIZE);
    const r = Math.floor(proj.y / TILE_SIZE);
    const tile = getTileAt(state.tiles, state.cols, state.rows, c, r);
    // Concrete walls block projectiles (except Protector spells which pass through walls!)
    if (tile === 1 && !isProtectorProj) {
      if (proj.kind === 'smile_ball') {
        explodeSmileBall();
      } else {
        state.projectiles.splice(i, 1);
      }
      continue;
    }

    const distFromStart = Math.hypot(proj.x - proj.startX, proj.y - proj.startY);
    if (
      isProtectorProj
        ? (proj.homingElapsed ?? 0) >= 2.5
        : distFromStart >= proj.maxRange
    ) {
      if (proj.kind === 'smile_ball') {
        explodeSmileBall();
      } else {
        state.projectiles.splice(i, 1);
      }
      continue;
    }

    if (proj.kind === 'turret_bolt') {
      if (killer && Math.hypot(killer.x - proj.x, killer.y - proj.y) <= killer.radius + proj.radius) {
        applySlow(killer, 0.5, 2.2); // 50% slow
        addFloat(state, killer.x, killer.y, 'TARET! -%50 Hız', '#fb923c');
        emitSound(state, 'hit', killer.x, killer.y);
        state.projectiles.splice(i, 1);
      }
    } else if (proj.kind === 'smile_ball') {
      let hitSurvivor = false;
      for (const s of state.players) {
        if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - proj.x, s.y - proj.y) <= s.radius + proj.radius) {
          hitSurvivor = true;
          break;
        }
      }
      if (hitSurvivor) {
        explodeSmileBall();
      }
    } else if (proj.kind === 'kitchen_knife' || proj.kind === 'juggernaut_arm') {
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      let consumed = false;
      for (const s of state.players) {
        if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - proj.x, s.y - proj.y) <= s.radius + proj.radius) {
          if (owner) {
            const hit = dealDamageToSurvivor(state, owner, s, proj.damage);
            if (hit && proj.kind === 'juggernaut_arm') {
              applySlow(s, 0.5, 1.5); // 50% slow for 1.5s
              // Pull survivor toward Juggernaut
              const pullAngle = Math.atan2(owner.y - s.y, owner.x - s.x);
              const pullDuration = 0.28;
              const pullDist = Math.min(340, Math.max(0, Math.hypot(owner.x - s.x, owner.y - s.y) - 48));
              s.dashKind = 'pull';
              s.dashTimer = pullDuration;
              s.dashVx = Math.cos(pullAngle) * (pullDist / pullDuration);
              s.dashVy = Math.sin(pullAngle) * (pullDist / pullDuration);
              addFloat(state, s.x, s.y, 'ÇEKİLDİ! -%50 Hız', '#dc2626');
            }
          }
          consumed = true;
          break;
        }
      }
      if (consumed) {
        state.projectiles.splice(i, 1);
      }
    } else if (proj.kind === 'protector_shield' || proj.kind === 'protector_protect') {
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      const canHitOwner = Boolean(proj.returning && (proj.homingElapsed ?? 0) >= 0.14);
      const candidates = state.players
        .filter(
          (s) =>
            s.role === 'survivor' &&
            !s.dead &&
            (s.id !== proj.ownerId || canHitOwner) &&
            Math.hypot(s.x - proj.x, s.y - proj.y) <= s.radius + proj.radius + 4
        )
        .sort((a, b) => {
          // Prioritize teammates before owner if overlapping at close range
          if (a.id === proj.ownerId && b.id !== proj.ownerId) return 1;
          if (b.id === proj.ownerId && a.id !== proj.ownerId) return -1;
          return Math.hypot(a.x - proj.x, a.y - proj.y) - Math.hypot(b.x - proj.x, b.y - proj.y);
        });
      const target = candidates[0];
      if (target) {
        if (proj.kind === 'protector_shield') {
          target.shieldHp = PROTECTOR_SHIELD_AMOUNT;
          if (target.id !== proj.ownerId) {
            addCoinReward(state, owner, 'Protector Q (Kalkan)', 12);
          }
          addFloat(state, target.x, target.y, `+${PROTECTOR_SHIELD_AMOUNT} KALKAN!`, '#38bdf8');
          if (owner) {
            pushEvent(
              state,
              target.id === owner.id
                ? `${owner.name} kendisine +${PROTECTOR_SHIELD_AMOUNT} Kalkan verdi!`
                : `${owner.name}, ${target.name} için +${PROTECTOR_SHIELD_AMOUNT} Kalkan verdi!`,
              '#38bdf8'
            );
          }
          emitSound(state, 'heal', target.x, target.y);
          state.effects.push({
            id: uid('fx'),
            kind: 'protector_beam',
            x: target.x,
            y: target.y,
            targetX: target.x,
            targetY: target.y,
            radius: 48,
            ttl: 0.42,
            maxTtl: 0.42,
            color: '#38bdf8',
          });
        } else {
          target.protectedTimer = PROTECTOR_PROTECT_SECONDS;
          if (target.id !== proj.ownerId) {
            addCoinReward(state, owner, 'Protector E (Koruma)', 15);
          }
          addFloat(state, target.x, target.y, '3sn KORUMA!', '#facc15');
          if (owner) {
            pushEvent(
              state,
              target.id === owner.id
                ? `${owner.name} kendisini 3 sn korumaya aldı!`
                : `${owner.name}, ${target.name} oyuncusunu 3 sn korumaya aldı!`,
              '#facc15'
            );
          }
          emitSound(state, 'dodge', target.x, target.y);
          state.effects.push({
            id: uid('fx'),
            kind: 'protector_beam',
            x: target.x,
            y: target.y,
            targetX: target.x,
            targetY: target.y,
            radius: 52,
            ttl: 0.48,
            maxTtl: 0.48,
            color: '#facc15',
          });
        }
        state.projectiles.splice(i, 1);
      }
    } else if (proj.kind === 'bomber_bomb') {
      if (killer && Math.hypot(killer.x - proj.x, killer.y - proj.y) <= killer.radius + proj.radius) {
        applySlow(killer, 0.60, 2.0); // 60% slow for 2s
        addFloat(state, killer.x, killer.y, 'BOMBA! -%60 Hız (2sn)', '#f97316');
        const owner = state.players.find((pl) => pl.id === proj.ownerId);
        if (owner) {
          addCoinReward(state, owner, 'Bomber Q (Bomba)', 4);
          pushEvent(state, `${owner.name} bombayı isabet ettirdi! Katil 2sn %60 yavaşladı!`, '#f97316');
        }
        emitSound(state, 'break', proj.x, proj.y);
        state.effects.push({
          id: uid('fx'),
          kind: 'fighter_punch',
          x: proj.x,
          y: proj.y,
          radius: 54,
          ttl: 0.35,
          maxTtl: 0.35,
          color: '#f97316',
        });
        triggerShake(state, 5, 0.16);
        state.projectiles.splice(i, 1);
      }
    } else if (proj.kind === 'hunter_pellet') {
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      let consumed = false;
      for (const s of state.players) {
        if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - proj.x, s.y - proj.y) <= s.radius + proj.radius) {
          const distDmg = distFromStart <= 135 ? 30 : distFromStart <= 275 ? 20 : 10;
          if (owner) {
            const shotKey = proj.shotId ?? proj.id;
            let perSurv = hunterShotHitTracker.get(shotKey);
            if (!perSurv) {
              if (hunterShotHitTracker.size > 40) hunterShotHitTracker.clear();
              perSurv = new Map();
              hunterShotHitTracker.set(shotKey, perSurv);
            }
            const entry = perSurv.get(s.id) ?? { count: 0, blocked: false };
            if (!entry.blocked) {
              const dmg = entry.count === 0 ? distDmg : Math.max(4, Math.round(distDmg * 0.35));
              const dealt = dealDamageToSurvivor(state, owner, s, dmg, false, false);
              if (!dealt) {
                entry.blocked = true;
              }
              entry.count += 1;
              perSurv.set(s.id, entry);
            }
          } else {
            s.hp = Math.max(0, s.hp - distDmg);
          }
          consumed = true;
          break;
        }
      }
      if (consumed) {
        state.projectiles.splice(i, 1);
      }
    }
  }

  // --- CHECK LAST MAN STANDING (1 SURVIVOR REMAINING -> 1m 15s TIMER + SPECIAL SONG) & WIN/LOSS ---
  const allSurvivors = state.players.filter((p) => p.role === 'survivor');
  const remainingSurvivors = allSurvivors.filter((p) => !p.dead);
  if (
    !state.lastSurvivorTriggered &&
    allSurvivors.length >= 2 &&
    remainingSurvivors.length === 1
  ) {
    state.lastSurvivorTriggered = true;
    state.timeRemaining = Math.min(state.timeRemaining, LAST_SURVIVOR_TIME_SECONDS);
    const lone = remainingSurvivors[0];
    addFloat(state, lone.x, lone.y - 24, 'SON HAYATTA KALAN! (01:15)', '#f43f5e');
    pushEvent(
      state,
      `SON HAYATTA KALAN: ${lone.name}! Süre 1dk 15sn'ye düştü!`,
      '#f43f5e'
    );
    triggerShake(state, 7, 0.25);
  }

  if (remainingSurvivors.length === 0) {
    state.phase = 'ended';
    state.winner = 'killer';
    state.winReason = 'Katil tüm hayatta kalanları eledi!';
    finalizeMatchCoins(state);
    return;
  }

  if (state.timeRemaining <= 0) {
    state.phase = 'ended';
    state.winner = 'survivors';
    state.winReason = 'Süre doldu! Hayatta kalanlar kaçmayı başardı!';
    finalizeMatchCoins(state);
    return;
  }
}
