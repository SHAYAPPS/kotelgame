import './style.css';
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.start();

// Handy for debugging from the browser console during development.
if (import.meta.env.DEV) window.__game = game;
