export type RoleType = 'survivor' | 'killer';

export type SurvivorClassId =
  | 'doctor'
  | 'engineer'
  | 'fighter'
  | 'trapper'
  | 'runner'
  | 'builder';

export type KillerId = 'jumper' | 'juggernaut' | 'smile' | 'hungry' | 'sawblooder';

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
  lockHits: number; // 0..3 (3 hits breaks lock and opens/destroys door lock)
  broken: boolean; // permanently shattered by 3 hits or Hungry E
  open: boolean;
  label?: string;
}

export interface VentEntity {
  id: string;
  x: number;
  y: number;
  broken: boolean;
  label: string;
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
  kind: 'snare' | 'slow';
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
  kind: 'turret_bolt' | 'kitchen_knife' | 'juggernaut_arm' | 'meat_lob';
  x: number;
  y: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  maxRange: number;
  returning?: boolean;
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
  kind: 'doctor_heal' | 'jumper_slam' | 'hungry_cleave' | 'fighter_punch' | 'slash' | 'blood_splatter';
  x: number;
  y: number;
  angle?: number;
  radius: number;
  ttl: number;
  maxTtl: number;
  color: string;
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

export interface ChannelAction {
  type: 'revive' | 'lock_door' | 'bandage' | 'escape_trap' | 'break_barricade' | 'repair_saw';
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
  // Cooldowns remaining (seconds)
  cdAttack: number;
  cdQ: number;
  cdE: number;
  cdR: number;
  // Status durations (seconds)
  hitRecoveryTimer: number; // 0.9s DBD-style killer weapon wipe / reload after hit
  stunTimer: number;
  slowTimer: number;
  slowAmount: number; // 0..1 (e.g., 0.30 = 30% slow)
  speedBoostTimer: number;
  speedBoostAmount: number; // flat speed bonus e.g. +4 or +3
  dodgeTimer: number; // Fighter E 1.5s
  fighterQCharges?: number; // Unlocked by landing Fighter E dodge against killer
  dodgeRewardedThisCast?: boolean; // Prevents multiple Q charges from a single E cast
  invisibleTimer: number; // Juggernaut R 3s
  darkZoneTimer: number; // Smile E 6.5s black aura (10 dmg/s + 25% slow)
  darkZoneTick: number;
  blindTimer: number; // Smile Q: 4s 95% darkness blind on this player
  frenzyTimer: number; // Hungry R 4s (red +3 speed)
  healAuraTimer: number; // Doctor Q 7s
  healAuraTick: number;
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
  // Movement abilities
  dashTimer: number;
  dashVx: number;
  dashVy: number;
  dashKind: 'none' | 'runner_rush' | 'jumper_q' | 'jumper_e' | 'juggernaut_q' | 'pull' | 'sawblooder_q';
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

export interface GameState {
  phase: 'playing' | 'ended';
  winner: 'survivors' | 'killer' | null;
  winReason: string;
  timeRemaining: number; // starts at 300
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
  targetX?: number;
  targetY?: number;
}
