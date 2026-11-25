export type RoleType = 'survivor' | 'killer';

export type SurvivorClassId =
  | 'doctor'
  | 'engineer'
  | 'fighter'
  | 'trapper'
  | 'runner'
  | 'builder'
  | 'protector'
  | 'bomber'
  | 'chaplain'
  | 'farmer'
  | 'shadow';

export type KillerId = 'jumper' | 'juggernaut' | 'smile' | 'hungry' | 'sawblooder' | 'darkness' | 'hunter';

export type BotTier = 'noob' | 'normal' | 'pro';

export type TileType = 0 | 1 | 2 | 3;
// 0 = floor, 1 = concrete wall, 2 = iron cage bar wall (see-through), 3 = breached wall (passable rubble)

export interface DoorEntity {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  orientation: 'h' | 'v';
  locked: boolean;
  lockHits: number; // 0..maxLockHits (default 4 hits breaks lock)
  maxLockHits?: number; // default 4; Builder custom/repair = 3, Builder reinforce = 10
  isCustom?: boolean; // built by Builder in open space
  broken: boolean; // permanently shattered when lock hits reach max
  open: boolean;
  label?: string;
  sealedByHunter?: boolean;
}

export interface VentEntity {
  id: string;
  x: number;
  y: number;
  broken: boolean;
  label: string;
  sealedByHunter?: boolean;
}

export interface CageZone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrapEntity {
  id: string;
  ownerId: string;
  kind: 'snare' | 'slow' | 'bomb' | 'smile_mine' | 'hunter_scythe';
  x: number;
  y: number;
  radius: number;
  triggered: boolean;
}

export interface BarricadeEntity {
  id: string;
  ownerId: string;
  kind: 'wood' | 'shadow'; // wood = Builder Q (blocks killer, 4s break), shadow = Smile E (16s, blocks survivors only)
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  breakProgress: number; // 0..4 seconds
  expiresAt?: number; // timestamp in match elapsed seconds for Smile shadow barricade
}

export interface TurretEntity {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  fireCooldown: number;
  hp: number; // 1 hit kills it
}

export interface ProjectileEntity {
  id: string;
  ownerId: string;
  kind:
    | 'turret_bolt'
    | 'kitchen_knife'
    | 'juggernaut_arm'
    | 'meat_lob'
    | 'protector_shield'
    | 'protector_protect'
    | 'bomber_bomb'
    | 'smile_ball'
    | 'hunter_pellet';
  x: number;
  y: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  maxRange: number;
  shotId?: string;
  returning?: boolean;
  homingElapsed?: number;
  hitPlayerId?: string;
  targetX?: number;
  targetY?: number;
  lobProgress?: number;
  lobDuration?: number;
  lobHeight?: number;
}

export interface SmileMinion {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  ttl: number;
  maxTtl: number;
  attackCooldown: number;
  hitRecoveryTimer?: number;
  targetId?: string;
  path?: { x: number; y: number }[];
  repathTimer?: number;
}

export interface AoEEffect {
  id: string;
  kind:
    | 'doctor_heal'
    | 'jumper_slam'
    | 'hungry_cleave'
    | 'fighter_punch'
    | 'protector_beam'
    | 'slash'
    | 'blood_splatter'
    | 'killer_kill'
    | 'flash_cone'
    | 'hunter_shotgun_blast'
    | 'hunter_teleport';
  killerId?: KillerId;
  victimEmoji?: string;
  victimColor?: string;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  angle?: number;
  radius: number;
  ttl: number;
  maxTtl: number;
  color: string;
}

export type InventoryItemKind = 'medkit' | 'flashlight' | 'coffee' | 'shield';

export interface InventorySlot {
  id: string;
  kind: InventoryItemKind;
  durability?: number;
  maxDurability?: number;
}

export interface ChestEntity {
  id: string;
  x: number;
  y: number;
  roomId: string;
  roomName: string;
  opened: boolean;
  sealedByHunter?: boolean;
}

export interface CropEntity {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  growth: number; // 0..maxGrowth seconds
  maxGrowth: number; // 30s
  ready: boolean;
  sealedByHunter?: boolean; // Hunter E seal turns crop poisonous (-15 HP on eat)
}

export interface BloodStain {
  id: string;
  x: number;
  y: number;
  radius: number;
  angle: number;
  seed: number;
  alpha: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  maxTtl: number;
}

export interface CoinBreakdownItem {
  label: string;
  count: number;
  amount: number;
}

