import './ui.css';

const RING = 90; // px from the crosshair

/**
 * Enemy grenade close by: a pulsing grenade icon on a ring around the crosshair, on the
 * side it lies (straight up = in front of you), with a small arrow pointing to it.
 */
export class GrenadeWarning {
  constructor(parent) {
    this.root = document.createElement('div');
    this.root.className = 'grenade-warning';
    this.root.hidden = true;
    this.icons = [];
    for (let i = 0; i < 3; i++) {
      const icon = document.createElement('div');
      icon.className = 'icon';
      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      icon.hidden = arrow.hidden = true;
      this.root.append(icon, arrow);
      this.icons.push({ icon, arrow });
    }
    parent.append(this.root);
  }

  /**
   * @param {{ position: import('three').Vector3 }[]} grenades live enemy grenades
   * @param {import('three').Vector3} playerPos
   * @param {number} viewYaw
   * @param {number} range show grenades this close (meters)
   */
  update(grenades, playerPos, viewYaw, range = 9) {
    let n = 0;
    for (const g of grenades) {
      if (n >= this.icons.length) break;
      const dx = g.position.x - playerPos.x;
      const dz = g.position.z - playerPos.z;
      if (Math.hypot(dx, dz) > range) continue;
      // Bearing relative to where you look: 0 = straight ahead (up on screen).
      const rel = Math.atan2(-dx, -dz) - viewYaw;
      const sx = -Math.sin(rel);
      const sy = -Math.cos(rel);
      const { icon, arrow } = this.icons[n++];
      icon.hidden = arrow.hidden = false;
      icon.style.transform = `translate(${sx * RING}px, ${sy * RING}px)`;
      arrow.style.transform = `translate(${sx * (RING + 28)}px, ${sy * (RING + 28)}px) rotate(${Math.atan2(sx, -sy)}rad)`;
    }
    for (let i = n; i < this.icons.length; i++) this.icons[i].icon.hidden = this.icons[i].arrow.hidden = true;
    this.root.hidden = n === 0;
  }
}
