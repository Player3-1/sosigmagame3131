import {
  DOOR_MAX_LOCK_HITS,
  DOWNED_BLEEDOUT_RATE,
  DOWNED_BLEEDOUT_SECONDS,
  DOWNED_CRITICAL_SPEED_MULT,
  DOWNED_HP,
  DOWNED_SPEED_MULT,
  KILLERS,
  KILLER_HIT_RECOVERY_SECONDS,
  KILLER_HIT_RECOVERY_SLOW,
  KILLER_LIST,
  KILLER_MAX_STAMINA,
  KILLER_SPRINT_BONUS,
  MATCH_DURATION_SECONDS,
  MAX_DOWNS_BEFORE_DEATH,
  REVIVE_DURATION_SECONDS,
  SMILE_HIT_RECOVERY_SECONDS,
  SPEED_TO_PX,
  STAMINA_EXHAUST_RECOVER,
  SURVIVOR_CLASSES,
  SURVIVOR_CLASS_LIST,
  SURVIVOR_MAX_STAMINA,
  SURVIVOR_SPRINT_BONUS,
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
  GameState,
  KillerId,
  PlayerInput,
  PlayerState,
  SmileMinion,
  SoundEvent,
  SurvivorClassId,
} from './types.ts';

let nextIdCounter = 1;
function uid(prefix: string): string {
  nextIdCounter += 1;
  return `${prefix}_${nextIdCounter}`;
}

export interface ParticipantConfig {
  id: string;
  name: string;
  isBot: boolean;
  preferredClass: SurvivorClassId;
  preferredRole?: 'random' | 'survivor' | 'killer';
  preferredKiller?: KillerId | 'random';
}

export function createInitialGameState(participants: ParticipantConfig[]): GameState {
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

  const BOT_TIERS: BotTier[] = ['noob', 'normal', 'pro'];
  const pickRandomBotTier = (): BotTier =>
    BOT_TIERS[Math.floor(Math.random() * BOT_TIERS.length)];

  const players: PlayerState[] = [];
  let survSpawnIdx = 0;

  for (const p of participants) {
    const isKiller = p.id === chosenKillerParticipant.id;
    const assignedBotTier = p.isBot ? pickRandomBotTier() : undefined;
    if (isKiller) {
      const kId: KillerId =
        p.preferredKiller && p.preferredKiller !== 'random'
          ? p.preferredKiller
          : KILLER_LIST[Math.floor(Math.random() * KILLER_LIST.length)].id;
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
        fighterQCharges: 0,
        dodgeRewardedThisCast: false,
        invisibleTimer: 0,
        darkZoneTimer: 0,
        darkZoneTick: 0,
        blindTimer: 0,
        frenzyTimer: 0,
        healAuraTimer: 0,
        healAuraTick: 0,
        trappedById: null,
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
      });
    } else {
      const classId: SurvivorClassId =
        p.preferredClass ||
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
        stamina: SURVIVOR_MAX_STAMINA,
        maxStamina: SURVIVOR_MAX_STAMINA,
        baseSpeed: spec.speed,
        downed: false,
        downVulnerable: false,
        downCount: 0,
        dead: false,
        bleedoutTimer: 0,
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
        fighterQCharges: 0,
        dodgeRewardedThisCast: false,
        invisibleTimer: 0,
        darkZoneTimer: 0,
        darkZoneTick: 0,
        blindTimer: 0,
        frenzyTimer: 0,
        healAuraTimer: 0,
        healAuraTick: 0,
        trappedById: null,
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
      });
    }
  }

  return {
    phase: 'playing',
    winner: null,
    winReason: '',
    timeRemaining: MATCH_DURATION_SECONDS,
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
    projectiles: [],
    smileMinions: [],
    effects: [],
    bloodStains: [],
    floatingTexts: [],
    eventFeed: [],
    shakeTimer: 0,
    shakeIntensity: 0,
    players,
    soundEvents: [],
  };
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