export interface ChannelAction {
  type:
    | 'revive'
    | 'lock_door'
    | 'bandage'
    | 'escape_trap'
    | 'break_barricade'
    | 'repair_saw'
    | 'loot_chest'
    | 'use_medkit'
    | 'drink_coffee';
  targetId: string;
  progress: number;
  duration: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  role: RoleType;
  survivorClass?: SurvivorClassId;
  killerId?: KillerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  baseSpeed: number;
  downed: boolean;
  downVulnerable: boolean; // true once downed HP reaches 1 (80% slow & killable)
  downCount: number; // 1st & 2nd down enter downed state; 3rd down = direct death
  dead: boolean;
  bleedoutTimer: number; // remaining seconds until 1 HP
  downGraceTimer: number;
  carryingSurvivorId?: string | null; // ID of downed survivor currently carried on back
  carriedById?: string | null; // ID of survivor carrying this downed player
  // Cooldowns remaining (seconds)
  cdAttack: number;
  cdQ: number;
  cdE: number;
  cdR: number;
  // Status durations (seconds)
  hitRecoveryTimer: number; // 0.9s DBD-style killer weapon wipe / reload after hit
  stunTimer: number;
  frozenTimer?: number; // Chaplain Q 2.5s freeze visual/status timer
  slowTimer: number;
  slowAmount: number; // 0..1 (e.g., 0.30 = 30% slow)
  speedBoostTimer: number;
  speedBoostAmount: number; // flat speed bonus e.g. +4 or +3
  dodgeTimer: number; // Fighter E 1.5s
  fighterQCharges?: number; // Unlocked by landing Fighter E dodge against killer
  dodgeRewardedThisCast?: boolean; // Prevents multiple Q charges from a single E cast
  invisibleTimer: number; // Juggernaut R 3s
  shadowInvisTimer?: number; // Shadow Q 3s invisibility (+20% stamina regen)
  darknessStealthTimer?: number; // Darkness E 4s (5% visible / 95% transparent)
  darknessModeTimer?: number; // Darkness R 3s (+30% speed & phase through objects)
  darkZoneTimer: number; // Smile E 6.5s black aura (10 dmg/s + 25% slow)
  darkZoneTick: number;
  blindTimer: number; // Smile Q: 4s 75% darkness blind on this player
  flashBlindTimer?: number; // Flashlight: 2s epilepsy-safe fog blind on killers & survivors
  frenzyTimer: number; // Hungry R 6s (+5 speed)
  healAuraTimer: number; // Doctor Q 5s
  healAuraTick: number;
  shieldHp?: number; // Protector Q 60 bonus decaying shield HP
  protectedTimer?: number; // Protector E 3s full damage immunity
  protectorTargetId?: string | null; // Selected ally ID clicked by Protector's staff
  chaplainKnifeCharges?: number; // Ready pocket-knife strike charges (+1 per Q blessing, E stuns killer 1s on hit)
  blessed?: boolean; // Chaplain Q blessing (+2 HP/s while intact + blocks first killer hit for 20s)
  blessedTimer?: number; // Remaining seconds before unused Chaplain blessing expires
  blessedHealTick?: number; // Accumulator for +2 HP/sec while blessed
  farmerScytheLevel?: number; // Farmer E scythe level (1..9, increases on each killer hit)
  damageResistTimer?: number; // Damage reduction duration (e.g., Farmer crop +4s 25% resist)
  damageResistAmount?: number; // 0..1 damage reduction ratio (e.g., 0.25 = 25% damage resist)
  inventory?: (InventorySlot | null)[]; // 3-slot survivor inventory (keys 1, 2, 3)
  equippedSlot?: number | null; // Currently held slot index (0, 1, 2) or null
  medkitRegenTimer?: number; // Remaining seconds of +3 HP/sec medkit regeneration
  medkitRegenTick?: number; // Accumulator for +3 HP/sec
  coffeeBuffTimer?: number; // 10s +20% speed & -20% stamina drain
  trappedById: string | null; // Trapper Q snare
  staminaExhausted?: boolean; // prevents 1-frame sprint flicker at 0 stamina
  // Sawblooder abilities, stuck animation, malfunction & hold-to-attack saw state
  chainsawChargeTimer?: number; // Sawblooder E active flag (>0 until wall/obstacle/survivor collision)
  chainsawChargeDuration?: number; // elapsed charge time for 15 -> 27 speed ramp
  chainsawStuckTimer?: number; // 2s stuck-in-wall pullout animation when E misses
  chainsawStuckAngle?: number; // locked facing angle while stuck
  chainsawFlurryTimer?: number; // Sawblooder R: 4s +4 speed (+2s per hit)
  chainsawFlurryHitCooldowns?: Record<string, number>;
  sawHoldTimer?: number;
  sawRevving?: boolean;
  sawMalfunction?: boolean;
  sawMalfunctionTimer?: number;
  // Hunter (Kayıp Çiftçi) state: shotgun ready/recovery & sealed object F-teleport alert
  hunterShotgunReady?: boolean;
  hunterShotgunRecoverTimer?: number;
  hunterAlertTargetId?: string | null;
  hunterAlertX?: number;
  hunterAlertY?: number;
  hunterAlertTimer?: number;
  hunterAlertObjectLabel?: string;
  // Movement abilities
  dashTimer: number;
  dashVx: number;
  dashVy: number;
  dashKind:
    | 'none'
    | 'runner_rush'
    | 'jumper_q'
    | 'jumper_e'
    | 'juggernaut_q'
    | 'pull'
    | 'sawblooder_q'
    | 'darkness_e'
    | 'shadow_e';
  dashHitIds: string[];
  multiJumpRemaining: number; // Jumper E 5 consecutive AoE jumps
  multiJumpHitAny?: boolean;
  airborneTimer: number; // Jumper R high jump
  airborneTargetX: number;
  airborneTargetY: number;
  // Channeling (F / E)
  channel: ChannelAction | null;
  // Stats for summary
  damageDealt: number;
  rescues: number;
  abilitiesUsed: number;
  coinBreakdown?: CoinBreakdownItem[];
  coinsEarned?: number;
  // Bot AI memory
  botGoal?: {
    kind:
      | 'flee'
      | 'rescue'
      | 'heal_ally'
      | 'lock_door'
      | 'place_trap'
      | 'place_turret'
      | 'bodyguard'
      | 'vent_escape'
      | 'patrol'
      | 'hunt';
    targetId?: string;
    x: number;
    y: number;
    until: number;
  };
  botPath?: { x: number; y: number }[];
  botTargetPos?: { x: number; y: number };
  botRepathTimer?: number;
  botLastX?: number;
  botLastY?: number;
  botStuckTimer?: number;
  botStrafeDir?: number;
  botBreakBarricadeId?: string;
  botChaseStagnantTimer?: number;
  botLastChaseDist?: number;
  botLastChaseTargetId?: string;
  botTier?: BotTier;
  botRandomSkillTimer?: number;
  botMistakeTimer?: number;
  botMistakeActive?: boolean;
  botSprintResting?: boolean;
  botBlindWanderAngle?: number;
  botBlindWanderTimer?: number;
}

