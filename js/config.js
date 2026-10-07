'use strict';
// Global constants and live-tweakable gameplay parameters.
// Everything in CFG is read every frame, so the Edit Panel can change it in real time.

const TILE = 32;
const VIEW_W = 960;
const VIEW_H = 540;

// Each group becomes a collapsible section in the Edit Panel.
// Numbers: {key, label, min, max, step, def, hint}; booleans: {key, label, type:'bool', def}.
const PARAM_SCHEMA = [
  {
    group: 'Running',
    items: [
      { key: 'walkSpeed', label: 'Walk speed', min: 0.5, max: 8, step: 0.1, def: 2.6, hint: 'px per frame' },
      { key: 'runSpeed', label: 'Run speed', min: 1, max: 10, step: 0.1, def: 4.0, hint: 'hold run' },
      { key: 'sprintSpeed', label: 'Sprint speed (P)', min: 1, max: 12, step: 0.1, def: 5.4, hint: 'when P-meter is full' },
      { key: 'groundAccel', label: 'Ground acceleration', min: 0.01, max: 1, step: 0.01, def: 0.14 },
      { key: 'groundFriction', label: 'Ground friction', min: 0.01, max: 1, step: 0.01, def: 0.16 },
      { key: 'skidDecel', label: 'Skid strength', min: 0.01, max: 1.5, step: 0.01, def: 0.34 },
      { key: 'airAccel', label: 'Air control', min: 0, max: 1, step: 0.01, def: 0.12 },
      { key: 'pMeterFrames', label: 'P-meter charge time', min: 4, max: 240, step: 1, def: 56, hint: 'frames at run speed' },
    ],
  },
  {
    group: 'Jumping',
    items: [
      { key: 'gravity', label: 'Gravity', min: 0.05, max: 2, step: 0.01, def: 0.62 },
      { key: 'jumpGravity', label: 'Gravity while holding jump', min: 0.02, max: 2, step: 0.01, def: 0.3 },
      { key: 'jumpVelocity', label: 'Jump strength', min: 2, max: 20, step: 0.1, def: 9.0 },
      { key: 'runJumpBonus', label: 'Running jump bonus', min: 0, max: 6, step: 0.1, def: 1.2 },
      { key: 'maxFall', label: 'Max fall speed', min: 1, max: 20, step: 0.1, def: 9.5 },
      { key: 'spinJumpVelocity', label: 'Spin jump strength', min: 2, max: 20, step: 0.1, def: 8.2 },
      { key: 'stompBounce', label: 'Stomp bounce', min: 1, max: 16, step: 0.1, def: 7.8 },
      { key: 'springVelocity', label: 'Spring launch', min: 4, max: 30, step: 0.5, def: 15 },
      { key: 'coyoteFrames', label: 'Coyote time', min: 0, max: 30, step: 1, def: 6, hint: 'frames after leaving a ledge' },
      { key: 'jumpBuffer', label: 'Jump buffer', min: 0, max: 30, step: 1, def: 7, hint: 'frames before landing' },
    ],
  },
  {
    group: 'Cape',
    items: [
      { key: 'glideFallSpeed', label: 'Glide fall speed', min: 0.1, max: 6, step: 0.05, def: 1.3 },
      { key: 'takeoffLift', label: 'Takeoff lift', min: 1, max: 15, step: 0.1, def: 6.8 },
      { key: 'takeoffFrames', label: 'Takeoff duration', min: 5, max: 240, step: 1, def: 70 },
      { key: 'flightMaxSpeed', label: 'Flight max speed', min: 2, max: 14, step: 0.1, def: 6.6 },
      { key: 'diveAccel', label: 'Dive acceleration', min: 0, max: 1, step: 0.01, def: 0.16 },
      { key: 'diveFallMax', label: 'Dive fall speed', min: 0.5, max: 14, step: 0.1, def: 6.5 },
      { key: 'pullUpLift', label: 'Pull-up lift', min: 0, max: 2, step: 0.01, def: 0.75 },
      { key: 'soarDrag', label: 'Soaring drag', min: 0, max: 0.2, step: 0.001, def: 0.012 },
      { key: 'capeSpinFrames', label: 'Cape spin duration', min: 4, max: 60, step: 1, def: 20 },
      { key: 'capeSpinReach', label: 'Cape spin reach', min: 8, max: 96, step: 1, def: 30 },
    ],
  },
  {
    group: 'Companion',
    items: [
      { key: 'rideSpeedMult', label: 'Riding speed multiplier', min: 0.3, max: 3, step: 0.05, def: 1.05 },
      { key: 'rideJumpBonus', label: 'Riding jump bonus', min: -3, max: 6, step: 0.1, def: 0.4 },
      { key: 'tongueLength', label: 'Tongue length', min: 16, max: 256, step: 1, def: 88 },
      { key: 'tongueSpeed', label: 'Tongue speed', min: 1, max: 30, step: 0.5, def: 9 },
      { key: 'fleeSpeed', label: 'Flee speed when hit', min: 0.5, max: 10, step: 0.1, def: 3.0 },
      { key: 'keepCompanion', label: 'Keep companion between levels', type: 'bool', def: true },
    ],
  },
  {
    group: 'Enemies',
    items: [
      { key: 'enemySpeed', label: 'Walker speed', min: 0, max: 4, step: 0.05, def: 0.8 },
      { key: 'shellSpeed', label: 'Kicked shell speed', min: 1, max: 14, step: 0.1, def: 6.0 },
      { key: 'flapperSpeed', label: 'Flapper speed', min: 0, max: 4, step: 0.05, def: 1.0 },
      { key: 'pelletSpeed', label: 'Cannon pellet speed', min: 0.5, max: 10, step: 0.1, def: 3.2 },
      { key: 'cannonInterval', label: 'Cannon fire interval', min: 20, max: 600, step: 1, def: 160, hint: 'frames' },
      { key: 'shellWakeFrames', label: 'Shell wake-up time', min: 60, max: 1800, step: 10, def: 480 },
      { key: 'bossHP', label: 'King Mudlet HP', min: 1, max: 12, step: 1, def: 3 },
      { key: 'bossHopPower', label: 'King Mudlet hop power', min: 2, max: 20, step: 0.5, def: 11 },
    ],
  },
  {
    group: 'World & Camera',
    items: [
      { key: 'timeScale', label: 'Game speed', min: 0.1, max: 3, step: 0.05, def: 1 },
      { key: 'timeLimit', label: 'Level time limit', min: 30, max: 999, step: 1, def: 300, hint: 'applies on next level start' },
      { key: 'startLives', label: 'Lives on new game', min: 1, max: 99, step: 1, def: 5 },
      { key: 'invincibleFrames', label: 'Invincibility after hit', min: 0, max: 600, step: 1, def: 120 },
      { key: 'camLookahead', label: 'Camera lookahead', min: 0, max: 300, step: 1, def: 90 },
      { key: 'camSmoothing', label: 'Camera smoothing (X)', min: 0.01, max: 1, step: 0.01, def: 0.12 },
      { key: 'camVertical', label: 'Camera smoothing (Y)', min: 0.01, max: 1, step: 0.01, def: 0.08 },
      { key: 'screenShake', label: 'Screen shake', min: 0, max: 3, step: 0.1, def: 1 },
    ],
  },
  {
    group: 'Clay Look',
    items: [
      { key: 'boilFps', label: 'Stop-motion rate', min: 1, max: 60, step: 1, def: 12, hint: 'clay "boil" frames per second' },
      { key: 'boilAmount', label: 'Clay wobble', min: 0, max: 4, step: 0.05, def: 1 },
      { key: 'squashStretch', label: 'Squash & stretch', min: 0, max: 3, step: 0.05, def: 1 },
      { key: 'grain', label: 'Film grain', min: 0, max: 0.4, step: 0.01, def: 0.07 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'parallax', label: 'Parallax depth', min: 0, max: 2, step: 0.05, def: 1 },
      { key: 'particles', label: 'Particle amount', min: 0, max: 3, step: 0.1, def: 1 },
    ],
  },
  {
    group: 'Debug & Cheats',
    items: [
      { key: 'godMode', label: 'God mode', type: 'bool', def: false },
      { key: 'infiniteFlight', label: 'Infinite flight', type: 'bool', def: false },
      { key: 'showHitboxes', label: 'Show hitboxes', type: 'bool', def: false },
      { key: 'pauseWhileEditing', label: 'Pause while panel is open', type: 'bool', def: false },
      { key: 'musicVolume', label: 'Music volume', min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: 'sfxVolume', label: 'Sound effects volume', min: 0, max: 1, step: 0.01, def: 0.7 },
    ],
  },
];

