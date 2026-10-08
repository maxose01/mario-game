'use strict';
// Loads the game's pure simulation scripts (no rendering) into a Node vm context, exactly as the
// browser would run them, so tests can drive real tracks, karts, items and bots headlessly.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_FILES = ['config', 'util', 'parts', 'tracks', 'track', 'kart', 'items', 'ai', 'race'];

function loadGame(files = SIM_FILES) {
  const root = path.join(__dirname, '..');
  const ctx = vm.createContext({ console, Math, JSON, Date, performance: { now: () => Date.now() } });
  for (const f of files) {
    const file = path.join(root, 'js', f + '.js');
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f + '.js' });
  }
  return (expr) => vm.runInContext(expr, ctx);
}

module.exports = { loadGame };
