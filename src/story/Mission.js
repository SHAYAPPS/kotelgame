/**
 * Mission runner (pure logic, unit-tested).
 *
 * A mission is a list of steps. Entering a step runs its `do` actions; the step ends
 * when its `until` trigger fires, then the next step starts.
 *
 * Triggers (`until`):
 *   { reach: [x, z], radius }          player within radius (meters, horizontal)
 *   { talk: 'npcId' }                  player pressed E on that NPC
 *   { timer: seconds }                 time since the step started
 *   { enemiesDead: true }              no enemies left alive
 *   { dialogueDone: true }             subtitle queue finished
 *   { arrived: 'npcId' }               that NPC finished its route
 *   { action: 'sprint' | 'crouch' | 'magCheck' | 'move' }  player did it during this step
 *   { civiliansSheltered: true }       no civilian left outside the shelter
 *   { truckDestroyed: true } / { hasLauncher: true }   state of the final push
 *   { clear: [x, z], radius }          no hostile alive within radius of the point
 *   { all: [trigger, ...] } / { any: [trigger, ...] }
 *   (no until: the step ends immediately after its actions)
 *
 * Actions (`do`), each { type, ... } and applied through the context (`ctx`):
 *   objective { text, target: [x, y, z] | { npc } | { frozen, fallback } | null, counter },
 *   hint { hint | null },
 *   dialogue { lines, interrupt }, npc { id, spawn | place | route | face | talkable | idle },
 *   weapon { mode: 'lowered' | 'ready' }, sound { id }, ambience { crowd, birds },
 *   fade { to, time }, title { card }, endCard { card }, checkpoint { at: [x, y, z], yaw },
 *   populate { group }, sky { barrage }, civilians { do: 'panic' | 'runAll' },
 *   combat { squad: [ids], on, threat }, wave { wave: name in difficulty.js, callouts },
 *   sound { id, at }, crate { id, at: [x, z], yaw, launcher } (an ammo crate; `remove: true` takes it away),
 *   truck { delay }, arm { launcher }, slowmo { scale, time }, retreat { to: [spawn lists] },
 *   bounding { squad, to | off }, stats { hide }
 *
 * `jumpTo(i)` fast-forwards: it replays the state-setting actions of every earlier step
 * instantly (NPCs are placed where their routes end, timed/presentational actions are
 * skipped), then enters step i normally. Checkpoint restarts use the same mechanism.
 */
export class Mission {
  /**
   * @param {{ id: string, steps: object[] }} script
   * @param {object} ctx world API: see `apply()` and `_check()` for what it must provide
   */
  constructor(script, ctx) {
    this.script = script;
    this.steps = script.steps;
    this.ctx = ctx;
    this.index = -1;
    this.stepTime = 0;
    this.events = new Set();
    this.checkpointIndex = 0;
    this.finished = false;
    this.failed = null;
    const ids = new Set();
    for (const s of this.steps) {
      if (ids.has(s.id)) throw new Error(`Duplicate mission step id "${s.id}"`);
      ids.add(s.id);
    }
  }

  get step() {
    return this.steps[this.index] ?? null;
  }

  indexOf(id) {
    return this.steps.findIndex((s) => s.id === id);
  }

  start() {
    this.jumpTo(0);
  }

  /** Record a player/world event for `action` / `talk` triggers. */
  notify(event) {
    this.events.add(event);
  }

  /** Friendly fire etc.: the mission failed; the game restarts at the last checkpoint. */
  fail(reason) {
    if (this.failed) return;
    this.failed = reason;
  }

  restartFromCheckpoint() {
    this.jumpTo(this.checkpointIndex);
  }

  jumpTo(index) {
    const i = Math.max(0, Math.min(index, this.steps.length - 1));
    this.failed = null;
    this.finished = false;
    if (this.ctx.reset) this.ctx.reset();
    for (let k = 0; k < i; k++) {
      for (const a of this.steps[k].do ?? []) this.apply(a, true);
    }
    this._enter(i);
  }