function dealDamageToSurvivor(
  state: GameState,
  killer: PlayerState,
  target: PlayerState,
  rawDamage: number,
  fromBasicAttack = false,
  triggerRecovery = true
): boolean {
  if (target.role !== 'survivor' || target.dead) return false;

  // Fighter E: 1.5s Dodge Mode blocks all damage from killer hits, stuns killer for 1s, heals 10 HP, and grants +1 Q charge
  if (target.dodgeTimer > 0) {
    if (target.survivorClass === 'fighter') {
      killer.stunTimer = Math.max(killer.stunTimer, 1.0);
      target.hp = Math.min(target.maxHp, target.hp + 10);
      if (!target.dodgeRewardedThisCast) {
        target.dodgeRewardedThisCast = true;
        target.fighterQCharges = (target.fighterQCharges ?? 0) + 1;
        addFloat(state, target.x, target.y, 'DODGE! SERSEMLETTİ (+10 Can, +1 Q)', '#38bdf8');
        pushEvent(state, `${target.name} Dodge yedirip katili sersemletti! (+1 Q Yükü)`, '#38bdf8');
      } else {
        addFloat(state, target.x, target.y, 'DODGE! SERSEMLETTİ (+10 Can)', '#38bdf8');
      }
    } else {
      addFloat(state, target.x, target.y, 'KAÇINDI!', '#38bdf8');
    }
    emitSound(state, 'dodge', target.x, target.y);
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

  // Juggernaut R: hitting while invisible deals 12 damage on basic attack
  let dmg = rawDamage;
  if (fromBasicAttack && killer.killerId === 'juggernaut' && killer.invisibleTimer > 0) {
    dmg = 12;
  }

  target.hp -= dmg;
  target.channel = null; // Interrupt any bandage/lock/revive
  killer.damageDealt += dmg;

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

  // Killer DBD-style hit recovery: 50% slow + weapon wipe / reload (1.4s for Smile, 0.9s for others)
  const recoverySeconds =
    killer.killerId === 'smile' ? SMILE_HIT_RECOVERY_SECONDS : KILLER_HIT_RECOVERY_SECONDS;
  if (triggerRecovery) {
    killer.hitRecoveryTimer = recoverySeconds;
    killer.cdAttack = Math.max(killer.cdAttack, recoverySeconds);
    applySlow(killer, KILLER_HIT_RECOVERY_SLOW, recoverySeconds);
  }

  // Hungry passive: dealing damage grants +4 speed for 3s
  if (killer.killerId === 'hungry') {
    killer.speedBoostTimer = Math.max(killer.speedBoostTimer, 3.0);
    killer.speedBoostAmount = Math.max(killer.speedBoostAmount, 4);
  }

  addFloat(state, target.x, target.y, `-${Number(dmg.toFixed(1))}`, '#fb7185');
  emitSound(state, 'hit', target.x, target.y);
  triggerShake(state, 5, 0.14);

  if (target.downed) {
    // Either downVulnerable (1 HP) OR all living survivors are downed -> Immediate Kill!
    target.hp = 0;
    target.dead = true;
    target.downed = false;
    target.downVulnerable = false;
    state.bloodStains.push({
      id: uid('bld'),
      x: target.x,
      y: target.y,
      radius: 26,
      angle: hitAng,
      seed: Math.random() * Math.PI * 2,
      alpha: 0.9,
    });
    while (state.bloodStains.length > 90) state.bloodStains.shift();
    addFloat(state, target.x, target.y - 12, 'ELENDİ!', '#ef4444');
    pushEvent(state, `${target.name} elendi! (+40 sn süre!)`, '#ef4444');
    state.timeRemaining += 40;
  } else if (target.hp <= 0) {
    target.downCount += 1;
    if (target.downCount >= MAX_DOWNS_BEFORE_DEATH) {
      // 3rd time reaching 0 HP -> Instant death instead of downed state!
      target.hp = 0;
      target.dead = true;
      target.downed = false;
      target.downVulnerable = false;
      state.bloodStains.push({
        id: uid('bld'),
        x: target.x,
        y: target.y,
        radius: 26,
        angle: hitAng,
        seed: Math.random() * Math.PI * 2,
        alpha: 0.9,
      });
      while (state.bloodStains.length > 90) state.bloodStains.shift();
      addFloat(state, target.x, target.y - 12, '3. DÜŞÜŞ — ÖLDÜ!', '#ef4444');
      pushEvent(state, `${target.name} 3. kez düştüğü için elendi! (+40 sn süre!)`, '#ef4444');
      state.timeRemaining += 40;
    } else {
      // 1st or 2nd down: 100 yellow HP (-4/sec), 50% slow, immune until reaching 1 HP
      target.downed = true;
      target.downVulnerable = false;
      target.hp = DOWNED_HP;
      target.bleedoutTimer = DOWNED_BLEEDOUT_SECONDS;
      target.downGraceTimer = 0;
      addFloat(state, target.x, target.y - 12, `YERE DÜŞTÜ! (${target.downCount}/2) (+20sn)`, '#eab308');
      state.timeRemaining += 20;
      const nowAllDowned = aliveSurvivors.every((p) => p.downed);
      if (nowAllDowned) {
        pushEvent(state, 'Herkes yere düştü! Katil artık tümünü öldürebilir! (+20 sn süre)', '#ef4444');
      } else {
        pushEvent(state, `${target.name} yere düştü! Kurtarılmazsa 1 canla kalacak (+20 sn süre)`, '#eab308');
      }
      emitSound(state, 'downed', target.x, target.y);
    }
  }

  return true;
}

function resolveEntityMapCollisions(state: GameState, p: PlayerState): boolean {
  let hitWall = false;

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

  p.x = Math.max(TILE_SIZE + p.radius, Math.min(state.mapWidth - TILE_SIZE - p.radius, p.x));
  p.y = Math.max(TILE_SIZE + p.radius, Math.min(state.mapHeight - TILE_SIZE - p.radius, p.y));

  // Anti-stacking / Push apart overlap between players so killer cannot walk directly inside survivor hitbox
  for (const other of state.players) {
    if (other.id === p.id || other.dead) continue;
    const dist = Math.hypot(other.x - p.x, other.y - p.y);
    const minDist = p.radius + other.radius + (p.role === 'killer' || other.role === 'killer' ? 4 : 0);
    if (dist < minDist && dist > 0.001) {
      const overlap = (minDist - dist) * 0.5;
      const nx = (p.x - other.x) / dist;
      const ny = (p.y - other.y) / dist;
      if (p.role === 'killer') {
        // Killer pushes survivor slightly away without getting stuck
        other.x -= nx * overlap * 1.3;
        other.y -= ny * overlap * 1.3;
      } else if (other.role === 'killer') {
        p.x += nx * overlap * 1.3;
        p.y += ny * overlap * 1.3;
      } else {
        p.x += nx * overlap;
        p.y += ny * overlap;
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
      if (isNoob) {
        bot.botMistakeActive = Math.random() < 0.58;
        bot.botMistakeTimer = 1.2 + Math.random() * 1.4;
      } else if (isNormal) {
        bot.botMistakeActive = Math.random() < 0.28;
        bot.botMistakeTimer = 1.0 + Math.random() * 1.6;
      } else {
        bot.botMistakeActive = false;
        bot.botMistakeTimer = 3.0;
      }
    }
  }

  // Helper for noisy / imprecise aim based on tier
  const aimJitter = isNoob ? 0.44 : isNormal ? 0.2 : 0;
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

  // =========================================================================
  // KILLER BOT AI
  // =========================================================================
  if (bot.role === 'killer') {
    // 1. Trapped by Trapper Q -> immediately hold F to escape!
    if (bot.trappedById) {
      input.holdF = true;
      return input;
    }

    // 2. Continue breaking wood barricade if already channeling
    if (bot.channel?.type === 'break_barricade') {
      input.holdF = true;
      return input;
    }

    // 3. Break nearby Builder wood barricade with Hungry E or F
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
        Math.hypot(d.x + d.w / 2 - bot.x, d.y + d.h / 2 - bot.y) < 78
    );
    if (nearLockedDoor) {
      input.angle = Math.atan2(
        nearLockedDoor.y + nearLockedDoor.h / 2 - bot.y,
        nearLockedDoor.x + nearLockedDoor.w / 2 - bot.x
      );
      if (!isNoob && bot.killerId === 'hungry' && bot.cdE <= 0) input.useE = true;
      else input.attack = true;
      return input;
    }

    // 5. Destroy nearby Builder turret (1 basic attack hit kills it — keep closing in while on cooldown)
    const nearTurret = state.turrets.find((t) => Math.hypot(t.x - bot.x, t.y - bot.y) < 82);
    if (nearTurret) {
      const tDist = Math.hypot(nearTurret.x - bot.x, nearTurret.y - bot.y);
      input.angle = Math.atan2(nearTurret.y - bot.y, nearTurret.x - bot.x);
      if (tDist > 34) {
        steerToward(input, bot, nearTurret.x, nearTurret.y);
      }
      if (bot.cdAttack <= 0) {
        input.attack = true;
      }
      return input;
    }

    // 5b. Seek and destroy harassing Builder turret if no survivor is already in immediate reach
    const woodBarsForTurret = state.barricades.filter((b) => b.kind === 'wood');
    const nearestSurvivorDist = aliveSurvivors.reduce(
      (minD, s) => Math.min(minD, Math.hypot(s.x - bot.x, s.y - bot.y)),
      Infinity
    );
    const turretHuntRange = isNoob ? 165 : 340;
    const harassingTurret = state.turrets
      .filter((t) => {
        const d = Math.hypot(t.x - bot.x, t.y - bot.y);
        return (
          d <= turretHuntRange &&
          (d <= 150 || hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, t.x, t.y))
        );
      })
      .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];

    if (harassingTurret && nearestSurvivorDist > 118) {
      const td = Math.hypot(harassingTurret.x - bot.x, harassingTurret.y - bot.y);
      assignBotGoal(bot, 'hunt', harassingTurret.x, harassingTurret.y, state.elapsed + 2.0, harassingTurret.id);
      followBotGoal(state, bot, input, dt, isStuck, {
        blockedBarricades: woodBarsForTurret,
        repathInterval: 0.45,
        pad: 14,
      });
      input.angle = Math.atan2(harassingTurret.y - bot.y, harassingTurret.x - bot.x);
      input.sprint =
        bot.hitRecoveryTimer <= 0 &&
        bot.stunTimer <= 0 &&
        !bot.trappedById &&
        !bot.staminaExhausted &&
        !bot.botSprintResting &&
        td > 90;
      return input;
    }

    // 6. Hungry E wall breach if stuck against an inner wall (Normal & Pro)
    if (!isNoob && isStuck && bot.killerId === 'hungry' && bot.cdE <= 0) {
      input.useE = true;
    }

    // 7. Target Selection (if everyone alive is downed, all are killable!)
    let target: PlayerState | null = null;
    const allAliveDowned = aliveSurvivors.length > 0 && aliveSurvivors.every((s) => s.downed);
    const attackableSurvivors = allAliveDowned
      ? aliveSurvivors
      : aliveSurvivors.filter((s) => !s.downed || s.downVulnerable);
    const targetPool = attackableSurvivors.length > 0 ? attackableSurvivors : aliveSurvivors;

    const lockedTarget =
      bot.botGoal?.kind === 'hunt' &&
      bot.botGoal.until > state.elapsed &&
      bot.botGoal.targetId
        ? targetPool.find((s) => s.id === bot.botGoal!.targetId) ?? null
        : null;

    let bestScore = Infinity;
    for (const s of targetPool) {
      const d = Math.hypot(s.x - bot.x, s.y - bot.y);
      let score = d;
      if (isNoob) {
        score = d;
      } else {
        if (s.downed && (s.downVulnerable || allAliveDowned)) {
          score -= 220; // Easy finish kill!
        } else if (s.downed) {
          score += 500;
        } else {
          score -= (1 - s.hp / s.maxHp) * 210;
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

      // Track chase progress to break infinite loops ("sonsuza kadar looplanmasın, direkt saldırsın")
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

      const loopThreshold = isNoob ? 4.5 : isNormal ? 2.8 : 1.75;
      const isLooping = (bot.botChaseStagnantTimer ?? 0) > loopThreshold;

      // Detect any wood barricade near the direct chase corridor between Killer and Target
      const woodBars = state.barricades.filter((b) => b.kind === 'wood');
      let blockingBar =
        bot.botBreakBarricadeId
          ? woodBars.find((b) => b.id === bot.botBreakBarricadeId)
          : undefined;

      if (!blockingBar && !isNoob && bestDist < 360) {
        const segLen = Math.max(1, bestDist);
        const ux = (target.x - bot.x) / segLen;
        const uy = (target.y - bot.y) / segLen;
        blockingBar = woodBars.find((b) => {
          const bx = b.x + b.w / 2;
          const by = b.y + b.h / 2;
          const db = Math.hypot(bx - bot.x, by - bot.y);
          if (db > 210) return false;
          const proj = (bx - bot.x) * ux + (by - bot.y) * uy;
          if (proj < -20 || proj > segLen + 20) return false;
          const perp = Math.abs((bx - bot.x) * -uy + (by - bot.y) * ux);
          return perp < 66;
        });
      }

      // If a wood barricade is creating a loop, smash it directly OR jump/shoot over it!
      if (blockingBar && (isLooping || bestDist > 92)) {
        const bx = blockingBar.x + blockingBar.w / 2;
        const by = blockingBar.y + blockingBar.h / 2;
        const db = Math.hypot(bx - bot.x, by - bot.y);
        const los = hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, target.x, target.y);

        if (!isNormal || Math.random() < 0.65) {
          if (bot.killerId === 'jumper' && bot.cdR <= 0 && bestDist < 225) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 380));
            input.useR = true;
            bot.botChaseStagnantTimer = 0;
            return input;
          }
          if (bot.killerId === 'hungry' && bot.cdQ <= 0 && los && bestDist < 470) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 680));
            input.useQ = true;
          }
          if (bot.killerId === 'juggernaut' && bot.cdE <= 0 && los && bestDist < 350) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 760));
            input.useE = true;
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
          repathInterval: 0.5,
          pad: 14,
        });
        input.sprint =
          bot.hitRecoveryTimer <= 0 &&
          !bot.staminaExhausted &&
          !bot.botSprintResting &&
          db > 120;
        return input;
      }

      assignBotGoal(bot, 'hunt', target.x, target.y, state.elapsed + 1.4, target.id);

      const moveWp = followBotGoal(state, bot, input, dt, isStuck, {
        blockedBarricades: isLooping ? undefined : woodBars,
        repathInterval: isNoob ? 1.15 : isNormal ? 0.85 : isLooping ? 1.05 : bestDist < 360 ? 0.68 : 0.75,
        pad: 15,
      });

      const walkableDirect = hasWalkableLine(
        state.tiles,
        state.cols,
        state.rows,
        bot.x,
        bot.y,
        target.x,
        target.y,
        14
      );
      const los = hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, target.x, target.y);

      const predAngle = isNoob
        ? Math.atan2(target.y - bot.y, target.x - bot.x)
        : predictAimAngle(bot, target, 620);
      if (los && bestDist < 420) {
        input.angle = jitterAngle(predAngle);
      } else {
        input.angle = Math.atan2(moveWp.y - bot.y, moveWp.x - bot.x);
      }

      // Fair, Tier-Appropriate Killer Stamina Management (uses same 100 stamina pool & exhaustion rules!)
      if (bot.staminaExhausted || bot.stamina <= 0) {
        bot.botSprintResting = true;
      } else if (bot.botSprintResting && bot.stamina >= (isNormal ? 44 : 52)) {
        bot.botSprintResting = false;
      } else if (!isNoob && !isNormal && bot.stamina <= 16 && bestDist >= 115) {
        bot.botSprintResting = true;
      }

      if (bot.hitRecoveryTimer > 0 || bot.stunTimer > 0 || bot.trappedById || bot.staminaExhausted) {
        input.sprint = false;
      } else if (isNoob) {
        // Noob killer burns sprint recklessly across hallways until exhausted!
        input.sprint = true;
      } else if (isNormal) {
        // Normal killer sprints in chase (< 420px) and rests briefly once exhausted/tired
        if (!bot.botSprintResting && (bestDist < 420 || isLooping || bot.stamina > 86)) {
          input.sprint = true;
        }
      } else {
        // Pro killer walks while patrolling far targets, sprints decisively in chase with realistic stamina pacing
        if (
          (bestDist < 115 && bot.stamina > 4) ||
          (!bot.botSprintResting && (bestDist < 390 || isLooping))
        ) {
          input.sprint = true;
        }
      }

      // Direct melee attack (Noob has clumsier reaction reach)
      const attackReach = isNoob ? 74 : 86;
      if (bestDist < attackReach && bot.cdAttack <= 0) {
        input.angle = jitterAngle(Math.atan2(target.y - bot.y, target.x - bot.x));
        input.attack = true;
      }

      // Noob killer randomly wastes abilities out of range / wrong direction
      if (isNoob) {
        if ((bot.botRandomSkillTimer ?? 0) <= 0) {
          bot.botRandomSkillTimer = 2.5 + Math.random() * 3.0;
          input.angle = bot.angle + (Math.random() - 0.5) * 2.2;
          const roll = Math.random();
          if (roll < 0.34 && bot.cdQ <= 0) input.useQ = true;
          else if (roll < 0.68 && bot.cdE <= 0) input.useE = true;
          else if (bot.cdR <= 0) input.useR = true;
        } else if (los && bestDist < 260) {
          // Occasional panic skill usage if close
          if (bot.cdQ <= 0 && Math.random() < 0.04) input.useQ = true;
        }
        return input;
      }

      // Normal & Pro Killer abilities (Normal slightly less consistent if in mistake window)
      if (!isNormal || !bot.botMistakeActive) {
        if (bot.killerId === 'jumper') {
          if ((walkableDirect || isLooping) && bestDist > 75 && bestDist < 225 && bot.cdQ <= 0) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 560));
            input.useQ = true;
          } else if (walkableDirect && bestDist > 120 && bestDist < 370 && bot.cdE <= 0) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 440));
            input.useE = true;
          } else if (bestDist > 60 && bestDist < 220 && bot.cdR <= 0) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 360));
            input.useR = true;
          }
        } else if (bot.killerId === 'juggernaut') {
          if (walkableDirect && bestDist > 60 && bestDist < 215 && bot.cdQ <= 0) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 620));
            input.useQ = true;
          } else if (los && bestDist > 90 && bestDist < 350 && bot.cdE <= 0) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 760));
            input.useE = true;
          } else if (bestDist > 200 && bestDist < 520 && bot.cdR <= 0) {
            input.useR = true;
          }
        } else if (bot.killerId === 'smile') {
          if (bestDist < 580 && target.blindTimer <= 0 && bot.cdQ <= 0) {
            input.useQ = true;
          } else if (bestDist < 190 && bot.cdE <= 0) {
            input.useE = true;
          } else if (bestDist < 700 && state.smileMinions.length === 0 && bot.cdR <= 0) {
            input.useR = true;
          }
        } else if (bot.killerId === 'hungry') {
          if (los && bestDist > 82 && bestDist < 480 && bot.cdQ <= 0) {
            input.angle = jitterAngle(predictAimAngle(bot, target, 680));
            input.useQ = true;
          } else if (bestDist < 96 && bot.cdE <= 0) {
            input.angle = jitterAngle(Math.atan2(target.y - bot.y, target.x - bot.x));
            input.useE = true;
          } else if (bestDist > 100 && bestDist < 420 && bot.cdR <= 0) {
            input.useR = true;
          }
        }
      }
    }
    return input;
  }

  // =========================================================================
  // SURVIVOR BOT AI (Noob / Normal / Pro Tiers + Fair Human-Like Stamina)
  // =========================================================================
  const distToKiller = killer ? Math.hypot(killer.x - bot.x, killer.y - bot.y) : 9999;
  const killerVisible = killer
    ? (killer.invisibleTimer <= 0 || distToKiller < 135) && (bot.blindTimer <= 0 || distToKiller < 105)
    : false;
  const killerLOS =
    killer && killerVisible && bot.blindTimer <= 0
      ? hasLineOfSight(state.tiles, state.cols, state.rows, bot.x, bot.y, killer.x, killer.y)
      : false;
  const shadowBarricades = state.barricades.filter((b) => b.kind === 'shadow' || b.kind === 'wood');
  const myClass = bot.survivorClass!;

  // Helper: applies tier-appropriate stamina spending when not in immediate danger
  const maybeSprintSafeTask = () => {
    if (isNoob) {
      input.sprint = true; // Noob burns stamina everywhere until exhausted
    } else if (isNormal && bot.stamina > 88) {
      input.sprint = true; // Normal occasionally wastes extra stamina while traveling
    }
    // Pro conserves stamina when safe!
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
      killer &&
      killerVisible &&
      distToKiller < 86 &&
      killer.stunTimer <= 0.2 &&
      bot.dodgeTimer <= 0 &&
      bot.channel.progress < 3.6;
    if (!killerDangerClose) {
      input.holdF = true;
      return input;
    }
  }
  if (bot.channel?.type === 'lock_door') {
    if (!killer || !killerVisible || distToKiller > 165 || killer.stunTimer > 0.3) {
      return input;
    }
  }
  if (bot.channel?.type === 'bandage') {
    const patient = aliveSurvivors.find((s) => s.id === bot.channel!.targetId);
    if (patient && (!killer || distToKiller > 145 || killer.stunTimer > 0.3)) {
      const dp = Math.hypot(patient.x - bot.x, patient.y - bot.y);
      if (dp > 55) {
        steerToward(input, bot, patient.x, patient.y);
      }
      return input;
    }
  }

  // -------------------------------------------------------------------------
  // Priority 1: Rescue Downed Teammate (All bots actively help rescue!)
  // -------------------------------------------------------------------------
  const downedAllies = aliveSurvivors
    .filter((s) => s.id !== bot.id && s.downed)
    .sort((a, b) => a.bleedoutTimer - b.bleedoutTimer);

  if (downedAllies.length > 0 && !bot.downed) {
    const downedAlly = downedAllies[0];
    const dAlly = Math.hypot(downedAlly.x - bot.x, downedAlly.y - bot.y);
    const killerDistToDowned = killer ? Math.hypot(killer.x - downedAlly.x, killer.y - downedAlly.y) : 9999;

    const alreadyBeingRevived = aliveSurvivors.some(
      (s) =>
        s.id !== bot.id &&
        s.channel?.type === 'revive' &&
        s.channel.targetId === downedAlly.id
    );

    // Only defer if another FREE, healthy bot (never defer to human) is ALREADY right on top of the downed ally!
    const myEffectiveDist = myClass === 'runner' ? dAlly * 0.8 : dAlly;
    const closerBotRightThere = aliveSurvivors.some((s) => {
      if (s.id === bot.id || !s.isBot || s.downed || s.trappedById) return false;
      const otherDist = Math.hypot(s.x - downedAlly.x, s.y - downedAlly.y);
      const otherKillerDist = killer ? Math.hypot(s.x - killer.x, s.y - killer.y) : 9999;
      if (otherKillerDist < 190) return false; // Chased bot cannot reliably rescue
      return otherDist < 120 && otherDist + 80 < myEffectiveDist;
    });

    const killerCamping = killer && killerDistToDowned < 155 && killer.stunTimer <= 0.35;

    // Pro & Normal Fighter can run in to stun/bait a camping killer!
    const fighterCanQ = (bot.fighterQCharges ?? 0) > 0 && bot.cdQ <= 0;
    if (!isNoob && myClass === 'fighter' && killer && killerCamping && (fighterCanQ || bot.cdE <= 0)) {
      assignBotGoal(bot, 'bodyguard', killer.x, killer.y, state.elapsed + 1.5, killer.id);
      if (distToKiller < 78 && fighterCanQ) {
        input.angle = jitterAngle(Math.atan2(killer.y - bot.y, killer.x - bot.x));
        input.useQ = true;
        return input;
      }
      if (distToKiller < 118 && bot.cdE <= 0) {
        input.useE = true;
      }
      followBotGoal(state, bot, input, dt, isStuck, {
        blockedBarricades: shadowBarricades,
        repathInterval: isNormal ? 0.55 : 0.4,
      });
      if (!bot.staminaExhausted) input.sprint = true;
      return input;
    }

    const shouldHeadToRescue =
      !alreadyBeingRevived &&
      (!closerBotRightThere || downedAlly.bleedoutTimer < 14 || downedAlly.downVulnerable);

    // If killer is actively camping right over the downed ally, bots still stage nearby (<= 210px) waiting for an opening!
    const canRescueNow =
      !killerCamping ||
      (myClass === 'fighter' && fighterCanQ) ||
      (killer && killer.stunTimer > 0.35) ||
      dAlly > 210;

    if (shouldHeadToRescue && canRescueNow && (!isNoob || killerDistToDowned > 130 || dAlly > 220)) {
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
            if (!bot.staminaExhausted) input.sprint = true;
            return input;
          }
        }
      }

      if (dAlly < 68 && (!killer || killerDistToDowned > 88 || killer.stunTimer > 0.35 || bot.dodgeTimer > 0)) {
        input.angle = Math.atan2(downedAlly.y - bot.y, downedAlly.x - bot.x);
        input.holdF = true;
        return input;
      }

      assignBotGoal(bot, 'rescue', downedAlly.x, downedAlly.y, state.elapsed + 2.5, downedAlly.id);
      const wp = followBotGoal(state, bot, input, dt, isStuck, {
        avoidPos: killer ? { x: killer.x, y: killer.y, radius: isNoob ? 115 : 210 } : undefined,
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

      if (!bot.staminaExhausted && (isNoob || isNormal || downedAlly.bleedoutTimer < 16 || bot.stamina > 24)) {
        input.sprint = true;
      }
      return input;
    }
  }

  // -------------------------------------------------------------------------
  // Priority 2: Active Chase / Threat Escape & Class Counterplay
  // -------------------------------------------------------------------------
  const threatRange = isNoob ? 265 : isNormal ? 365 : 440;
  const losRange = isNoob ? 320 : isNormal ? 470 : 550;
  const underThreat =
    killer && killerVisible && (distToKiller < threatRange || (killerLOS && distToKiller < losRange));

  if (underThreat && killer) {
    // Engineer special: escape via nearby vent if safer! (Normal & Pro)
    if (!isNoob && myClass === 'engineer' && bot.cdQ <= 0 && !bot.downed) {
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
          destVent && Math.hypot(destVent.x - killer.x, destVent.y - killer.y) > distToKiller + 120;

        if (destSafe && dv < 72) {
          input.useQ = true;
          return input;
        } else if (
          destSafe &&
          dv < 260 &&
          Math.hypot(nearVent.x - killer.x, nearVent.y - killer.y) > 105
        ) {
          assignBotGoal(bot, 'vent_escape', nearVent.x, nearVent.y, state.elapsed + 2.0, nearVent.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            blockedBarricades: shadowBarricades,
            repathInterval: 0.4,
          });
          input.sprint = true;
          return input;
        }
      }
    }

    // Flee Goal selection — Noob & mistaking Normal sometimes pick poor escape routes!
    const curGoal = bot.botGoal;
    const killerCloserToGoal =
      curGoal?.kind === 'flee' &&
      Math.hypot(killer.x - curGoal.x, killer.y - curGoal.y) <
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
        (isNoob && Math.random() < 0.65) || (isNormal && bot.botMistakeActive && Math.random() < 0.6);
      if (pickPoorAnchor) {
        const allAnchors = getAllFacilityAnchors(state);
        anchor = allAnchors[Math.floor(Math.random() * Math.max(1, allAnchors.length))] ?? {
          x: state.mapWidth / 2,
          y: state.mapHeight / 2,
        };
      } else {
        anchor = pickBestFleeAnchor(state, bot, killer);
      }
      assignBotGoal(bot, 'flee', anchor.x, anchor.y, state.elapsed + (isNoob ? 3.2 : 2.4));
    }

    // Noob sometimes panics / hesitates briefly when killer is right on top of them
    const noobPanicStumble = isNoob && distToKiller < 175 && bot.botMistakeActive && Math.random() < 0.16;
    let moveWp = { x: bot.x, y: bot.y };
    if (!noobPanicStumble) {
      moveWp = followBotGoal(state, bot, input, dt, isStuck, {
        avoidPos:
          isNoob && bot.botMistakeActive
            ? undefined
            : { x: killer.x, y: killer.y, radius: isNoob ? 220 : isNormal && bot.botMistakeActive ? 260 : 440 },
        blockedBarricades: shadowBarricades,
        repathInterval: isNoob ? 1.05 : isNormal ? 0.72 : 0.45,
        pad: 13,
      });
    }

    // Fair Tier-Appropriate Stamina During Escape
    if (!bot.downed) {
      if (isNoob) {
        input.sprint = true; // Burns straight into exhaustion
      } else if (isNormal) {
        if (distToKiller < 380 || killerLOS) {
          input.sprint = true; // Normal sprints until safe or stamina hits 0
        }
      } else {
        // Pro sprints decisively when threatened, pacing slightly only if gap is comfortable (> 280px)
        if ((distToKiller < 410 || killerLOS) && (distToKiller < 230 || bot.stamina > 12)) {
          input.sprint = true;
        }
      }
    }

    // Class-specific defensive & trap counterplay during active chase
    if (!bot.downed) {
      if (myClass === 'fighter') {
        const fighterCanQ = (bot.fighterQCharges ?? 0) > 0 && bot.cdQ <= 0;
        if (distToKiller < 78 && fighterCanQ && killer.stunTimer <= 0) {
          input.angle = jitterAngle(Math.atan2(killer.y - bot.y, killer.x - bot.x));
          input.useQ = true;
        } else if (!isNoob && distToKiller < 122 && bot.cdE <= 0) {
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
        if (distToKiller < 190 && bot.cdQ <= 0 && (!isNoob || Math.random() < 0.25)) {
          const aimAng = jitterAngle(Math.atan2(killer.y - bot.y, killer.x - bot.x));
          const cbx = Math.max(TILE_SIZE, Math.min(state.mapWidth - TILE_SIZE - 48, bot.x + Math.cos(aimAng) * 46 - 24));
          const cby = Math.max(TILE_SIZE, Math.min(state.mapHeight - TILE_SIZE - 48, bot.y + Math.sin(aimAng) * 46 - 24));
          const overlaps = state.barricades.some(
            (b) => cbx < b.x + b.w && cbx + 48 > b.x && cby < b.y + b.h && cby + 48 > b.y
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
          input.angle = jitterAngle(Math.atan2(killer.y - bot.y, killer.x - bot.x));
          input.useE = true;
        }
      } else if (myClass === 'trapper' && !isNoob) {
        const passingDoor = state.doors.some(
          (d) => !d.broken && Math.hypot(d.x + d.w / 2 - bot.x, d.y + d.h / 2 - bot.y) < 75
        );
        const alreadyTrappedHere = state.traps.some((t) => Math.hypot(t.x - bot.x, t.y - bot.y) < 55);
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
        const killerNearPatient = killer ? Math.hypot(killer.x - patient.x, killer.y - patient.y) : 9999;

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
              avoidPos: killer ? { x: killer.x, y: killer.y, radius: 340 } : undefined,
              blockedBarricades: shadowBarricades,
              repathInterval: isNormal ? 0.7 : 0.55,
            });
            if (isNormal || bot.stamina > 45) input.sprint = true;
            return input;
          }
        } else if (patient.id !== bot.id && killerNearPatient > 260 && dp > 160) {
          assignBotGoal(bot, 'heal_ally', patient.x, patient.y, state.elapsed + 2.0, patient.id);
          followBotGoal(state, bot, input, dt, isStuck, {
            avoidPos: killer ? { x: killer.x, y: killer.y, radius: 340 } : undefined,
            blockedBarricades: shadowBarricades,
          });
          maybeSprintSafeTask();
          return input;
        }
      }

      if (!isNormal) {
        const buddy = aliveSurvivors
          .filter((s) => s.id !== bot.id && !s.downed && (!killer || Math.hypot(s.x - killer.x, s.y - killer.y) > 400))
          .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
        if (buddy) {
          const db = Math.hypot(buddy.x - bot.x, buddy.y - bot.y);
          if (db > 210) {
            assignBotGoal(bot, 'heal_ally', buddy.x, buddy.y, state.elapsed + 2.5, buddy.id);
            followBotGoal(state, bot, input, dt, isStuck, {
              avoidPos: killer ? { x: killer.x, y: killer.y, radius: 360 } : undefined,
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
    if (myClass === 'fighter' && killer && fighterCanAct && (!isNormal || !bot.botMistakeActive)) {
      const threatenedAlly = aliveSurvivors
        .filter((s) => s.id !== bot.id && !s.downed && Math.hypot(s.x - killer.x, s.y - killer.y) < 360)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (threatenedAlly) {
        const ix = (threatenedAlly.x + killer.x) / 2;
        const iy = (threatenedAlly.y + killer.y) / 2;
        assignBotGoal(bot, 'bodyguard', ix, iy, state.elapsed + 1.8, threatenedAlly.id);
        followBotGoal(state, bot, input, dt, isStuck, {
          blockedBarricades: shadowBarricades,
          repathInterval: 0.45,
        });
        if (isNormal || bot.stamina > 25) input.sprint = true;
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
          if (killer && Math.hypot(dx - killer.x, dy - killer.y) < 280) return false;
          return !state.traps.some((t) => Math.hypot(t.x - dx, t.y - dy) < 62);
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
          avoidPos: killer ? { x: killer.x, y: killer.y, radius: 340 } : undefined,
          blockedBarricades: shadowBarricades,
          repathInterval: 0.7,
        });
        maybeSprintSafeTask();
        return input;
      }
    }

    // 3D. ENGINEER: Proactively seek high-value unlocked doors away from killer and lock them (3.5s)
    if (myClass === 'engineer' && bot.cdE <= 0) {
      const candidateDoors = state.doors
        .filter((d) => {
          if (d.broken || d.locked) return false;
          const dx = d.x + d.w / 2;
          const dy = d.y + d.h / 2;
          return !killer || Math.hypot(dx - killer.x, dy - killer.y) > 280;
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
            avoidPos: killer ? { x: killer.x, y: killer.y, radius: 340 } : undefined,
            blockedBarricades: shadowBarricades,
            repathInterval: 0.7,
          });
          maybeSprintSafeTask();
          return input;
        }
      }
    }

    // 3E. BUILDER: Place turrets at strategic central corridors / cage approaches!
    if (myClass === 'builder' && bot.cdE <= 0 && state.turrets.filter((t) => t.ownerId === bot.id).length < 2) {
      const turretSpots = [
        { id: 'tur_c_w', x: 28 * TILE_SIZE, y: 25 * TILE_SIZE },
        { id: 'tur_c_e', x: 45 * TILE_SIZE, y: 25 * TILE_SIZE },
        { id: 'tur_c_n', x: 36 * TILE_SIZE, y: 17 * TILE_SIZE },
        { id: 'tur_c_s', x: 36 * TILE_SIZE, y: 34 * TILE_SIZE },
      ].filter(
        (sp) =>
          (!killer || Math.hypot(sp.x - killer.x, sp.y - killer.y) > 280) &&
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
          avoidPos: killer ? { x: killer.x, y: killer.y, radius: 340 } : undefined,
          blockedBarricades: shadowBarricades,
          repathInterval: 0.75,
        });
        maybeSprintSafeTask();
        return input;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Priority 4: Committed Safe Patrol (Noob wastes sprint here too!)
  // -------------------------------------------------------------------------
  const curPatrol = bot.botGoal;
  const patrolArrived =
    curPatrol?.kind === 'patrol' && Math.hypot(curPatrol.x - bot.x, curPatrol.y - bot.y) < 75;
  const patrolUnsafe =
    curPatrol?.kind === 'patrol' &&
    killer &&
    Math.hypot(curPatrol.x - killer.x, curPatrol.y - killer.y) < 380;

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
      const dk = killer ? Math.hypot(pt.x - killer.x, pt.y - killer.y) : 9999;
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

  state.elapsed += dt;
  state.timeRemaining = Math.max(0, state.timeRemaining - dt);
  if (state.shakeTimer > 0) {
    state.shakeTimer = Math.max(0, state.shakeTimer - dt);
    if (state.shakeTimer === 0) state.shakeIntensity = 0;
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
    p.blindTimer = Math.max(0, p.blindTimer - dt);
    p.frenzyTimer = Math.max(0, p.frenzyTimer - dt);
    p.downGraceTimer = Math.max(0, p.downGraceTimer - dt);

    // Smile E: Black aura around Smile (165px radius -> 25% slow + 10 damage/sec)
    if (p.darkZoneTimer > 0) {
      p.darkZoneTimer = Math.max(0, p.darkZoneTimer - dt);
      const darkRadius = 165;
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

    // Doctor Q healing aura tick (10 HP/s for 7s)
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
            ally.hp = Math.min(ally.maxHp, ally.hp + 10);
            if (ally.hp > before) {
              addFloat(state, ally.x, ally.y, '+10', '#34d399');
            }
          }
        }
      }
    }

    // Downed bleedout: starts at 100 yellow HP, drops by 4/sec while protected.
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
        // Landed! AoE 70 dmg + 3s 33% slow
        const slamRadius = 125;
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
            if (dealDamageToSurvivor(state, p, s, 70)) {
              applySlow(s, 0.33, 3.0);
            }
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
          applySlow(p, 0.5, 1.0); // 50% slow for 1s on slamming wall
          addFloat(state, p.x, p.y, 'TOSLADI!', '#38bdf8');
          emitSound(state, 'hit', p.x, p.y);
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
            dealDamageToSurvivor(state, p, s, 57);
            p.dashTimer = 0;
            p.dashKind = 'none';
            break;
          }
        }
        if (p.dashTimer === 0 && p.dashKind === 'jumper_q') {
          p.dashKind = 'none';
          if (p.dashHitIds.length === 0) {
            // Missed -> 3s 40% slow
            applySlow(p, 0.4, 3.0);
            addFloat(state, p.x, p.y, 'ISKADI! -%40 Hız', '#fbbf24');
          }
        }
      } else if (p.dashKind === 'jumper_e') {
        if (p.dashTimer === 0) {
          const hopSlamRadius = 86;
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
              if (dealDamageToSurvivor(state, p, s, 25, false, false)) {
                p.multiJumpHitAny = true;
                applySlow(s, 0.2, 1.5);
              }
            }
          }

          if (p.multiJumpRemaining > 0) {
            p.multiJumpRemaining -= 1;
            p.angle = inp.angle;
            p.dashTimer = 0.22;
            p.dashHitIds = [];
            const spd = (p.baseSpeed + 12) * SPEED_TO_PX;
            p.dashVx = Math.cos(p.angle) * spd;
            p.dashVy = Math.sin(p.angle) * spd;
            emitSound(state, 'jump', p.x, p.y);
          } else {
            p.dashKind = 'none';
            if (p.multiJumpHitAny) {
              p.hitRecoveryTimer = KILLER_HIT_RECOVERY_SECONDS;
              p.cdAttack = Math.max(p.cdAttack, KILLER_HIT_RECOVERY_SECONDS);
              applySlow(p, KILLER_HIT_RECOVERY_SLOW, KILLER_HIT_RECOVERY_SECONDS);
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
            Math.hypot(s.x - p.x, s.y - p.y) <= p.radius + s.radius + 12
          ) {
            p.dashHitIds.push(s.id);
            dealDamageToSurvivor(state, p, s, 40);
          }
        }
        if (p.dashTimer === 0) p.dashKind = 'none';
      } else if (p.dashKind === 'pull') {
        if (p.dashTimer === 0) p.dashKind = 'none';
      }
      continue;
    }

    // Facing angle (locked during stun/trap)
    if (p.stunTimer <= 0 && !p.trappedById) {
      p.angle = inp.angle;
    }

    // --- CHANNELING (F key or Doctor E / Engineer E) ---
    if (p.channel) {
      if (p.stunTimer > 0 || p.downed) {
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
        if (!door || door.broken || door.locked || Math.hypot(door.x + door.w / 2 - p.x, door.y + door.h / 2 - p.y) > 92) {
          p.channel = null;
        } else {
          p.channel.progress += dt;
          if (p.channel.progress >= p.channel.duration) {
            door.locked = true;
            door.open = false;
            door.lockHits = 0;
            p.channel = null;
            addFloat(state, door.x + door.w / 2, door.y, 'KAPI KİLİTLENDİ!', '#f59e0b');
            pushEvent(state, `${door.label || 'Kapı'} kilitlendi`, '#f59e0b');
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
              p.channel = null;
              addFloat(state, target.x, target.y, 'FULL CAN! ➕', '#10b981');
              emitSound(state, 'heal', target.x, target.y);
            }
          }
        }
      }
    }

    // Start new F-hold interaction if not currently channeling
    if (!p.channel && inp.holdF) {
      if (p.role === 'killer' && p.trappedById) {
        p.channel = { type: 'escape_trap', targetId: p.trappedById, progress: 0, duration: 3.0 };
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
            Math.hypot(s.x - p.x, s.y - p.y) < 72
        );
        if (downedAlly) {
          p.channel = {
            type: 'revive',
            targetId: downedAlly.id,
            progress: 0,
            duration: REVIVE_DURATION_SECONDS,
          };
        }
      }
    }

    // Movement calculation
    const beingRevived = state.players.some(
      (other) => !other.dead && other.channel?.type === 'revive' && other.channel.targetId === p.id
    );
    const cannotMove =
      p.stunTimer > 0 ||
      p.trappedById !== null ||
      beingRevived ||
      (p.channel !== null && p.channel.type !== 'bandage');

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
    const canSprint = !cannotMove && isMoving && !p.downed && !p.staminaExhausted && p.stamina > 0;
    const wantsSprint = inp.sprint && canSprint;
    if (wantsSprint) {
      p.stamina = Math.max(0, p.stamina - 24 * dt);
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.staminaExhausted = true;
      }
    } else {
      p.stamina = Math.min(p.maxStamina, p.stamina + 18 * dt);
      if (p.staminaExhausted && p.stamina >= STAMINA_EXHAUST_RECOVER) {
        p.staminaExhausted = false;
      }
    }

    let currentSpeed = p.baseSpeed + p.speedBoostAmount + (p.frenzyTimer > 0 ? 3 : 0);
    if (wantsSprint) {
      currentSpeed += p.role === 'killer' ? KILLER_SPRINT_BONUS : SURVIVOR_SPRINT_BONUS;
    }
    if (p.hitRecoveryTimer > 0 && p.role === 'killer') {
      currentSpeed *= 0.5; // Killer attack recovery deceleration / slowdown
    }
    if (p.slowTimer > 0) {
      currentSpeed *= Math.max(0.15, 1 - p.slowAmount);
    }
    if (p.downed) {
      currentSpeed *= p.downVulnerable ? DOWNED_CRITICAL_SPEED_MULT : DOWNED_SPEED_MULT;
    }

    p.vx = mx * currentSpeed * SPEED_TO_PX;
    p.vy = my * currentSpeed * SPEED_TO_PX;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    resolveEntityMapCollisions(state, p);

    // Check Trapper traps if Killer moves onto them
    if (p.role === 'killer' && !p.trappedById) {
      for (let i = state.traps.length - 1; i >= 0; i--) {
        const trap = state.traps[i];
        if (!trap.triggered && Math.hypot(p.x - trap.x, p.y - trap.y) <= p.radius + trap.radius - 4) {
          trap.triggered = true;
          emitSound(state, 'trap', trap.x, trap.y);
          if (trap.kind === 'snare') {
            p.trappedById = trap.id;
            addFloat(state, p.x, p.y, 'KAPANA YAKALANDI!', '#a855f7');
          } else {
            applySlow(p, 0.37, 7.0); // 37% slow for 7s
            state.traps.splice(i, 1);
            addFloat(state, p.x, p.y, 'TUZAK! -%37 Hız (7sn)', '#c084fc');
          }
          break;
        }
      }
    }

    // --- ABILITIES & ATTACKS ---
    if (p.stunTimer > 0 || p.downed || p.trappedById) continue;

    // Killer Basic Attack (with wider / smoother melee arc)
    if (p.role === 'killer' && inp.attack && p.cdAttack <= 0) {
      const spec = KILLERS[p.killerId!];
      p.cdAttack = 0.9;
      emitSound(state, 'slash', p.x, p.y);
      state.effects.push({
        id: uid('fx'),
        kind: 'slash',
        x: p.x + Math.cos(p.angle) * 38,
        y: p.y + Math.sin(p.angle) * 38,
        angle: p.angle,
        radius: 58,
        ttl: 0.2,
        maxTtl: 0.2,
        color: p.frenzyTimer > 0 ? '#ef4444' : spec.accentColor,
      });

      const reach = 84;
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
          addFloat(state, s.x, s.y, 'DODGE BAŞARILI! (+1 Q Yükü)', '#38bdf8');
          pushEvent(state, `${s.name} katilin saldırısını dodgeladı! (+1 Q Yükü)`, '#38bdf8');
          emitSound(state, 'dodge', s.x, s.y);
        }
      }

      // Hit Locked Doors (5 hits to break!)
      for (const door of state.doors) {
        if (door.broken || !door.locked) continue;
        const dCenter = Math.hypot(door.x + door.w / 2 - p.x, door.y + door.h / 2 - p.y);
        if (dCenter <= 85) {
          door.lockHits += 1;
          emitSound(state, 'break', door.x, door.y);
          if (door.lockHits >= DOOR_MAX_LOCK_HITS) {
            door.broken = true;
            door.locked = false;
            door.open = true;
            addFloat(state, door.x + door.w / 2, door.y, 'KAPI KIRILDI!', '#f87171');
            pushEvent(state, `${door.label || 'Kapı'} kırıldı!`, '#f87171');
            triggerShake(state, 6, 0.15);
          } else {
            addFloat(
              state,
              door.x + door.w / 2,
              door.y,
              `KAPI HASARI ${door.lockHits}/${DOOR_MAX_LOCK_HITS}`,
              '#fbbf24'
            );
          }
          break;
        }
      }

      // Hit Turrets (1 hit kills turret)
      for (let i = state.turrets.length - 1; i >= 0; i--) {
        const t = state.turrets[i];
        if (Math.hypot(t.x - p.x, t.y - p.y) <= reach) {
          state.turrets.splice(i, 1);
          addFloat(state, t.x, t.y, 'TARET YOK EDİLDİ', '#fb923c');
          emitSound(state, 'break', t.x, t.y);
        }
      }
    }

    // --- SURVIVOR ABILITIES ---
    if (p.role === 'survivor') {
      const cls = p.survivorClass!;

      if (cls === 'doctor') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 18;
          p.healAuraTimer = 7.0;
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
                (s.hp < s.maxHp || s.downed) &&
                Math.hypot(s.x - p.x, s.y - p.y) <= 170
            )
            .sort(
              (a, b) =>
                Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)
            );
          if (candidates.length > 0) {
            p.cdE = 44;
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
            p.cdE = 20;
            p.abilitiesUsed += 1;
            p.channel = {
              type: 'lock_door',
              targetId: nearDoor.id,
              progress: 0,
              duration: 3.5,
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
            p.cdQ = 27;
            p.abilitiesUsed += 1;
            emitSound(state, 'slash', p.x, p.y);
            state.effects.push({
              id: uid('fx'),
              kind: 'fighter_punch',
              x: p.x + Math.cos(p.angle) * 44,
              y: p.y + Math.sin(p.angle) * 44,
              angle: p.angle,
              radius: 56,
              ttl: 0.28,
              maxTtl: 0.28,
              color: '#ef4444',
            });
            const killer = state.players.find((k) => k.role === 'killer');
            if (killer && Math.hypot(killer.x - p.x, killer.y - p.y) <= 104) {
              killer.stunTimer = 2.0; // 2s full stun (no post-stun 30% slow)
              killer.dashTimer = 0;
              killer.dashKind = 'none';
              killer.multiJumpRemaining = 0;
              killer.channel = null;
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
          const rushSpeed = (p.baseSpeed + 14) * SPEED_TO_PX;
          p.dashKind = 'runner_rush';
          p.dashTimer = 5.0; // stops on wall hit
          p.dashVx = Math.cos(p.angle) * rushSpeed;
          p.dashVy = Math.sin(p.angle) * rushSpeed;
          addFloat(state, p.x, p.y, 'RUSH!', '#22d3ee');
          emitSound(state, 'jump', p.x, p.y);
        }
      } else if (cls === 'builder') {
        if (inp.useQ && p.cdQ <= 0) {
          const bw = 48;
          const bh = 48;
          const bx = Math.max(
            TILE_SIZE,
            Math.min(state.mapWidth - TILE_SIZE - bw, p.x + Math.cos(p.angle) * 46 - bw / 2)
          );
          const by = Math.max(
            TILE_SIZE,
            Math.min(state.mapHeight - TILE_SIZE - bh, p.y + Math.sin(p.angle) * 46 - bh / 2)
          );
          const overlapsBarricade = state.barricades.some(
            (b) => bx < b.x + b.w && bx + bw > b.x && by < b.y + b.h && by + bh > b.y
          );
          if (overlapsBarricade) {
            if (!p.isBot) {
              addFloat(state, p.x, p.y, 'BARİKATLAR İÇ İÇE KONULAMAZ!', '#f87171');
            }
          } else {
            p.cdQ = 9;
            p.abilitiesUsed += 1;
            state.barricades.push({
              id: uid('bar'),
              ownerId: p.id,
              kind: 'wood',
              x: bx,
              y: by,
              w: bw,
              h: bh,
              hp: 100,
              maxHp: 100,
              breakProgress: 0,
            });
            // Push any overlapping players cleanly outside the new barricade
            for (const pl of state.players) {
              if (pl.dead) continue;
              const res = resolveCircleRect(pl.x, pl.y, pl.radius, bx, by, bw, bh);
              if (res.collided) {
                pl.x = res.x;
                pl.y = res.y;
              }
            }
            addFloat(state, p.x, p.y, 'BARİKAT KURULDU', '#f97316');
            emitSound(state, 'lock', p.x, p.y);
          }
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 29;
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
      }
    }

    // --- KILLER ABILITIES ---
    if (p.role === 'killer') {
      const kId = p.killerId!;

      if (kId === 'jumper') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 10;
          p.abilitiesUsed += 1;
          p.dashKind = 'jumper_q';
          p.dashTimer = 0.42;
          p.dashHitIds = [];
          const spd = 560;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          emitSound(state, 'jump', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 11;
          p.abilitiesUsed += 1;
          p.dashKind = 'jumper_e';
          p.dashTimer = 0.22;
          p.multiJumpRemaining = 4; // 1 + 4 = 5 consecutive AoE jumps
          p.multiJumpHitAny = false;
          p.dashHitIds = [];
          const spd = (p.baseSpeed + 12) * SPEED_TO_PX;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          addFloat(state, p.x, p.y, '5x SIÇRAYIŞ!', '#f59e0b');
          emitSound(state, 'jump', p.x, p.y);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 14;
          p.abilitiesUsed += 1;
          p.airborneTimer = 0.65;
          p.airborneTargetX = Math.max(
            TILE_SIZE + p.radius,
            Math.min(state.mapWidth - TILE_SIZE - p.radius, p.x + Math.cos(p.angle) * 180)
          );
          p.airborneTargetY = Math.max(
            TILE_SIZE + p.radius,
            Math.min(state.mapHeight - TILE_SIZE - p.radius, p.y + Math.sin(p.angle) * 180)
          );
          emitSound(state, 'jump', p.x, p.y);
          addFloat(state, p.x, p.y, 'HAVAYA SIÇRADI!', '#f59e0b');
        }
      } else if (kId === 'juggernaut') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 7;
          p.abilitiesUsed += 1;
          p.dashKind = 'juggernaut_q';
          p.dashTimer = 0.34;
          p.dashHitIds = [];
          const spd = 620;
          p.dashVx = Math.cos(p.angle) * spd;
          p.dashVy = Math.sin(p.angle) * spd;
          emitSound(state, 'slash', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 12;
          p.abilitiesUsed += 1;
          const armSpeed = 760;
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
            radius: 16,
            damage: 15,
            maxRange: 360,
          });
          emitSound(state, 'slash', p.x, p.y);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 13;
          p.abilitiesUsed += 1;
          p.invisibleTimer = 4.0;
          addFloat(state, p.x, p.y, 'GÖRÜNMEZ!', '#94a3b8');
        }
      } else if (kId === 'smile') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 15;
          p.abilitiesUsed += 1;
          const nearestSurv = state.players
            .filter((s) => s.role === 'survivor' && !s.dead)
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
          if (nearestSurv) {
            nearestSurv.blindTimer = 4.0;
            addFloat(state, nearestSurv.x, nearestSurv.y, 'KÖR EDİLDİ! (4sn)', '#e11d48');
            pushEvent(state, `Smile, ${nearestSurv.name} oyuncusunu 4sn kör etti!`, '#e11d48');
          } else {
            addFloat(state, p.x, p.y, 'KARANLIK KÖRLÜK!', '#e11d48');
          }
          emitSound(state, 'lock', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 16;
          p.abilitiesUsed += 1;
          p.darkZoneTimer = 6.5;
          p.darkZoneTick = 0;
          addFloat(state, p.x, p.y, 'KARA ALAN!', '#e11d48');
          emitSound(state, 'lock', p.x, p.y);
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 20;
          p.abilitiesUsed += 1;
          for (const side of [-1, 1]) {
            const spawnAng = p.angle + side * (Math.PI * 0.45);
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
              ttl: 9,
              maxTtl: 9,
              attackCooldown: 0.25,
              hitRecoveryTimer: 0,
              repathTimer: 0,
            };
            state.smileMinions.push(minion);
          }
          addFloat(state, p.x, p.y, 'GÜLÜCÜK ORDUSU (9sn)!', '#f43f5e');
          pushEvent(state, 'Smile 2 küçük gülücük adam çağırdı!', '#f43f5e');
          emitSound(state, 'teleport', p.x, p.y);
        }
      } else if (kId === 'hungry') {
        if (inp.useQ && p.cdQ <= 0) {
          p.cdQ = 10;
          p.abilitiesUsed += 1;
          const knifeSpeed = 680;
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
            radius: 12,
            damage: 44.5,
            maxRange: 540,
          });
          emitSound(state, 'knife', p.x, p.y);
        }
        if (inp.useE && p.cdE <= 0) {
          p.cdE = 18;
          p.abilitiesUsed += 1;
          const smashX = p.x + Math.cos(p.angle) * 52;
          const smashY = p.y + Math.sin(p.angle) * 52;
          const smashRadius = 64;
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

          // 3. Break doors
          for (const door of state.doors) {
            if (
              !door.broken &&
              circleIntersectsRect(smashX, smashY, smashRadius, door.x, door.y, door.w, door.h)
            ) {
              door.broken = true;
              door.locked = false;
              door.open = true;
              addFloat(state, door.x + door.w / 2, door.y, 'KAPI KIRILDI!', '#ef4444');
              pushEvent(state, `${door.label || 'Kapı'} parçalandı!`, '#ef4444');
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

          // 7. Hit humans for 50 damage
          for (const s of state.players) {
            if (
              s.role === 'survivor' &&
              !s.dead &&
              Math.hypot(s.x - smashX, s.y - smashY) <= smashRadius + s.radius
            ) {
              dealDamageToSurvivor(state, p, s, 50);
            }
          }
        }
        if (inp.useR && p.cdR <= 0) {
          p.cdR = 17;
          p.abilitiesUsed += 1;
          p.frenzyTimer = 4.0;
          addFloat(state, p.x, p.y, 'KIZIL ÖFKE! +3 HIZ', '#ef4444');
        }
      }
    }
  }

  // --- SMILE R MINIONS (9s duration, speed 13, 17 dmg on catch + hit slowdown recovery) ---
  const aliveSurvsForMinions = state.players.filter((p) => p.role === 'survivor' && !p.dead);
  const allMinionTargetsDowned =
    aliveSurvsForMinions.length > 0 && aliveSurvsForMinions.every((s) => s.downed);
  const minionPool = allMinionTargetsDowned
    ? aliveSurvsForMinions
    : aliveSurvsForMinions.filter((s) => !s.downed || s.downVulnerable);
  const effectiveMinionTargets = minionPool.length > 0 ? minionPool : aliveSurvsForMinions;

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
    let target: PlayerState | null = null;
    let bestD = Infinity;
    for (const s of effectiveMinionTargets) {
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
            pad: m.radius,
            blockedBarricades: woodBarsForMinions,
            blockedDoors: state.doors,
          }
        );
        m.repathTimer = 0.4;
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
        const isRecovering = (m.hitRecoveryTimer ?? 0) > 0;
        const baseMinionSpeed = isRecovering ? 13 * KILLER_HIT_RECOVERY_SLOW : 13;
        const speedPx = baseMinionSpeed * SPEED_TO_PX;
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

      // Catch survivor -> 17 damage + hit slowdown recovery animation
      if (m.attackCooldown <= 0) {
        const owner = state.players.find((pl) => pl.id === m.ownerId);
        for (const s of aliveSurvsForMinions) {
          if (Math.hypot(s.x - m.x, s.y - m.y) <= m.radius + s.radius + 6) {
            if (owner) {
              const hit = dealDamageToSurvivor(state, owner, s, 17, false, false);
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
                m.attackCooldown = 1.25;
                m.hitRecoveryTimer = 1.1;
                break;
              } else if (s.dodgeTimer > 0) {
                m.attackCooldown = 1.0;
                m.hitRecoveryTimer = 0.8;
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
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    const c = Math.floor(proj.x / TILE_SIZE);
    const r = Math.floor(proj.y / TILE_SIZE);
    const tile = getTileAt(state.tiles, state.cols, state.rows, c, r);
    // Concrete walls block projectiles (cage bars tile=2 let knives/bolts/arms slip or block? Concrete=1 definitely blocks)
    if (tile === 1) {
      state.projectiles.splice(i, 1);
      continue;
    }

    if (Math.hypot(proj.x - proj.startX, proj.y - proj.startY) >= proj.maxRange) {
      state.projectiles.splice(i, 1);
      continue;
    }

    if (proj.kind === 'turret_bolt') {
      if (killer && Math.hypot(killer.x - proj.x, killer.y - proj.y) <= killer.radius + proj.radius) {
        applySlow(killer, 0.5, 2.2); // 50% slow
        addFloat(state, killer.x, killer.y, 'TARET! -%50 Hız', '#fb923c');
        emitSound(state, 'hit', killer.x, killer.y);
        state.projectiles.splice(i, 1);
      }
    } else if (proj.kind === 'kitchen_knife' || proj.kind === 'juggernaut_arm') {
      const owner = state.players.find((pl) => pl.id === proj.ownerId);
      let consumed = false;
      for (const s of state.players) {
        if (s.role === 'survivor' && !s.dead && Math.hypot(s.x - proj.x, s.y - proj.y) <= s.radius + proj.radius) {
          if (owner) {
            const hit = dealDamageToSurvivor(state, owner, s, proj.damage);
            if (hit && proj.kind === 'juggernaut_arm') {
              applySlow(s, 0.25, 2.0);
              // Pull survivor toward Juggernaut
              const pullAngle = Math.atan2(owner.y - s.y, owner.x - s.x);
              const pullDist = Math.min(200, Math.max(0, Math.hypot(owner.x - s.x, owner.y - s.y) - 48));
              s.dashKind = 'pull';
              s.dashTimer = 0.25;
              s.dashVx = Math.cos(pullAngle) * (pullDist / 0.25);
              s.dashVy = Math.sin(pullAngle) * (pullDist / 0.25);
              addFloat(state, s.x, s.y, 'ÇEKİLDİ!', '#dc2626');
            }
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

  // --- CHECK WIN / LOSS CONDITIONS ---
  const remainingSurvivors = state.players.filter((p) => p.role === 'survivor' && !p.dead);
  if (remainingSurvivors.length === 0) {
    state.phase = 'ended';
    state.winner = 'killer';
    state.winReason = 'Katil tüm hayatta kalanları eledi!';
    return;
  }

  if (state.timeRemaining <= 0) {
    state.phase = 'ended';
    state.winner = 'survivors';
    state.winReason = '3 dakikalık süre doldu! Hayatta kalanlar kaçmayı başardı!';
    return;
  }
}
