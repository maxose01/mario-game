'use strict';
// Global constants and live-tweakable gameplay parameters.
// Everything in CFG is read every frame, so the Edit Panel can change it in real time.
// This file is shared by the big screen, the phone controller and the Node tests.

const VIEW_W = 960; // logical HUD resolution; the 3D view renders at the real screen size
const VIEW_H = 540;
const MAX_PLAYERS = 4;
const STEP = 1 / 60; // fixed simulation step in seconds

// Each group becomes a collapsible section in the Edit Panel.
// Numbers: {key, label, min, max, step, def, hint}; booleans: {key, label, type:'bool', def}.
const PARAM_SCHEMA = [
  {
    group: 'Kart handling',
    items: [
      { key: 'topSpeed', label: 'Top speed', min: 8, max: 60, step: 0.5, def: 27, hint: 'units/s at 150cc' },
      { key: 'accel', label: 'Acceleration', min: 2, max: 60, step: 0.5, def: 15 },
      { key: 'brakeDecel', label: 'Brake strength', min: 5, max: 90, step: 1, def: 34 },
      { key: 'reverseSpeed', label: 'Reverse speed', min: 1, max: 20, step: 0.5, def: 8 },
      { key: 'coastDecel', label: 'Coasting slowdown', min: 0, max: 30, step: 0.5, def: 7 },
      { key: 'steerRate', label: 'Steering rate', min: 0.5, max: 5, step: 0.05, def: 2.05, hint: 'rad/s at full lock' },
      { key: 'steerResponse', label: 'Steering response', min: 1, max: 40, step: 0.5, def: 11, hint: 'how fast the wheel turns' },
      { key: 'grip', label: 'Tyre grip', min: 0.5, max: 30, step: 0.1, def: 9 },
      { key: 'offroadSpeed', label: 'Off-road speed', min: 0.1, max: 1, step: 0.01, def: 0.52, hint: 'fraction of top speed' },
      { key: 'wallBounce', label: 'Wall bounce', min: 0, max: 1.5, step: 0.05, def: 0.55 },
      { key: 'wallSpeedLoss', label: 'Wall speed loss', min: 0, max: 1, step: 0.05, def: 0.35 },
      { key: 'bumpForce', label: 'Kart bump force', min: 0, max: 30, step: 0.5, def: 9 },
    ],
  },
  {
    group: 'Drift & boost',
    items: [
      { key: 'hopVelocity', label: 'Hop height', min: 0, max: 12, step: 0.1, def: 4.2 },
      { key: 'driftTurn', label: 'Drift turn rate', min: 0.2, max: 3, step: 0.05, def: 0.8, hint: 'x steering rate' },
      { key: 'driftSteerRange', label: 'Drift steering range', min: 0, max: 1.5, step: 0.05, def: 0.62 },
      { key: 'driftSlide', label: 'Drift slide', min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: 'driftMinSpeed', label: 'Min drift speed', min: 0, max: 30, step: 0.5, def: 9 },
      { key: 'driftCharge1', label: 'Blue spark time', min: 0.1, max: 4, step: 0.05, def: 0.85, hint: 's' },
      { key: 'driftCharge2', label: 'Orange spark time', min: 0.2, max: 6, step: 0.05, def: 1.8 },
      { key: 'driftCharge3', label: 'Purple spark time', min: 0.3, max: 8, step: 0.05, def: 3.0 },
      { key: 'miniTurbo1', label: 'Blue mini-turbo', min: 0, max: 3, step: 0.05, def: 0.55, hint: 's of boost' },
      { key: 'miniTurbo2', label: 'Orange super turbo', min: 0, max: 4, step: 0.05, def: 1.0 },
      { key: 'miniTurbo3', label: 'Purple ultra turbo', min: 0, max: 5, step: 0.05, def: 1.6 },
      { key: 'boostSpeed', label: 'Boost top speed', min: 1, max: 2.5, step: 0.01, def: 1.34, hint: 'x top speed' },
      { key: 'boostAccel', label: 'Boost acceleration', min: 5, max: 150, step: 1, def: 55 },
      { key: 'mushroomTime', label: 'Mushroom boost', min: 0.2, max: 5, step: 0.05, def: 1.35, hint: 's' },
      { key: 'padBoostTime', label: 'Boost pad', min: 0.1, max: 4, step: 0.05, def: 1.0, hint: 's' },
      { key: 'trickBoostTime', label: 'Ramp trick boost', min: 0, max: 3, step: 0.05, def: 0.75, hint: 's' },
      { key: 'startBoostTime', label: 'Rocket start boost', min: 0, max: 4, step: 0.05, def: 1.2, hint: 's' },
      { key: 'coinSpeedBonus', label: 'Speed per coin', min: 0, max: 0.05, step: 0.001, def: 0.01, hint: 'x top speed, max 10 coins' },
    ],
  },
  {
    group: 'Air & track',
    items: [
      { key: 'gravity', label: 'Gravity', min: 4, max: 90, step: 1, def: 34 },
      { key: 'rampLaunch', label: 'Ramp launch', min: 0, max: 3, step: 0.05, def: 1.35 },
      { key: 'airSteer', label: 'Air steering', min: 0, max: 1.5, step: 0.05, def: 0.45 },
      { key: 'iceGrip', label: 'Ice grip', min: 0.02, max: 1, step: 0.01, def: 0.16, hint: 'x tyre grip on ice' },
      { key: 'respawnTime', label: 'Rescue time after a fall', min: 0.3, max: 5, step: 0.1, def: 1.5, hint: 's' },
      { key: 'stomperPeriod', label: 'Stomper cycle', min: 1, max: 8, step: 0.1, def: 3.2, hint: 's' },
      { key: 'gateOpenTime', label: 'Key gate stays open', min: 0.5, max: 10, step: 0.1, def: 2.6, hint: 's' },
      { key: 'keyRespawn', label: 'Key respawn', min: 1, max: 60, step: 1, def: 9, hint: 's after pickup' },
      { key: 'glideGravity', label: 'Glider gravity', min: 2, max: 40, step: 0.5, def: 11 },
      { key: 'glideSink', label: 'Glider max sink', min: 1, max: 20, step: 0.1, def: 6.5, hint: 'units/s' },
      { key: 'glideSteer', label: 'Glider steering', min: 0, max: 2, step: 0.05, def: 0.85, hint: 'x steering rate' },
      { key: 'glideLaunch', label: 'Glide ramp launch', min: 0.5, max: 3, step: 0.05, def: 1.6, hint: 'x ramp launch' },
      { key: 'glideDive', label: 'Glider landing dive', min: 1, max: 5, step: 0.1, def: 2.5, hint: 'x max sink once over road again' },
      { key: 'ringBoostTime', label: 'Boost ring', min: 0, max: 3, step: 0.05, def: 1.0, hint: 's' },
      { key: 'spinBoostTime', label: 'Anti-gravity spin boost', min: 0, max: 2, step: 0.05, def: 0.6, hint: 's' },
      { key: 'currentScale', label: 'Water current strength', min: 0, max: 3, step: 0.05, def: 1 },
      { key: 'hazardSpeed', label: 'Moving hazard speed', min: 0, max: 3, step: 0.05, def: 1 },
    ],
  },
  {
    group: 'Items',
    items: [
      { key: 'itemBoxRespawn', label: 'Item box respawn', min: 0.2, max: 15, step: 0.1, def: 2.2, hint: 's' },
      { key: 'rouletteTime', label: 'Item roulette', min: 0, max: 4, step: 0.05, def: 1.1, hint: 's' },
      { key: 'itemLuck', label: 'Catch-up luck', min: 0, max: 2, step: 0.05, def: 1, hint: 'better items further back' },
      { key: 'shellSpeed', label: 'Shell speed', min: 10, max: 120, step: 1, def: 48 },
      { key: 'redShellTurn', label: 'Red shell homing', min: 0, max: 12, step: 0.1, def: 3.6, hint: 'rad/s' },
      { key: 'shellLife', label: 'Shell lifetime', min: 1, max: 30, step: 0.5, def: 9, hint: 's' },
      { key: 'shellBounces', label: 'Green shell bounces', min: 0, max: 20, step: 1, def: 5 },
      { key: 'spinOutTime', label: 'Spin-out time', min: 0.2, max: 4, step: 0.05, def: 1.15, hint: 's' },
      { key: 'bananaSpinTime', label: 'Banana slip time', min: 0.2, max: 4, step: 0.05, def: 0.85, hint: 's' },
      { key: 'bombFuse', label: 'Clay bomb fuse', min: 0.3, max: 8, step: 0.1, def: 2.2, hint: 's' },
      { key: 'bombRadius', label: 'Clay bomb blast', min: 1, max: 25, step: 0.5, def: 7.5 },
      { key: 'starTime', label: 'Star power', min: 1, max: 20, step: 0.5, def: 7, hint: 's' },
      { key: 'starSpeed', label: 'Star speed', min: 1, max: 2, step: 0.01, def: 1.18, hint: 'x top speed' },
    ],
  },
  {
    group: 'Bots',
    items: [
      { key: 'botSkill', label: 'Bot pace', min: 0.5, max: 1.3, step: 0.01, def: 0.93, hint: 'x their top speed' },
      { key: 'botCornering', label: 'Bot cornering', min: 0.2, max: 2, step: 0.05, def: 1 },
      { key: 'rubberBand', label: 'Rubber band', min: 0, max: 0.4, step: 0.01, def: 0.09, hint: 'catch-up / slow-down' },
      { key: 'botItemRate', label: 'Item use eagerness', min: 0, max: 3, step: 0.05, def: 1 },
      { key: 'botAggression', label: 'Aggression', min: 0, max: 1, step: 0.05, def: 0.6 },
      { key: 'botKeyHunt', label: 'Key hunting', min: 0, max: 1, step: 0.05, def: 0.45, hint: 'chance to chase a key' },
      { key: 'botDrift', label: 'Bots drift', type: 'bool', def: true },
      { key: 'staffGhost', label: 'Staff ghost when racing alone', type: 'bool', def: true },
    ],
  },
  {
    group: 'Camera',
    items: [
      { key: 'camDist', label: 'Distance', min: 2, max: 20, step: 0.1, def: 6.6 },
      { key: 'camHeight', label: 'Height', min: 0.5, max: 12, step: 0.1, def: 2.7 },
      { key: 'camLook', label: 'Look-ahead', min: 0, max: 15, step: 0.1, def: 3.6 },
      { key: 'camFov', label: 'Field of view', min: 30, max: 110, step: 1, def: 66 },
      { key: 'camBoostFov', label: 'Boost FOV kick', min: 0, max: 30, step: 1, def: 9 },
      { key: 'camLag', label: 'Follow smoothing', min: 1, max: 30, step: 0.5, def: 9 },
      { key: 'camYawLag', label: 'Turn smoothing', min: 1, max: 30, step: 0.5, def: 7 },
      { key: 'camShake', label: 'Screen shake', min: 0, max: 3, step: 0.1, def: 1 },
      { key: 'camRoll', label: 'Lean with banked roads', min: 0, max: 1.5, step: 0.05, def: 1, hint: '0 = keep the horizon level' },
      { key: 'speedLines', label: 'Boost speed lines', min: 0, max: 2, step: 0.05, def: 1 },
      { key: 'splitStacked', label: '2-player split: stacked', type: 'bool', def: false },
    ],
  },
  {
    group: 'Clay look',
    items: [
      { key: 'boilFps', label: 'Stop-motion rate', min: 1, max: 60, step: 1, def: 12, hint: 'clay "boil" frames per second' },
      { key: 'boilAmount', label: 'Clay wobble', min: 0, max: 4, step: 0.05, def: 1 },
      { key: 'rimDark', label: 'Clay rim shading', min: 0, max: 1, step: 0.01, def: 0.38 },
      { key: 'squashStretch', label: 'Squash & stretch', min: 0, max: 3, step: 0.05, def: 1 },
      { key: 'grain', label: 'Film grain', min: 0, max: 0.4, step: 0.01, def: 0.06 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, def: 0.32 },
      { key: 'fog', label: 'Haze', min: 0, max: 3, step: 0.05, def: 1 },
      { key: 'particles', label: 'Particle amount', min: 0, max: 3, step: 0.1, def: 1 },
      { key: 'shadows', label: 'Real-time shadows', type: 'bool', def: true },
      { key: 'drawDist', label: 'Scenery draw distance', min: 0.3, max: 2, step: 0.05, def: 1 },
      { key: 'glow', label: 'Glow effects', min: 0, max: 2, step: 0.05, def: 1 },
      { key: 'renderScale', label: 'Render resolution', min: 0.3, max: 2, step: 0.05, def: 1, hint: 'x screen pixels' },
      { key: 'autoRes', label: 'Auto-lower resolution when slow', type: 'bool', def: true },
    ],
  },
  {
    group: 'Debug & audio',
    items: [
      { key: 'godMode', label: 'Players never spin out', type: 'bool', def: false },
      { key: 'infiniteItems', label: 'Infinite items for players', type: 'bool', def: false },
      { key: 'showRacingLine', label: 'Show bot targets', type: 'bool', def: false },
      { key: 'pauseWhileEditing', label: 'Pause while panel is open', type: 'bool', def: false },
      { key: 'timeScale', label: 'Game speed', min: 0.1, max: 3, step: 0.05, def: 1 },
      { key: 'musicVolume', label: 'Music volume', min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: 'sfxVolume', label: 'Sound effects volume', min: 0, max: 1, step: 0.01, def: 0.7 },
      { key: 'engineVolume', label: 'Engine volume', min: 0, max: 1, step: 0.01, def: 0.35 },
    ],
  },
];