  _enter(i) {
    this.index = i;
    this.stepTime = 0;
    this.events.clear();
    const step = this.steps[i];
    for (const a of step.do ?? []) this.apply(a, false);
  }

  update(dt) {
    if (this.finished || this.failed || this.index < 0) return;
    this.stepTime += dt;
    // Advance through as many steps as are already satisfied (actions-only steps chain).
    for (let guard = 0; guard < 16; guard++) {
      const step = this.step;
      if (!step.until || this._check(step.until)) {
        if (this.index >= this.steps.length - 1) {
          this.finished = true;
          return;
        }
        this._enter(this.index + 1);
      } else {
        return;
      }
    }
  }

  _check(t) {
    const c = this.ctx;
    if (t.all) return t.all.every((x) => this._check(x));
    if (t.any) return t.any.some((x) => this._check(x));
    if (t.reach) return c.playerDistance(t.reach[0], t.reach[1]) <= (t.radius ?? 3);
    if (t.talk) return this.events.has(`talk:${t.talk}`);
    if (t.timer !== undefined) return this.stepTime >= t.timer;
    if (t.enemiesDead) return c.enemiesAlive() === 0;
    if (t.dialogueDone) return c.dialogueIdle();
    if (t.arrived) return c.npcArrived(t.arrived);
    if (t.action) return this.events.has(`action:${t.action}`);
    if (t.civiliansSheltered) return c.civiliansOutside() === 0;
    if (t.truckDestroyed) return c.truckDestroyed();
    if (t.hasLauncher) return c.hasLauncher();
    if (t.clear) return c.hostilesNear(t.clear[0], t.clear[1], t.radius ?? 20) === 0;
    throw new Error(`Unknown trigger ${JSON.stringify(t)}`);
  }

  /** Apply one action. `fast`: fast-forward mode (state only, no presentation). */
  apply(a, fast) {
    const c = this.ctx;
    switch (a.type) {
      case 'objective':
        return c.objective(a.text ?? null, a.target ?? null, fast, a.counter ?? null);
      case 'hint':
        return fast ? c.hint(null) : c.hint(a.hint ?? null);
      case 'dialogue':
        return fast ? undefined : c.dialogue(a.lines, !!a.interrupt);
      case 'npc':
        return c.npc(a, fast);
      case 'populate':
        return c.populate(a.group);
      case 'weapon':
        return c.weapon(a.mode, fast);
      case 'sound':
        return fast ? undefined : c.sound(a.id, a.at ?? null);
      case 'sky':
        return c.sky(a.barrage ?? 0);
      case 'civilians':
        return c.civilians(a.do, fast);
      case 'combat':
        return c.combat(a, fast);
      case 'crate':
        return c.crate(a);
      case 'arm':
        return c.arm(a);
      case 'bounding':
        return c.bounding(a);
      case 'truck':
      case 'slowmo':
      case 'retreat':
      case 'stats':
        // Presentation or a fight: skipped when fast-forwarding past it.
        return fast ? undefined : c[a.type](a);
      case 'wave':
        // Fast-forwarding past a fight means it was won: nobody to spawn.
        return fast ? undefined : c.wave(a);
      case 'ambience':
        return c.ambience(a);
      case 'music':
        // A state (the mood carries over a fast-forward / checkpoint restart).
        return c.music?.(a.state ?? null);
      case 'fade':
        return fast ? undefined : c.fade(a.to, a.time ?? 1);
      case 'title':
        return fast ? undefined : c.title(a.card);
      case 'endCard':
        return fast ? undefined : c.endCard(a.card);
      case 'checkpoint':
        this.checkpointIndex = this.index >= 0 && !fast ? this.index : this._stepIndexOf(a);
        return c.checkpoint(a.at, a.yaw ?? 0, fast);
      default:
        throw new Error(`Unknown mission action "${a.type}"`);
    }
  }

  _stepIndexOf(action) {
    return Math.max(0, this.steps.findIndex((s) => (s.do ?? []).includes(action)));
  }
}
