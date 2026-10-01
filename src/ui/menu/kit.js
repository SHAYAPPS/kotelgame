// Small DOM helpers shared by the menus.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function button(text, className = 'menu-item', onClick = null) {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/**
 * Up / down arrows move the focus through a list of buttons (wrapping), as in a console menu.
 * Hovering a button focuses it too, so the mouse and the keys share one highlight.
 */
export function listNav(container) {
  container.addEventListener('keydown', (e) => {
    if (e.code !== 'ArrowDown' && e.code !== 'ArrowUp') return;
    const items = [...container.querySelectorAll('button:not([hidden]):not(:disabled)')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.code === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[i < 0 ? 0 : next].focus();
  });
  container.addEventListener('mouseover', (e) => {
    const b = e.target.closest?.('button');
    if (b && container.contains(b) && !b.disabled) b.focus({ preventScroll: true });
  });
}

/** Focus the first visible, enabled button in `container`. */
export function focusFirst(container) {
  const b = container.querySelector('button:not([hidden]):not(:disabled)');
  b?.focus({ preventScroll: true });
}

/** A two-way switch (on / off) as a button with role="switch". */
export function toggle(value, labels, onChange) {
  const b = el('button', 'menu-switch');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  const set = (v) => {
    b.setAttribute('aria-checked', String(v));
    b.textContent = v ? labels.on : labels.off;
  };
  set(value);
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    set(v);
    onChange(v);
  });
  b.set = set;
  return b;
}

/** Segmented choice: options [{ id, label }], one checked. */
export function segments(options, value, onChange) {
  const group = el('div', 'menu-segments');
  group.setAttribute('role', 'radiogroup');
  const buttons = options.map((o) => {
    const b = el('button', 'menu-segment', o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.id = o.id;
    b.addEventListener('click', () => {
      group.set(o.id);
      onChange(o.id);
    });
    group.append(b);
    return b;
  });
  group.set = (id) => {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.id === id));
  };
  group.set(value);
  return group;
}

/** A slider with its value shown: format(v) -> text. */
export function slider({ min, max, step, value, format, onInput }) {
  const wrap = el('div', 'menu-slider');
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('output', null, format(value));
  out.dir = 'ltr';
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  wrap.append(input, out);
  wrap.set = (v) => {
    input.value = String(v);
    out.textContent = format(v);
  };
  return wrap;
}

/** A labeled settings row: the label at the start (right, in RTL), the control at the end. */
export function row(label, control, hint = null) {
  const r = el('div', 'menu-row');
  const l = el('div', 'menu-row-label', label);
  if (hint) l.append(el('small', null, hint));
  r.append(l, control);
  return r;
}
