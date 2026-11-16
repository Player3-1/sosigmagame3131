import { BarricadeEntity, CageZone, DoorEntity, RoomZone, TileType, VentEntity } from './types';

export const MAP_COLS = 74;
export const MAP_ROWS = 52;
export const TILE_SIZE = 44;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE; // 3256
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE; // 2288

export interface MapLayout {
  cols: number;
  rows: number;
  tileSize: number;
  tiles: TileType[];
  doors: DoorEntity[];
  vents: VentEntity[];
  cages: CageZone[];
  rooms: RoomZone[];
  survivorSpawns: { x: number; y: number }[];
  killerSpawn: { x: number; y: number };
}

function setRect(
  tiles: TileType[],
  cols: number,
  x: number,
  y: number,
  w: number,
  h: number,
  val: TileType
) {
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (r >= 0 && r < MAP_ROWS && c >= 0 && c < cols) {
        tiles[r * cols + c] = val;
      }
    }
  }
}

function tileCenter(c: number, r: number): { x: number; y: number } {
  return {
    x: c * TILE_SIZE + TILE_SIZE / 2,
    y: r * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function createFacilityMap(): MapLayout {
  const tiles: TileType[] = new Array(MAP_COLS * MAP_ROWS).fill(0);

  // Outer perimeter walls
  setRect(tiles, MAP_COLS, 0, 0, MAP_COLS, 1, 1);
  setRect(tiles, MAP_COLS, 0, MAP_ROWS - 1, MAP_COLS, 1, 1);
  setRect(tiles, MAP_COLS, 0, 0, 1, MAP_ROWS, 1);
  setRect(tiles, MAP_COLS, MAP_COLS - 1, 0, 1, MAP_ROWS, 1);

  // 1. North-West Medical Wing (Revir): cols 1..16, rows 1..14
  setRect(tiles, MAP_COLS, 1, 14, 16, 1, 1);
  setRect(tiles, MAP_COLS, 16, 1, 1, 14, 1);
  tiles[14 * MAP_COLS + 8] = 0;
  tiles[7 * MAP_COLS + 16] = 0;

  // 2. North-East Security Wing (Güvenlik): cols 57..72, rows 1..14
  setRect(tiles, MAP_COLS, 57, 1, 1, 14, 1);
  setRect(tiles, MAP_COLS, 57, 14, 16, 1, 1);
  tiles[7 * MAP_COLS + 57] = 0;
  tiles[14 * MAP_COLS + 65] = 0;

  // 3. South-West Storage Bunker (Depo): cols 1..16, rows 37..50
  setRect(tiles, MAP_COLS, 1, 37, 16, 1, 1);
  setRect(tiles, MAP_COLS, 16, 37, 1, 14, 1);
  tiles[37 * MAP_COLS + 8] = 0;
  tiles[44 * MAP_COLS + 16] = 0;

  // 4. South-East Generator Lab (Jeneratör): cols 57..72, rows 37..50
  setRect(tiles, MAP_COLS, 57, 37, 1, 14, 1);
  setRect(tiles, MAP_COLS, 57, 37, 16, 1, 1);
  tiles[37 * MAP_COLS + 65] = 0;
  tiles[44 * MAP_COLS + 57] = 0;

  // 5. Mid-West Archive Room (Arşiv): cols 3..14, rows 21..30
  setRect(tiles, MAP_COLS, 3, 21, 12, 1, 1);
  setRect(tiles, MAP_COLS, 3, 30, 12, 1, 1);
  setRect(tiles, MAP_COLS, 3, 21, 1, 10, 1);
  setRect(tiles, MAP_COLS, 14, 21, 1, 10, 1);
  tiles[21 * MAP_COLS + 8] = 0;
  tiles[30 * MAP_COLS + 8] = 0;
  tiles[25 * MAP_COLS + 14] = 0;

  // 6. Mid-East Armory Room (Cephanelik): cols 59..70, rows 21..30
  setRect(tiles, MAP_COLS, 59, 21, 12, 1, 1);
  setRect(tiles, MAP_COLS, 59, 30, 12, 1, 1);
  setRect(tiles, MAP_COLS, 59, 21, 1, 10, 1);
  setRect(tiles, MAP_COLS, 70, 21, 1, 10, 1);
  tiles[21 * MAP_COLS + 65] = 0;
  tiles[30 * MAP_COLS + 65] = 0;
  tiles[25 * MAP_COLS + 59] = 0;

  // Tactical Corridor Cover & Kiting Pillars
  setRect(tiles, MAP_COLS, 24, 10, 4, 2, 1);
  setRect(tiles, MAP_COLS, 46, 10, 4, 2, 1);
  setRect(tiles, MAP_COLS, 24, 40, 4, 2, 1);
  setRect(tiles, MAP_COLS, 46, 40, 4, 2, 1);
  setRect(tiles, MAP_COLS, 20, 24, 2, 4, 1);
  setRect(tiles, MAP_COLS, 52, 24, 2, 4, 1);
  setRect(tiles, MAP_COLS, 35, 13, 4, 2, 1);
  setRect(tiles, MAP_COLS, 35, 37, 4, 2, 1);

  // --- CAGES (Kafesler) - Iron bar walls (TileType = 2) ---
  // Cage 1: Center Containment Cage (32..41, 21..30)
  setRect(tiles, MAP_COLS, 32, 21, 10, 1, 2);
  setRect(tiles, MAP_COLS, 32, 30, 10, 1, 2);
  setRect(tiles, MAP_COLS, 32, 21, 1, 10, 2);
  setRect(tiles, MAP_COLS, 41, 21, 1, 10, 2);
  tiles[25 * MAP_COLS + 32] = 0;
  tiles[26 * MAP_COLS + 32] = 0;
  tiles[25 * MAP_COLS + 41] = 0;
  tiles[26 * MAP_COLS + 41] = 0;
  tiles[21 * MAP_COLS + 36] = 0;
  tiles[30 * MAP_COLS + 36] = 0;

  // Cage 2: North Holding Cage (31..42, 3..8)
  setRect(tiles, MAP_COLS, 31, 3, 12, 1, 2);
  setRect(tiles, MAP_COLS, 31, 8, 12, 1, 2);
  setRect(tiles, MAP_COLS, 31, 3, 1, 6, 2);
  setRect(tiles, MAP_COLS, 42, 3, 1, 6, 2);
  tiles[8 * MAP_COLS + 36] = 0;
  tiles[8 * MAP_COLS + 37] = 0;
  tiles[5 * MAP_COLS + 31] = 0;
  tiles[5 * MAP_COLS + 42] = 0;

  // Cage 3: South Holding Cage (31..42, 43..48)
  setRect(tiles, MAP_COLS, 31, 43, 12, 1, 2);
  setRect(tiles, MAP_COLS, 31, 48, 12, 1, 2);
  setRect(tiles, MAP_COLS, 31, 43, 1, 6, 2);
  setRect(tiles, MAP_COLS, 42, 43, 1, 6, 2);
  tiles[43 * MAP_COLS + 36] = 0;
  tiles[43 * MAP_COLS + 37] = 0;
  tiles[45 * MAP_COLS + 31] = 0;
  tiles[45 * MAP_COLS + 42] = 0;

  // Cage 4: West Quarantine Cage (18..22, 15..19)
  setRect(tiles, MAP_COLS, 18, 15, 5, 1, 2);
  setRect(tiles, MAP_COLS, 18, 19, 5, 1, 2);
  setRect(tiles, MAP_COLS, 18, 15, 1, 5, 2);
  setRect(tiles, MAP_COLS, 22, 15, 1, 5, 2);
  tiles[17 * MAP_COLS + 18] = 0;
  tiles[17 * MAP_COLS + 22] = 0;

  const cages: CageZone[] = [
    {
      id: 'cage_center',
      name: 'Merkez Kafes',
      x: 32 * TILE_SIZE,
      y: 21 * TILE_SIZE,
      w: 10 * TILE_SIZE,
      h: 10 * TILE_SIZE,
    },
    {
      id: 'cage_north',
      name: 'Kuzey Kafesi',
      x: 31 * TILE_SIZE,
      y: 3 * TILE_SIZE,
      w: 12 * TILE_SIZE,
      h: 6 * TILE_SIZE,
    },
    {
      id: 'cage_south',
      name: 'Güney Kafesi',
      x: 31 * TILE_SIZE,
      y: 43 * TILE_SIZE,
      w: 12 * TILE_SIZE,
      h: 6 * TILE_SIZE,
    },
    {
      id: 'cage_west',
      name: 'Karantina Kafesi',
      x: 18 * TILE_SIZE,
      y: 15 * TILE_SIZE,
      w: 5 * TILE_SIZE,
      h: 5 * TILE_SIZE,
    },
  ];

  const rooms: RoomZone[] = [
    { id: 'r_nw', name: 'REVİR', x: 1 * TILE_SIZE, y: 1 * TILE_SIZE, w: 15 * TILE_SIZE, h: 13 * TILE_SIZE },
    { id: 'r_ne', name: 'GÜVENLİK', x: 58 * TILE_SIZE, y: 1 * TILE_SIZE, w: 15 * TILE_SIZE, h: 13 * TILE_SIZE },
    { id: 'r_sw', name: 'DEPO', x: 1 * TILE_SIZE, y: 38 * TILE_SIZE, w: 15 * TILE_SIZE, h: 13 * TILE_SIZE },
    { id: 'r_se', name: 'JENERATÖR', x: 58 * TILE_SIZE, y: 38 * TILE_SIZE, w: 15 * TILE_SIZE, h: 13 * TILE_SIZE },
    { id: 'r_mw', name: 'ARŞİV', x: 4 * TILE_SIZE, y: 22 * TILE_SIZE, w: 10 * TILE_SIZE, h: 8 * TILE_SIZE },
    { id: 'r_me', name: 'CEPHANELİK', x: 60 * TILE_SIZE, y: 22 * TILE_SIZE, w: 10 * TILE_SIZE, h: 8 * TILE_SIZE },
  ];

  const doors: DoorEntity[] = [
    {
      id: 'door_nw_south',
      x: 8 * TILE_SIZE,
      y: 14 * TILE_SIZE + 12,
      w: TILE_SIZE,
      h: 20,
      orientation: 'h',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Revir Güney',
    },
    {
      id: 'door_nw_east',
      x: 16 * TILE_SIZE + 12,
      y: 7 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Revir Doğu',
    },
    {
      id: 'door_ne_west',
      x: 57 * TILE_SIZE + 12,
      y: 7 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Güvenlik Batı',
    },
    {
      id: 'door_ne_south',
      x: 65 * TILE_SIZE,
      y: 14 * TILE_SIZE + 12,
      w: TILE_SIZE,
      h: 20,
      orientation: 'h',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Güvenlik Güney',
    },
    {
      id: 'door_sw_north',
      x: 8 * TILE_SIZE,
      y: 37 * TILE_SIZE + 12,
      w: TILE_SIZE,
      h: 20,
      orientation: 'h',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Depo Kuzey',
    },
    {
      id: 'door_sw_east',
      x: 16 * TILE_SIZE + 12,
      y: 44 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Depo Doğu',
    },
    {
      id: 'door_se_north',
      x: 65 * TILE_SIZE,
      y: 37 * TILE_SIZE + 12,
      w: TILE_SIZE,
      h: 20,
      orientation: 'h',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Jeneratör Kuzey',
    },
    {
      id: 'door_se_west',
      x: 57 * TILE_SIZE + 12,
      y: 44 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Jeneratör Batı',
    },
    // Archive & Armory Doors
    {
      id: 'door_mw_east',
      x: 14 * TILE_SIZE + 12,
      y: 25 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Arşiv Doğu',
    },
    {
      id: 'door_me_west',
      x: 59 * TILE_SIZE + 12,
      y: 25 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Cephanelik Batı',
    },
    // Center Cage Gates
    {
      id: 'door_cage_west',
      x: 32 * TILE_SIZE + 12,
      y: 25 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE * 2,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Merkez Kafes Batı',
    },
    {
      id: 'door_cage_east',
      x: 41 * TILE_SIZE + 12,
      y: 25 * TILE_SIZE,
      w: 20,
      h: TILE_SIZE * 2,
      orientation: 'v',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Merkez Kafes Doğu',
    },
    {
      id: 'door_cage_north',
      x: 36 * TILE_SIZE,
      y: 21 * TILE_SIZE + 12,
      w: TILE_SIZE,
      h: 20,
      orientation: 'h',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Merkez Kafes Kuzey',
    },
    {
      id: 'door_cage_south',
      x: 36 * TILE_SIZE,
      y: 30 * TILE_SIZE + 12,
      w: TILE_SIZE,
      h: 20,
      orientation: 'h',
      locked: false,
      lockHits: 0,
      broken: false,
      open: true,
      label: 'Merkez Kafes Güney',
    },
  ];

  // 8 Vents positioned across strategic rooms & mid-corridors
  const vents: VentEntity[] = [
    { id: 'vent_nw', ...tileCenter(5, 5), broken: false, label: 'Revir Venti' },
    { id: 'vent_ne', ...tileCenter(68, 5), broken: false, label: 'Güvenlik Venti' },
    { id: 'vent_archive', ...tileCenter(8, 25), broken: false, label: 'Arşiv Venti' },
    { id: 'vent_armory', ...tileCenter(65, 25), broken: false, label: 'Cephanelik Venti' },
    { id: 'vent_mid_n', ...tileCenter(36, 16), broken: false, label: 'Kuzey Koridor Venti' },
    { id: 'vent_mid_s', ...tileCenter(36, 35), broken: false, label: 'Güney Koridor Venti' },
    { id: 'vent_sw', ...tileCenter(5, 46), broken: false, label: 'Depo Venti' },
    { id: 'vent_se', ...tileCenter(68, 46), broken: false, label: 'Jeneratör Venti' },
  ];

  const survivorSpawns = [
    tileCenter(8, 8),
    tileCenter(65, 8),
    tileCenter(8, 43),
    tileCenter(65, 43),
  ];

  const killerSpawn = tileCenter(36, 25); // Inside central containment cage at start

  return {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    tileSize: TILE_SIZE,
    tiles,
    doors,
    vents,
    cages,
    rooms,
    survivorSpawns,
    killerSpawn,
  };
}

export function isSolidTile(tile: TileType): boolean {
  return tile === 1 || tile === 2;
}

export function getTileAt(
  tiles: TileType[],
  cols: number,
  rows: number,
  c: number,
  r: number
): TileType {
  if (c < 0 || r < 0 || c >= cols || r >= rows) return 1;
  return tiles[r * cols + c];
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveCircleRect(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { x: number; y: number; collided: boolean } {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= cr * cr) {
    return { x: cx, y: cy, collided: false };
  }

  const dist = Math.sqrt(distSq);
  if (dist > 0.0001) {
    const overlap = cr - dist;
    return {
      x: cx + (dx / dist) * overlap,
      y: cy + (dy / dist) * overlap,
      collided: true,
    };
  }

  const leftPen = cx - rx;
  const rightPen = rx + rw - cx;
  const topPen = cy - ry;
  const bottomPen = ry + rh - cy;
  const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
  if (minPen === leftPen) return { x: rx - cr, y: cy, collided: true };
  if (minPen === rightPen) return { x: rx + rw + cr, y: cy, collided: true };
  if (minPen === topPen) return { x: cx, y: ry - cr, collided: true };
  return { x: cx, y: ry + rh + cr, collided: true };
}

// Line of sight check (iron cage bars = 2 allow seeing through, concrete wall = 1 blocks sight)
export function hasLineOfSight(
  tiles: TileType[],
  cols: number,
  rows: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  const steps = Math.ceil(dist / 16);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const c = Math.floor(px / TILE_SIZE);
    const r = Math.floor(py / TILE_SIZE);
    const tile = getTileAt(tiles, cols, rows, c, r);
    if (tile === 1) return false;
  }
  return true;
}

// Clear movement corridor check (checks center + side clearance so bots don't clip corners)
export function hasWalkableLine(
  tiles: TileType[],
  cols: number,
  rows: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pad = 14
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return true;
  const nx = (-dy / dist) * pad;
  const ny = (dx / dist) * pad;
  const steps = Math.ceil(dist / 14);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const checks = pad > 0 ? [[0, 0], [nx, ny], [-nx, -ny]] : [[0, 0]];
    for (const [ox, oy] of checks) {
      const c = Math.floor((px + ox) / TILE_SIZE);
      const r = Math.floor((py + oy) / TILE_SIZE);
      if (isSolidTile(getTileAt(tiles, cols, rows, c, r))) return false;
    }
  }
  return true;
}

export interface PathOptions {
  avoidPos?: { x: number; y: number; radius: number };
  blockedDoors?: DoorEntity[];
  blockedBarricades?: BarricadeEntity[];
  pad?: number;
}

// Computes smoothed waypoint array from start to goal
export function findPathWaypoints(
  tiles: TileType[],
  cols: number,
  rows: number,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  options?: PathOptions
): { x: number; y: number }[] {
  const sc = Math.max(1, Math.min(cols - 2, Math.floor(startX / TILE_SIZE)));
  const sr = Math.max(1, Math.min(rows - 2, Math.floor(startY / TILE_SIZE)));
  const gc = Math.max(1, Math.min(cols - 2, Math.floor(goalX / TILE_SIZE)));
  const gr = Math.max(1, Math.min(rows - 2, Math.floor(goalY / TILE_SIZE)));

  if (sc === gc && sr === gr) return [{ x: goalX, y: goalY }];

  const total = cols * rows;
  const blocked = new Uint8Array(total);

  if (options?.blockedDoors) {
    for (const d of options.blockedDoors) {
      if (d.broken || !d.locked) continue;
      const c0 = Math.max(0, Math.floor(d.x / TILE_SIZE));
      const c1 = Math.min(cols - 1, Math.floor((d.x + d.w - 1) / TILE_SIZE));
      const r0 = Math.max(0, Math.floor(d.y / TILE_SIZE));
      const r1 = Math.min(rows - 1, Math.floor((d.y + d.h - 1) / TILE_SIZE));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          blocked[r * cols + c] = 1;
        }
      }
    }
  }

  if (options?.blockedBarricades) {
    for (const b of options.blockedBarricades) {
      const c0 = Math.max(0, Math.floor(b.x / TILE_SIZE));
      const c1 = Math.min(cols - 1, Math.floor((b.x + b.w - 1) / TILE_SIZE));
      const r0 = Math.max(0, Math.floor(b.y / TILE_SIZE));
      const r1 = Math.min(rows - 1, Math.floor((b.y + b.h - 1) / TILE_SIZE));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          blocked[r * cols + c] = 1;
        }
      }
    }
  }

  const distCost = new Float32Array(total).fill(1e9);
  const parent = new Int32Array(total).fill(-1);
  const visited = new Uint8Array(total);
  const startIdx = sr * cols + sc;
  const goalIdx = gr * cols + gc;

  distCost[startIdx] = 0;
  const dirs = [1, -1, cols, -cols];
  const avoid = options?.avoidPos;
  let found = false;

  if (!avoid) {
    // True FIFO BFS
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;

    while (head < tail) {
      const curr = queue[head++];
      if (curr === goalIdx) {
        found = true;
        break;
      }
      const cc = curr % cols;
      const cr = (curr - cc) / cols;

      for (let d = 0; d < 4; d++) {
        const next = curr + dirs[d];
        if (next < 0 || next >= total || visited[next]) continue;
        const nc = next % cols;
        const nr = (next - nc) / cols;
        if (Math.abs(nc - cc) + Math.abs(nr - cr) !== 1) continue;
        if ((isSolidTile(tiles[next]) || blocked[next]) && next !== goalIdx) continue;
        visited[next] = 1;
        parent[next] = curr;
        queue[tail++] = next;
      }
    }
  } else {
    // Dijkstra with hazard penalty near Killer
    const queue: number[] = [startIdx];
    while (queue.length > 0) {
      let bestPos = 0;
      let minC = distCost[queue[0]];
      for (let i = 1; i < queue.length; i++) {
        if (distCost[queue[i]] < minC) {
          minC = distCost[queue[i]];
          bestPos = i;
        }
      }
      const curr = queue[bestPos];
      queue[bestPos] = queue[queue.length - 1];
      queue.pop();

      if (visited[curr]) continue;
      visited[curr] = 1;

      if (curr === goalIdx) {
        found = true;
        break;
      }

      const cc = curr % cols;
      const cr = (curr - cc) / cols;

      for (let d = 0; d < 4; d++) {
        const next = curr + dirs[d];
        if (next < 0 || next >= total || visited[next]) continue;
        const nc = next % cols;
        const nr = (next - nc) / cols;
        if (Math.abs(nc - cc) + Math.abs(nr - cr) !== 1) continue;
        if ((isSolidTile(tiles[next]) || blocked[next]) && next !== goalIdx) continue;

        const wx = nc * TILE_SIZE + TILE_SIZE / 2;
        const wy = nr * TILE_SIZE + TILE_SIZE / 2;
        const dk = Math.hypot(wx - avoid.x, wy - avoid.y);
        let stepCost = 1;
        if (dk < avoid.radius) {
          stepCost += 18 * (1 - dk / avoid.radius);
        }
        // Subtle penalty for blocked tiles even if goal is adjacent
        if (blocked[next]) stepCost += 40;

        const newCost = distCost[curr] + stepCost;
        if (newCost < distCost[next]) {
          distCost[next] = newCost;
          parent[next] = curr;
          queue.push(next);
        }
      }
    }
  }

  if (!found) return [{ x: goalX, y: goalY }];

  // Reconstruct tile centers
  const rawPoints: { x: number; y: number }[] = [];
  let cur = goalIdx;
  while (cur !== -1 && cur !== startIdx) {
    const tc = cur % cols;
    const tr = (cur - tc) / cols;
    rawPoints.push({
      x: tc * TILE_SIZE + TILE_SIZE / 2,
      y: tr * TILE_SIZE + TILE_SIZE / 2,
    });
    cur = parent[cur];
  }
  rawPoints.reverse();
  if (rawPoints.length === 0) return [{ x: goalX, y: goalY }];
  rawPoints[rawPoints.length - 1] = { x: goalX, y: goalY };

  // Simplify path via string-pulling (greedy furthest walkable point)
  const pad = options?.pad ?? 12;
  const waypoints: { x: number; y: number }[] = [];
  let anchorX = startX;
  let anchorY = startY;
  let i = 0;
  while (i < rawPoints.length) {
    let furthest = i;
    const maxLook = Math.min(rawPoints.length - 1, i + 10);
    for (let j = maxLook; j > i; j--) {
      if (hasWalkableLine(tiles, cols, rows, anchorX, anchorY, rawPoints[j].x, rawPoints[j].y, pad)) {
        furthest = j;
        break;
      }
    }
    waypoints.push(rawPoints[furthest]);
    anchorX = rawPoints[furthest].x;
    anchorY = rawPoints[furthest].y;
    i = furthest + 1;
  }

  return waypoints;
}

export function findNextPathPoint(
  tiles: TileType[],
  cols: number,
  rows: number,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  options?: PathOptions
): { x: number; y: number } {
  const pts = findPathWaypoints(tiles, cols, rows, startX, startY, goalX, goalY, options);
  return pts[0] ?? { x: goalX, y: goalY };
}
