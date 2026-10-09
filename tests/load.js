'use strict';
// Loads the game's pure simulation scripts (no rendering) into a Node vm context, exactly as the
// browser would run them, so tests can drive real tracks, karts, items and bots headlessly.
// The course files are taken from index.html, in page order (= difficulty order), so a new
// course is raced by the tests as soon as the big screen loads it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function courseFiles() {
  try {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const list = [...html.matchAll(/<script src="js\/(courses\/[\w-]+)\.js"/g)].map((m) => m[1]);
    if (list.length) return list;
  } catch (e) {
    /* fall back to the folder */
  }
  return fs.readdirSync(path.join(root, 'js', 'courses')).filter((f) => f.endsWith('.js')).sort().map((f) => 'courses/' + f.slice(0, -3));
}

const SIM_FILES = ['config', 'util', 'parts', 'tracks', ...courseFiles(), 'track', 'kart', 'items', 'ai', 'race', 'haptics'];

function loadGame(files = SIM_FILES) {
  const ctx = vm.createContext({ console, Math, JSON, Date, performance: { now: () => Date.now() } });
  for (const f of files) {
    const file = path.join(root, 'js', f + '.js');
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f + '.js' });
  }
  return (expr) => vm.runInContext(expr, ctx);
}

module.exports = { loadGame, SIM_FILES };
