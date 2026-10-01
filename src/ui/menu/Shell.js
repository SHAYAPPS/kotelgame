import { HE } from '../strings.he.js';
import { CreditsScreen } from './CreditsScreen.js';
import { LoadingScreen } from './LoadingScreen.js';
import { SettingsPanel } from './SettingsPanel.js';
import { button, el, focusFirst, listNav, segments } from './kit.js';
import './menu.css';

/**
 * The game around the mission (Hebrew, RTL): the loading screen, the main menu (Continue,
 * New Game, Settings, Credits, Quit in the desktop version), the pause menu (Resume, Restart
 * from the checkpoint, Settings, Quit to the main menu), settings and credits. Pure UI: Game
 * does what the buttons ask through the callbacks.
 */
export class Shell {
  /**
   * @param {HTMLElement} parent
   * @param {{ settings: object, bindings: object, onSetting: (key, value) => void,
   *   chapters: { label: string }[], save: () => ({ chapter: string } | null),
   *   onContinue: () => void, onNewGame: (chapter: number) => void, onResume: () => void,
   *   onRestart: () => void, onQuitToMenu: () => void, onQuit?: (() => void) | null }} o
   */
  constructor(parent, o) {
    this.o = o;
    this.root = el('div', 'shell');
    this.root.dir = 'rtl';
    parent.append(this.root);
    this.loading = new LoadingScreen(this.root);
    this.mode = 'loading'; // 'loading' | 'main' | 'pause' | 'hidden'
    this.panel = null; // the open panel: 'settings' | 'credits' | 'newGame' | 'confirm'

    this._buildMain();
    this._buildPause();
    this._buildNewGame();
    this._buildConfirm();
    this.settings = new SettingsPanel({ settings: o.settings, bindings: o.bindings, onChange: o.onSetting, onBack: () => this.closePanel() });
    this.root.append(this.settings.root);
    this.credits = new CreditsScreen(this.root, { onClose: () => this.closePanel() });

    // Esc: back out of a panel. (In the pause menu it can't resume: browsers only lock the
    // mouse on a click.)
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'loading' || this.mode === 'hidden' || this.settings.capturing) return;
      if (this.panel === 'credits') {
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') this.closePanel();
        else this.credits.key(e.code);
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape' && this.panel) {
        e.preventDefault();
        this.closePanel();
      }
    });
  }

  get visible() {
    return this.mode !== 'hidden';
  }

  // ---------------------------------------------------------------------------

  _buildMain() {
    const M = HE.menu;
    const s = el('div', 'menu-screen menu-main');
    s.hidden = true;
    // Black between the background's camera shots (under the menu).
    this.fade = el('div', 'menu-fade');
    s.append(this.fade);
    const brand = el('div', 'menu-brand');
    brand.append(el('p', 'menu-eyebrow', HE.missionName), el('h1', 'menu-title', HE.gameTitle));
    const list = el('nav', 'menu-list');
    this.continueBtn = button(M.continue, 'menu-item', () => this.o.onContinue());
    this.continueSub = el('small');
    this.continueBtn.append(this.continueSub);
    list.append(
      this.continueBtn,
      button(M.newGame, 'menu-item', () => (this.o.save() ? this.confirm(M.overwrite, () => this.openPanel('newGame')) : this.openPanel('newGame'))),
      button(M.settings, 'menu-item', () => this.openPanel('settings')),
      button(M.credits, 'menu-item', () => this.openPanel('credits')),
    );
    // Quit: only where there is something to quit to (the desktop version).
    if (this.o.onQuit) list.append(button(M.quit, 'menu-item', () => this.o.onQuit()));
    listNav(list);
    this.mainError = el('p', 'menu-error');
    this.mainError.hidden = true;
    s.append(brand, list, this.mainError, el('div', 'menu-footer', M.hint));
    this.root.append(s);
    this.main = s;
    this.mainList = list;
  }

  _buildPause() {
    const P = HE.pause;
    const s = el('div', 'menu-screen menu-pause');
    s.hidden = true;
    this.pauseTitle = el('h1', 'menu-title', P.title);
    const brand = el('div', 'menu-brand');
    brand.append(el('p', 'menu-eyebrow', HE.missionName), this.pauseTitle);
    const list = el('nav', 'menu-list');
    this.resumeBtn = button(P.resume, 'menu-item', () => this.o.onResume());
    this.restartBtn = button(P.restart, 'menu-item', () => this.confirm(P.confirmRestart, () => this.o.onRestart()));
    list.append(
      this.resumeBtn,
      this.restartBtn,
      button(P.settings, 'menu-item', () => this.openPanel('settings')),
      button(P.quitToMenu, 'menu-item', () => this.confirm(P.confirmQuit, () => this.o.onQuitToMenu())),
    );
    listNav(list);
    this.pauseError = el('p', 'menu-error');
    this.pauseError.hidden = true;
    s.append(brand, list, this.pauseError, el('div', 'menu-footer', HE.menu.hint));
    this.root.append(s);
    this.pause = s;
    this.pauseList = list;
  }

  _buildNewGame() {
    const M = HE.menu;
    const p = el('div', 'menu-panel');
    p.hidden = true;
    p.append(el('h2', null, M.newGameTitle));
    const body = el('div', 'menu-panel-body');
    const S = HE.settings;
    this.ngHint = el('p');
    this.ngDifficulty = segments(['easy', 'normal', 'hard'].map((id) => ({ id, label: S.difficultyLevels[id] })), this.o.settings.difficulty, (v) => {
      this.ngHint.textContent = S.difficultyHint[v];
      this.o.onSetting('difficulty', v);
    });
    body.append(el('h3', null, M.difficulty), this.ngDifficulty, this.ngHint);
    const start = button(M.startFromTop, 'menu-button primary', () => this.o.onNewGame(null));
    const startRow = el('div', 'menu-panel-actions');
    startRow.append(start);
    body.append(startRow);
    if (this.o.chapters.length) {
      body.append(el('h3', null, M.chapters));
      const list = el('div', 'menu-chapters');
      this.o.chapters.forEach((c, i) => list.append(button(c.label, 'menu-button', () => this.o.onNewGame(i))));
      body.append(list);
    }
    p.append(body);
    const actions = el('div', 'menu-panel-actions');
    actions.append(button(M.back, 'menu-button', () => this.closePanel()));
    p.append(actions);
    this.root.append(p);
    this.newGame = p;
    this.newGameStart = start;
  }

  _buildConfirm() {
    const M = HE.menu;
    const p = el('div', 'menu-panel small');
    p.hidden = true;
    this.confirmText = el('p');
    const actions = el('div', 'menu-panel-actions');
    this.confirmYes = button(M.yes, 'menu-button primary', () => {
      const fn = this._confirmFn;
      this.closePanel();
      fn?.();
    });
    actions.append(this.confirmYes, button(M.no, 'menu-button', () => this.closePanel()));
    p.append(this.confirmText, actions);
    this.root.append(p);
    this.confirmPanel = p;
  }

  // ---------------------------------------------------------------------------

  setProgress(p) {
    this.loading.setProgress(p);
  }

  /** Loading done: "click to continue", then `onContinue` (a user gesture: unlock the sound there). */
  loaded(onContinue) {
    this.loading.ready(() => {
      if (this.mode !== 'loading') return; // already playing (dev: automated checks)
      this.loading.hide();
      onContinue();
    });
  }

  /** The background's fade to black between camera shots (0..1). */
  setFade(v) {
    const o = Math.round(v * 50) / 50;
    if (o === this._fadeV) return;
    this._fadeV = o;
    this.fade.style.opacity = String(o);
  }

  showMain() {
    this.loading.hide();
    this._closeAll();
    this.mode = 'main';
    this.root.hidden = false;
    this.main.hidden = false;
    this.pause.hidden = true;
    this.mainError.hidden = true;
    const save = this.o.save();
    this.continueBtn.disabled = !save;
    this.continueSub.textContent = save?.chapter ? HE.menu.continueFrom(save.chapter) : '';
    this.continueSub.hidden = !save?.chapter;
    focusFirst(this.mainList);
  }

  /** @param {{ done?: boolean }} o done: the mission is over (no checkpoint to go back to) */
  showPause({ done = false } = {}) {
    this._closeAll();
    this.mode = 'pause';
    this.root.hidden = false;
    this.pause.hidden = false;
    this.main.hidden = true;
    this.pauseError.hidden = true;
    this.pauseTitle.textContent = done ? HE.pause.missionDone : HE.pause.title;
    this.restartBtn.hidden = done;
    focusFirst(this.pauseList);
  }

  hide() {
    this._closeAll();
    this.mode = 'hidden';
    this.loading.hide();
    this.root.hidden = true;
  }

  /** A message under the open menu (e.g. the mouse could not be locked). */
  showError(text) {
    const e = this.mode === 'pause' ? this.pauseError : this.mainError;
    e.textContent = text;
    e.hidden = false;
  }

  confirm(text, onYes) {
    this._closeAll();
    this.confirmText.textContent = text;
    this._confirmFn = onYes;
    this.panel = 'confirm';
    this._listHidden(true);
    this.confirmPanel.hidden = false;
    this.confirmYes.focus({ preventScroll: true });
  }

  openPanel(name) {
    this._closeAll();
    this.panel = name;
    this._listHidden(true);
    if (name === 'settings') this.settings.open();
    else if (name === 'credits') this.credits.open();
    else if (name === 'newGame') {
      this.ngDifficulty.set(this.o.settings.difficulty);
      this.ngHint.textContent = HE.settings.difficultyHint[this.o.settings.difficulty];
      this.newGame.hidden = false;
      this.newGameStart.focus({ preventScroll: true });
    }
  }

  closePanel() {
    this._closeAll();
    this._listHidden(false);
    focusFirst(this.mode === 'pause' ? this.pauseList : this.mainList);
  }

  _closeAll() {
    this.settings.close();
    this.credits.close();
    this.newGame.hidden = true;
    this.confirmPanel.hidden = true;
    this.panel = null;
    for (const s of [this.main, this.pause]) for (const c of s.children) c.style.visibility = '';
  }

  /** The menu column hides behind an open panel (the panel sits in its place). */
  _listHidden(hidden) {
    const s = this.mode === 'pause' ? this.pause : this.main;
    for (const c of s.children) if (c !== this.fade) c.style.visibility = hidden ? 'hidden' : '';
  }
}