export interface EventFeedItem {
  id: string;
  text: string;
  color: string;
  ttl: number;
}

export interface SoundEvent {
  type:
    | 'hit'
    | 'slash'
    | 'dodge'
    | 'heal'
    | 'trap'
    | 'vent'
    | 'lock'
    | 'break'
    | 'teleport'
    | 'jump'
    | 'knife'
    | 'downed'
    | 'kill'
    | 'revive'
    | 'turret';
  x: number;
  y: number;
}

export interface RoomZone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SurvivorChatMessage {
  id: string;
  senderName: string;
  text: string;
  ts: number;
}

export interface ActiveExecution {
  id: string;
  killerId: KillerId;
  killerPlayerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  victimClass: SurvivorClassId;
  x: number;
  y: number;
  timer: number;
  duration: number;
  lockKiller: boolean;
  isFinalKill: boolean;
}

export interface LastKillInfo {
  id: string;
  killerId: KillerId;
  killerName: string;
  victimId: string;
  victimName: string;
  victimClass: SurvivorClassId;
  atElapsed: number;
  isFinalKill: boolean;
}

export interface GameState {
  phase: 'playing' | 'ended';
  winner: 'survivors' | 'killer' | null;
  winReason: string;
  timeRemaining: number; // starts at 180
  elapsed: number;
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  cols: number;
  rows: number;
  tiles: TileType[]; // flat cols * rows
  doors: DoorEntity[];
  vents: VentEntity[];
  cages: CageZone[];
  rooms: RoomZone[];
  traps: TrapEntity[];
  barricades: BarricadeEntity[];
  turrets: TurretEntity[];
  chests: ChestEntity[];
  chestRefreshTimer?: number;
  crops: CropEntity[];
  projectiles: ProjectileEntity[];
  smileMinions: SmileMinion[];
  effects: AoEEffect[];
  bloodStains: BloodStain[];
  floatingTexts: FloatingText[];
  eventFeed: EventFeedItem[];
  shakeTimer: number;
  shakeIntensity: number;
  players: PlayerState[];
  soundEvents: SoundEvent[];
  activeExecution?: ActiveExecution | null;
  lastSurvivorTriggered?: boolean;
  lastKillInfo?: LastKillInfo | null;
  matchId?: string;
  isTestMode?: boolean;
  survivorChat?: SurvivorChatMessage[];
}

export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  angle: number;
  attack: boolean;
  attackHeld?: boolean;
  useQ: boolean;
  useE: boolean;
  useR: boolean;
  useCtrl: boolean;
  holdF: boolean;
  selectSlot?: number; // -1 unequip, or 0, 1, 2 (keys 1, 2, 3 / scroll)
  useItem?: boolean; // trigger active consumable item
  dropSlot?: number; // 0, 1, or 2 to drop/discard item from slot
  aimX?: number;
  aimY?: number;
  targetX?: number;
  targetY?: number;
  ventTargetId?: string;
  chatTextToSend?: string;
}
