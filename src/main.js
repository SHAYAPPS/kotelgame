import './style.css';
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) window.__game = game;
game.init().catch((e) => console.error('The game failed to start.', e));