const CFG_DEFAULTS = {};
for (const g of PARAM_SCHEMA) for (const p of g.items) CFG_DEFAULTS[p.key] = p.def;
const CFG = Object.assign({}, CFG_DEFAULTS);

// One-click feel presets for the Edit Panel. Keys not listed fall back to defaults.
const PRESETS = {
  Classic: {},
  'Moon Clay': { gravity: 0.3, jumpGravity: 0.13, jumpVelocity: 7, maxFall: 5, glideFallSpeed: 0.7, stompBounce: 6 },
  'Turbo Run': { walkSpeed: 3.6, runSpeed: 5.6, sprintSpeed: 7.6, groundAccel: 0.26, pMeterFrames: 28, flightMaxSpeed: 9 },
  'Heavy Clay': { gravity: 0.95, jumpGravity: 0.46, jumpVelocity: 11.2, maxFall: 13, groundFriction: 0.32, glideFallSpeed: 2.2 },
  'Sky Glider': { glideFallSpeed: 0.55, takeoffFrames: 140, pullUpLift: 1.05, soarDrag: 0.004, pMeterFrames: 30 },
  'Chill Mode': { invincibleFrames: 300, timeLimit: 999, enemySpeed: 0.45, pelletSpeed: 2, cannonInterval: 280 },
};
