import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleSystem } from '../ParticleSystem';

/** Create a simple hourglass geometry for testing */
function createTestGeometry() {
  return {
    walls: [
      // Simple left wall
      { x1: 50, y1: 0, x2: 100, y2: 200 },
      { x1: 100, y1: 200, x2: 50, y2: 400 },
      // Simple right wall
      { x1: 350, y1: 0, x2: 300, y2: 200 },
      { x1: 300, y1: 200, x2: 350, y2: 400 },
    ],
    neckLeft: 180,
    neckRight: 220,
    neckTopY: 190,
    neckBottomY: 210,
    bottomFloorY: 390,
    topCeilingY: 10,
  };
}

describe('ParticleSystem', () => {
  let ps: ParticleSystem;
  const geo = createTestGeometry();

  beforeEach(() => {
    ps = new ParticleSystem();
    ps.setGeometry(geo);
  });

  describe('init', () => {
    it('creates grains for a given duration', () => {
      ps.init(60000); // 60s
      expect(ps.grains.length).toBeGreaterThan(0);
      expect(ps.totalGrains).toBe(ps.grains.length);
    });

    it('scales grain count: 200 minimum for short timers', () => {
      ps.init(1000); // 1s
      expect(ps.totalGrains).toBe(200);
    });

    it('scales grain count: caps at 400 for long timers', () => {
      ps.init(600000); // 10 minutes
      expect(ps.totalGrains).toBe(400);
    });

    it('scales grain count proportionally in the middle', () => {
      ps.init(150000); // 150s = 300 grains (150000/500 = 300)
      expect(ps.totalGrains).toBe(300);
    });

    it('all grains start inactive and settled', () => {
      ps.init(60000);
      for (const grain of ps.grains) {
        expect(grain.active).toBe(false);
        expect(grain.settled).toBe(true);
      }
    });

    it('all grains positioned in top bulb (above neck)', () => {
      ps.init(60000);
      for (const grain of ps.grains) {
        expect(grain.y).toBeLessThanOrEqual(geo.neckTopY);
      }
    });

    it('assigns each grain a colorOffset in [-1, 1] range', () => {
      ps.init(60000);
      for (const grain of ps.grains) {
        expect(grain.colorOffset).toBeGreaterThanOrEqual(-1);
        expect(grain.colorOffset).toBeLessThanOrEqual(1);
      }
    });

    it('produces varied colorOffset values across grains', () => {
      ps.init(60000);
      const offsets = new Set(ps.grains.map(g => g.colorOffset));
      // With 200+ grains using Math.random(), we should get many unique values
      expect(offsets.size).toBeGreaterThan(100);
    });

    it('colorOffset is stable — does not change during physics updates', () => {
      ps.init(60000);
      const initialOffsets = ps.grains.map(g => g.colorOffset);

      // Run physics for a while
      for (let t = 0; t < 5000; t += 16) {
        ps.update(0.016, t);
      }

      // colorOffset should be unchanged
      ps.grains.forEach((grain, i) => {
        expect(grain.colorOffset).toBe(initialOffsets[i]);
      });
    });

    it('does nothing without geometry', () => {
      const ps2 = new ParticleSystem();
      ps2.init(60000);
      expect(ps2.grains.length).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all grains', () => {
      ps.init(60000);
      expect(ps.grains.length).toBeGreaterThan(0);
      ps.reset();
      expect(ps.grains.length).toBe(0);
      expect(ps.totalGrains).toBe(0);
      expect(ps.releasedCount).toBe(0);
    });
  });

  describe('update — grain release', () => {
    it('releases grains proportional to elapsed time', () => {
      ps.init(60000); // 60s, ~200 grains, interval = 60000/200 = 300ms
      const totalGrains = ps.totalGrains;
      const interval = 60000 / totalGrains;

      // After 1 interval, 1 grain should be released
      ps.update(interval / 1000, interval);
      expect(ps.releasedCount).toBe(1);

      // After half the total time, ~half the grains released
      ps.update(0.016, 30000);
      expect(ps.releasedCount).toBe(Math.floor(30000 / interval));
    });

    it('releases all grains by end of timer', () => {
      ps.init(60000);
      ps.update(0.016, 60000);
      expect(ps.releasedCount).toBe(ps.totalGrains);
    });

    it('released grains become active', () => {
      ps.init(60000);
      ps.update(0.016, 1000);
      const activeGrains = ps.grains.filter(g => g.active);
      expect(activeGrains.length).toBeGreaterThan(0);
      expect(activeGrains.length).toBe(ps.releasedCount);
    });
  });

  describe('update — physics', () => {
    it('applies gravity to active unsettled grains', () => {
      ps.init(60000);
      // Release some grains
      ps.update(0.016, 1000);

      const activeGrain = ps.grains.find(g => g.active && !g.settled);
      if (activeGrain) {
        const prevVy = activeGrain.vy;
        ps.update(0.016, 1016);
        // vy should increase due to gravity (600 * 0.016 = 9.6)
        expect(activeGrain.vy).toBeGreaterThan(prevVy);
      }
    });

    it('constrains grains within floor boundary', () => {
      ps.init(60000);
      // Release and simulate for a while
      for (let t = 0; t < 5000; t += 16) {
        ps.update(0.016, t);
      }

      for (const grain of ps.grains) {
        if (grain.active) {
          // Allow small overshoot due to discrete time stepping in physics sim
          expect(grain.y + grain.radius).toBeLessThanOrEqual(geo.bottomFloorY + 5);
        }
      }
    });

    it('constrains grains above ceiling', () => {
      ps.init(60000);
      // Release some grains and run
      ps.update(0.016, 5000);
      // Explode to push grains upward
      ps.explode();
      for (let i = 0; i < 100; i++) {
        ps.update(0.016, 5000 + i * 16);
      }

      for (const grain of ps.grains) {
        if (grain.active) {
          expect(grain.y - grain.radius).toBeGreaterThanOrEqual(geo.topCeilingY - 1);
        }
      }
    });
  });

  describe('explode', () => {
    it('unsettles all settled active grains', () => {
      ps.init(60000);
      // Release and let grains settle
      for (let t = 0; t < 60000; t += 16) {
        ps.update(0.016, Math.min(t, 60000));
      }

      // Some grains should be settled now
      const settledBefore = ps.grains.filter(g => g.active && g.settled).length;
      expect(settledBefore).toBeGreaterThan(0);

      ps.explode();

      // After explode, no active grains should be settled
      const settledAfter = ps.grains.filter(g => g.active && g.settled).length;
      expect(settledAfter).toBe(0);
    });

    it('gives upward velocity to exploded grains', () => {
      ps.init(60000);
      for (let t = 0; t < 60000; t += 16) {
        ps.update(0.016, Math.min(t, 60000));
      }

      ps.explode();
      const activeGrains = ps.grains.filter(g => g.active);
      const hasUpwardVelocity = activeGrains.some(g => g.vy < 0);
      expect(hasUpwardVelocity).toBe(true);
    });
  });

  describe('does nothing with empty state', () => {
    it('update with no geometry does nothing', () => {
      const ps2 = new ParticleSystem();
      ps2.update(0.016, 1000); // Should not throw
    });

    it('update with no grains does nothing', () => {
      ps.update(0.016, 1000); // No init called
    });
  });
});
