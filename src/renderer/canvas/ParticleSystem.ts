export interface Grain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  colorOffset: number; // per-grain brightness offset (-1 to 1), applied by renderer
  settled: boolean;
  active: boolean; // false = waiting in top reserve
}

interface LineSegment {
  x1: number; y1: number;
  x2: number; y2: number;
}

interface HourglassGeometry {
  walls: LineSegment[];
  neckLeft: number;
  neckRight: number;
  neckTopY: number;
  neckBottomY: number;
  bottomFloorY: number;
  topCeilingY: number;
}

const GRAVITY = 600;        // px/s²
const DAMPING = 0.3;        // velocity retention on bounce
const FRICTION = 0.92;      // horizontal friction
const SETTLE_THRESHOLD = 8; // velocity below which grains settle
const GRAIN_RADIUS = 2.5;
const CELL_SIZE = GRAIN_RADIUS * 4;

export class ParticleSystem {
  private _grains: Grain[] = [];
  private _geometry: HourglassGeometry | null = null;
  private _spatialGrid = new Map<string, Grain[]>();
  private _totalGrains = 0;
  private _releasedCount = 0;
  private _releaseInterval = 0;     // ms between grain releases
  private _lastReleaseTime = 0;
  private _elapsedMs = 0;
  private _totalMs = 0;

  get grains(): readonly Grain[] { return this._grains; }
  get totalGrains(): number { return this._totalGrains; }
  get releasedCount(): number { return this._releasedCount; }
  get totalMs(): number { return this._totalMs; }

  setGeometry(geo: HourglassGeometry): void {
    this._geometry = geo;
  }

  /** Initialize grains for a timer duration */
  init(totalMs: number): void {
    this._grains = [];
    this._releasedCount = 0;
    this._lastReleaseTime = 0;
    this._elapsedMs = 0;

    if (!this._geometry) return;

    // Scale grains: 200 for short timers, up to 400 for longer ones
    this._totalMs = totalMs;
    this._totalGrains = Math.min(400, Math.max(200, Math.floor(totalMs / 500)));
    this._releaseInterval = totalMs / this._totalGrains;

    // Pre-create all grains, placed in top bulb
    const { neckLeft, neckRight, topCeilingY, neckTopY } = this._geometry;
    const centerX = (neckLeft + neckRight) / 2;
    const topHeight = neckTopY - topCeilingY;

    for (let i = 0; i < this._totalGrains; i++) {
      // Pack grains into top bulb, roughly filling from bottom to top
      const row = Math.floor(i / 20);
      const col = i % 20;
      const rowY = neckTopY - 12 - row * (GRAIN_RADIUS * 2.2);
      const rowWidth = this._getWidthAtY(rowY) * 0.8;
      const rowStartX = centerX - rowWidth / 2;
      const grainX = rowStartX + (col / 19) * rowWidth;

      this._grains.push({
        x: grainX + (Math.random() - 0.5) * 2,
        y: Math.min(rowY, topCeilingY + topHeight * 0.9) + (Math.random() - 0.5) * 2,
        vx: 0,
        vy: 0,
        radius: GRAIN_RADIUS + (Math.random() - 0.5) * 0.8,
        color: '',
        colorOffset: (Math.random() - 0.5) * 2, // -1 to 1
        settled: true,
        active: false,
      });
    }
  }

  /** Reset to empty state */
  reset(): void {
    this._grains = [];
    this._releasedCount = 0;
    this._lastReleaseTime = 0;
    this._elapsedMs = 0;
    this._totalGrains = 0;
  }

  /** Get width of hourglass at a given Y position */
  private _getWidthAtY(y: number): number {
    if (!this._geometry) return 0;
    const { neckLeft, neckRight, neckTopY, neckBottomY, topCeilingY, bottomFloorY } = this._geometry;
    const centerX = (neckLeft + neckRight) / 2;
    const neckWidth = neckRight - neckLeft;

    if (y >= neckTopY && y <= neckBottomY) return neckWidth;

    // Top bulb: widens from neck to top
    if (y < neckTopY) {
      const t = (neckTopY - y) / (neckTopY - topCeilingY);
      const maxWidth = (neckRight - neckLeft) + 120;
      return neckWidth + (maxWidth - neckWidth) * Math.sqrt(Math.min(1, t));
    }

    // Bottom bulb: widens from neck to bottom
    const t = (y - neckBottomY) / (bottomFloorY - neckBottomY);
    const maxWidth = (neckRight - neckLeft) + 120;
    return neckWidth + (maxWidth - neckWidth) * Math.sqrt(Math.min(1, t));
  }

  /** Update physics. dt in seconds, elapsedMs is total time elapsed on timer */
  update(dt: number, timerElapsedMs: number): void {
    if (!this._geometry || this._grains.length === 0) return;

    this._elapsedMs = timerElapsedMs;

    // Release grains based on elapsed time
    const targetReleased = Math.min(
      this._totalGrains,
      Math.floor(timerElapsedMs / this._releaseInterval)
    );

    while (this._releasedCount < targetReleased) {
      this._releaseNextGrain();
    }

    // Build spatial hash
    this._buildSpatialGrid();

    // Update active grains
    for (const grain of this._grains) {
      if (!grain.active || grain.settled) continue;
      this._updateGrain(grain, dt);
    }
  }