const CFG_DEFAULTS = {};
for (const g of PARAM_SCHEMA) for (const p of g.items) CFG_DEFAULTS[p.key] = p.def;
const CFG = Object.assign({}, CFG_DEFAULTS);

// One-click feel presets for the Edit Panel. Keys not listed fall back to defaults.
const PRESETS = {
  Classic: {},
  'Drift King': { driftTurn: 1.05, driftCharge1: 0.55, driftCharge2: 1.2, driftCharge3: 2.0, miniTurbo3: 2.2, driftSlide: 0.45 },
  '200cc Rush': { topSpeed: 36, accel: 22, brakeDecel: 48, boostSpeed: 1.42, camBoostFov: 16, botSkill: 0.97 },
  'Ice Rink': { grip: 2.2, iceGrip: 0.1, driftSlide: 0.6, steerRate: 2.3 },
  'Moon Clay': { gravity: 12, rampLaunch: 1.8, hopVelocity: 6, airSteer: 1, glideGravity: 5, glideSink: 3.5 },
  'Item Frenzy': { itemBoxRespawn: 0.4, rouletteTime: 0.4, itemLuck: 1.6, botItemRate: 2.4, shellBounces: 9 },
  'Chill Bots': { botSkill: 0.8, rubberBand: 0.02, botAggression: 0.15, botItemRate: 0.4 },
};

// Race classes chosen in the lobby: engine size scales every kart's top speed and grunt.
const CC_CLASSES = {
  50: { speed: 0.74, accel: 0.85, bots: 0.92 },
  100: { speed: 0.87, accel: 0.93, bots: 0.96 },
  150: { speed: 1, accel: 1, bots: 1 },
  200: { speed: 1.17, accel: 1.12, bots: 1.02 },
};

// Player slot colors (name tags, split-screen frames, phone theme).
const SLOT_COLORS = ['#ff6f91', '#58b4ff', '#ffd166', '#7ddc6f'];
