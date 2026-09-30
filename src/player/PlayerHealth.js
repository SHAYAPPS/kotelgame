// Call of Duty style regenerating health (pure logic, unit-tested).

export const HEALTH = {
  max: 100,
  regenDelay: 4.5, // seconds out of fire before health comes back
  regenRate: 45, // per second once regenerating
  indicatorTime: 1.6, // how long a hit direction indicator stays
  maxIndicators: 6,
};

export class PlayerHealth {
  constructor(config = HEALTH) {
    this.cfg = config;
    this.reset();
  }

  reset() {
    this.health = this.cfg.max;
    this.sinceHit = Infinity;
    this.dead = false;
    this.lastHitAmount = 0;
    this.hitFlash = 0; // 1 on a hit, decays; drives the screen flash
    /** @type {{ x: number, z: number, age: number }[]} source positions of recent hits */
    this.indicators = [];
  }

  /** 0 = unhurt, 1 = about to die. */
  get hurt() {
    return 1 - this.health / this.cfg.max;
  }

  /** @param {number} amount @param {{x: number, z: number}} [from] where the shot came from */
  damage(amount, from) {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.sinceHit = 0;
    this.lastHitAmount = amount;
    this.hitFlash = 1;
    if (from) {
      if (this.indicators.length >= this.cfg.maxIndicators) this.indicators.shift();
      this.indicators.push({ x: from.x, z: from.z, age: 0 });
    }
    if (this.health <= 0) this.dead = true;
  }

  update(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    for (const ind of this.indicators) ind.age += dt;
    while (this.indicators.length && this.indicators[0].age > this.cfg.indicatorTime) this.indicators.shift();
    if (this.dead) return;
    this.sinceHit += dt;
    if (this.sinceHit >= this.cfg.regenDelay && this.health < this.cfg.max) {
      this.health = Math.min(this.cfg.max, this.health + this.cfg.regenRate * dt);
    }
  }
}