  /** Trigger explosion effect (alarm) — unsettle all bottom grains */
  explode(): void {
    for (const grain of this._grains) {
      if (grain.settled && grain.active) {
        grain.settled = false;
        grain.vy = -(200 + Math.random() * 300);
        grain.vx = (Math.random() - 0.5) * 200;
      }
    }
  }

  private _releaseNextGrain(): void {
    if (!this._geometry) return;

    // Find next inactive grain (from the bottom of the top pile)
    // Release from the ones closest to the neck first
    let best: Grain | null = null;
    let bestY = -Infinity;
    for (const g of this._grains) {
      if (!g.active && g.y > bestY) {
        bestY = g.y;
        best = g;
      }
    }

    if (best) {
      const { neckLeft, neckRight, neckTopY } = this._geometry;
      const centerX = (neckLeft + neckRight) / 2;
      // Position at neck entrance
      best.x = centerX + (Math.random() - 0.5) * (neckRight - neckLeft - best.radius * 2);
      best.y = neckTopY + 2;
      best.vx = (Math.random() - 0.5) * 10;
      best.vy = 20 + Math.random() * 30;
      best.active = true;
      best.settled = false;
    }

    this._releasedCount++;
  }

  private _buildSpatialGrid(): void {
    this._spatialGrid.clear();
    for (const g of this._grains) {
      if (!g.active) continue;
      const key = `${Math.floor(g.x / CELL_SIZE)},${Math.floor(g.y / CELL_SIZE)}`;
      if (!this._spatialGrid.has(key)) this._spatialGrid.set(key, []);
      this._spatialGrid.get(key)!.push(g);
    }
  }

  private _getNearby(g: Grain): Grain[] {
    const cx = Math.floor(g.x / CELL_SIZE);
    const cy = Math.floor(g.y / CELL_SIZE);
    const result: Grain[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this._spatialGrid.get(`${cx + dx},${cy + dy}`);
        if (cell) {
          for (const other of cell) {
            if (other !== g) result.push(other);
          }
        }
      }
    }
    return result;
  }

  private _updateGrain(g: Grain, dt: number): void {
    const geo = this._geometry!;

    // Apply gravity
    g.vy += GRAVITY * dt;

    // Apply horizontal friction
    g.vx *= FRICTION;

    // Integrate position
    g.x += g.vx * dt;
    g.y += g.vy * dt;

    // Wall collisions
    for (const wall of geo.walls) {
      this._collideWall(g, wall);
    }

    // Floor collision (bottom of hourglass)
    if (g.y + g.radius > geo.bottomFloorY) {
      g.y = geo.bottomFloorY - g.radius;
      g.vy *= -DAMPING;
      g.vx *= FRICTION;
    }

    // Ceiling collision (top of hourglass) — for explosion
    if (g.y - g.radius < geo.topCeilingY) {
      g.y = geo.topCeilingY + g.radius;
      g.vy *= -DAMPING;
    }

    // Grain-to-grain collisions
    const nearby = this._getNearby(g);
    for (const other of nearby) {
      const dx = other.x - g.x;
      const dy = other.y - g.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = g.radius + other.radius;

      if (dist < minDist && dist > 0.01) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        // Push apart
        const pushFactor = overlap * 0.5;
        if (!g.settled) {
          g.x -= nx * pushFactor;
          g.y -= ny * pushFactor;
        }
        if (!other.settled) {
          other.x += nx * pushFactor;
          other.y += ny * pushFactor;
        }

        // Dampen velocity
        if (!g.settled) {
          g.vx -= nx * overlap * 2;
          g.vy -= ny * overlap * 2;
        }
      }
    }

    // Settling check — only in bottom bulb
    if (g.y > geo.neckBottomY) {
      const speed = Math.sqrt(g.vx * g.vx + g.vy * g.vy);
      if (speed < SETTLE_THRESHOLD) {
        // Check if resting on floor or another settled grain
        const onFloor = g.y + g.radius >= geo.bottomFloorY - 1;
        let onGrain = false;
        for (const other of nearby) {
          if (other.settled && other.y > g.y) {
            const dy = other.y - g.y;
            const dx = other.x - g.x;
            if (Math.sqrt(dx * dx + dy * dy) < g.radius + other.radius + 1) {
              onGrain = true;
              break;
            }
          }
        }
        if (onFloor || onGrain) {
          g.settled = true;
          g.vx = 0;
          g.vy = 0;
        }
      }
    }
  }

  private _collideWall(g: Grain, wall: LineSegment): void {
    const { x1, y1, x2, y2 } = wall;

    // Closest point on line segment to grain center
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return;

    let t = ((g.x - x1) * dx + (g.y - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    const distX = g.x - closestX;
    const distY = g.y - closestY;
    const dist = Math.sqrt(distX * distX + distY * distY);

    if (dist < g.radius) {
      // Push out
      const nx = dist > 0 ? distX / dist : 0;
      const ny = dist > 0 ? distY / dist : -1;
      g.x = closestX + nx * g.radius;
      g.y = closestY + ny * g.radius;

      // Reflect velocity
      const dot = g.vx * nx + g.vy * ny;
      if (dot < 0) {
        g.vx -= 2 * dot * nx * DAMPING;
        g.vy -= 2 * dot * ny * DAMPING;
      }
    }
  }
}
