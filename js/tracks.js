'use strict';
// The course registry and the course format. Each course lives in its own file in js/courses/
// (pure data, loaded by the big screen and by the Node tests) and pushes itself onto TRACK_DEFS;
// its 3D landmark builders live in js/scenery/ (browser only). Courses are listed in load order
// (the original four run from easiest to hardest; later ones are appended, and their difficulty
// pips say how hard they really are).
//
// A course is a turtle walk (see track.js) plus everything placed along it.
//
// Course fields
//   id, name, blurb, music, theme (a THEMES key), difficulty (1 easiest .. 4 hardest)
//   hw, sh            road half-width and shoulder width (per segment overrides allowed)
//   wallL, wallR      default edges: true = wall/hedge, false = a drop into the void
//   y, heading        start elevation and heading (radians) of the walk
//   style             default road style (see ROAD_STYLES)
//   segments          [{s: len} straight | {r|l: degrees, rad} arc] with optional
//                       y        elevation at the end of the segment (eased in)
//                       hw, sh   half-width / shoulder at the end (eased in)
//                       wallL, wallR  edges for this segment
//                       bank     degrees of banking. On arcs it tilts into the turn (negative =
//                                tilts out); on straights + = right side low. Neighbouring
//                                segments blend over ~bankBlend units, so a run of banked arcs
//                                stays banked.
//                       antigrav true = anti-gravity: wheels fold into hover mode and bumping
//                                karts or bumpers gives a spin boost
//                       style    road style for this segment
//                       look     wall look for this segment (a WALL_LOOKS key in world3d.js; default:
//                                the world's, or the road style's)
//                       deck     true = the road is carried over the void: the land falls away
//                                beside it, whatever its walls (rendering only)
//                       adj      (circuits) this straight may stretch to close the loop
//   bankBlend         units over which banking eases between segments (default 12)
//
// Circuits close their loop automatically and are raced for the lobby's lap count. The start
// line sits startAt units into the first straight.
//
// Point-to-point courses (p2p: true) are one run from the top to the finish, split into sections:
//   p2p: true, startAt (start line, units from the beginning of the walk, default 40),
//   runout (road left after the finish line, default 50), sections: [{name, music, theme, seg, t}]
//   (the first section starts at the start line; later ones at {seg, t}), planeDrop: true for
//   the cargo-plane intro.
//   A section may name its own colour theme (a THEMES key): the land, scenery, sky, fog and light
//   then change from lap to lap (the course's theme is the first one's). lapMode: true raced as
//   laps: the HUD, the phones and the results call the sections Lap 1/3, 2/3, 3/3 (each lap is a
//   different stretch of one continuous road, so a lap gets its own title card and its own song);
//   it is still a point-to-point run, and the lobby cards say "Point-to-point" and "3 laps".
//
// Placements use {seg, t} = turtle segment index and fraction along it, ds = extra units along,
// d = units right of the centre line (negative = left). Branch placements use {path, u} =
// fraction along the branch.
//   branches   [{id, name, seg, phi}] a shortcut across one big arc, or
//              [{id, name, from: [seg, t], to: [seg, t], pts: [[u, d, dy, bankDeg], ...]}]
//              with hw, sh, wallL, wallR, lift, style, antigrav.
//              gate: 'auto' (or a fraction) = locked by a key gate (a hidden route);
//              no gate = an open alternative route that anyone may take.
//   rails      [{seg, t, t1, side}] guard rails over drop edges (side -1 left, 1 right, 0 both)
//   zones      [{kind, seg, t, t1 | len, d, w, h, flow}] kinds:
//                boost (pad), ice, mud, shallow (water: slower), ramp (h = lip height),
//                glide (a ramp that opens the glider), hump (a mogul of height h),
//                gap (no ground: a chasm), current (water stream: flow = units/s along the road,
//                negative = against you), antigrav (same as the segment flag)
//              boost pads may carry look: 'candy' (peppermint swirls instead of chevrons) or
//              'stardust' (pale gold stars on night violet) and power (the share of a full pad's
//              boost they give, e.g. 0.5); shallow zones may carry look: 'splash' (a kart wading
//              in at speed throws a big splash: the pool at the foot of a water chute); on a
//              course whose laps differ a hump is drawn as a swell of the road's own surface
//   boxes      [{seg, t, d: [offsets]}] item box rows
//   coins      [{seg, t, d, n, gap, dd, h}] coin lines
//   keys       [{seg, t, d, h}] the floating key for the course's locked gate
//   rings      [{seg, t, ds, d, h, r}] boost rings in the air (h above the road, radius r)
//   hazards    [{kind, seg, t, d, ...}] moving obstacles, see items.js for each kind's fields
//   landmarks  [{kind, seg, t, d, ...}] scenery, built by LANDMARKS in world3d.js / js/scenery
//   staff      {150: seconds, 200: seconds} staff ghost times (shown in the lobby and results)

const TRACK_DEFS = [];

// Road surfaces the renderer knows. Physics never reads them: surfaces come from zones.
const ROAD_STYLES = ['road', 'stone', 'wood', 'ice', 'snow', 'metal', 'water', 'rainbow', 'dirt'];

// Colours and moods per world. Shared by the 3D builder and the phone/garage previews.
const THEMES = {
  meadow: {
    sky: ['#ff9fbf', '#ffd3c2', '#c9e9ff'], fog: '#f7dbe2', sun: '#fff2bd',
    hemiSky: '#ffe9f3', hemiGround: '#6b4a7a', sunLight: '#fff1dc',
    road: '#c9b7a8', roadLine: '#fff6ea', curb: ['#ff6f91', '#fff6ea'], shoulder: '#8fd46f',
    grass: '#7fcf6a', grass2: '#62b956', dirt: '#cf9363', rock: '#a66f62', wall: '#5fb04c', wallTop: '#86d16e',
    voidKind: 'clouds', cloud: '#ffffff', cloudShade: '#e8cfe8',
    decor: ['tree', 'tree', 'flower', 'flower', 'bush', 'shroom', 'rock'], ambient: 'pollen',
  },
  snow: {
    sky: ['#7fb8ff', '#c5e2ff', '#f2f8ff'], fog: '#e3efff', sun: '#fffbe2',
    hemiSky: '#eef6ff', hemiGround: '#5a5a8a', sunLight: '#fff8ee',
    road: '#b9b3c9', roadLine: '#ffffff', curb: ['#4f9cf0', '#ffffff'], shoulder: '#f4f8ff',
    grass: '#f2f6ff', grass2: '#dfe9fb', dirt: '#c7d3ea', rock: '#8c8fae', wall: '#ffffff', wallTop: '#ffffff',
    voidKind: 'clouds', cloud: '#ffffff', cloudShade: '#c9d8f0',
    decor: ['pine', 'pine', 'pine', 'snowrock', 'snowbush'], ambient: 'snow',
  },
  lava: {
    sky: ['#2b2257', '#7b4686', '#f2967a'], fog: '#8a4a6e', sun: '#ffe9cf',
    hemiSky: '#ffd9c6', hemiGround: '#3a1a3a', sunLight: '#ffd2b0',
    road: '#8f84a3', roadLine: '#ffd166', curb: ['#ff8a3d', '#3b2a4a'], shoulder: '#6b5f86',
    grass: '#5b4a6e', grass2: '#4a3d5c', dirt: '#6b5168', rock: '#3d2f48', wall: '#9a8fb4', wallTop: '#b9addb',
    voidKind: 'lava', lava: '#ff7a2f', lavaHot: '#ffd166',
    decor: ['crystal', 'basalt', 'basalt', 'brazier'], ambient: 'embers',
  },
  // A high mountain: deep blue sky, evergreen forests and a valley far below instead of a void.
  alpine: {
    sky: ['#3f7fd6', '#9cc8f2', '#eaf4ff'], fog: '#d7e6f5', sun: '#fffbe8',
    hemiSky: '#eef6ff', hemiGround: '#4a5a6a', sunLight: '#fff6e6',
    road: '#a9a3b6', roadLine: '#ffd166', curb: ['#e8483f', '#ffffff'], shoulder: '#f2f6fc',
    grass: '#eef4fc', grass2: '#d9e6f6', dirt: '#b9c6da', rock: '#7c7a8e', wall: '#f7fbff', wallTop: '#ffffff',
    forest: '#2f6b55', forest2: '#3f8a6a',
    voidKind: 'valley', valley: '#5d8f6e', cloud: '#ffffff', cloudShade: '#cddcef',
    decor: ['pine', 'pine', 'pine', 'pine', 'snowrock', 'snowbush'], ambient: 'snow',
  },

  // Fable Fair, one theme per lap (see the sections of js/courses/fablefair.js). The extras:
  // fogNear / fogFar (the haze's reach), hill (how high the land rolls, default 7) and rim (how far
  // the floating land reaches beyond the road's edge, default 30).
  // Lap 1: a dusk-lit enchanted forest, emerald moss under violet haze and warm lantern light.
  fairy: {
    accent: '#ffd98a', // the colour of the lap's title card
    sky: ['#2b2a63', '#7b5aa0', '#f4a79c'], fog: '#5d4c80', fogNear: 30, fogFar: 300, sun: '#ffe7b0',
    hemiSky: '#c3b0f0', hemiGround: '#2c5a44', sunLight: '#ffd7a0',
    road: '#8d7a68', roadLine: '#ffe9b8', curb: ['#e8a93f', '#fff0c4'], shoulder: '#3b8a55',
    grass: '#3a8c58', grass2: '#2b7048', dirt: '#6b4a38', rock: '#5a5170', wall: '#2e6a47', wallTop: '#4a9a5e',
    voidKind: 'clouds', cloud: '#d6c6f2', cloudShade: '#8e78b8', hill: 11, rim: 60,
    decor: ['mosstree', 'mosstree', 'mosstree', 'glowshroom', 'fern', 'stump'], ambient: 'fireflies',
  },
  // Lap 2: a bright desert under a hot blue sky: golden sand, sandstone, turquoise tiles.
  mirage: {
    accent: '#ffb35c',
    sky: ['#2c7fd6', '#8cc6f0', '#ffe2ae'], fog: '#f6dcae', fogNear: 120, fogFar: 640, sun: '#fff6d0',
    hemiSky: '#fff0d2', hemiGround: '#b7814e', sunLight: '#fff1d0',
    road: '#e2c392', roadLine: '#fff6e2', curb: ['#2d9cb8', '#fff3d6'], shoulder: '#e8c984',
    grass: '#ecc87c', grass2: '#dcae62', dirt: '#c8935f', rock: '#b9855a', wall: '#e7c88c', wallTop: '#f7e0aa',
    voidKind: 'clouds', cloud: '#fff4de', cloudShade: '#efcf9c', hill: 13, rim: 46,
    decor: ['palm', 'dune', 'dune', 'cactus', 'clayjar', 'sandrock'], ambient: 'dust',
  },
  // Lap 3: a night sky of lavender clouds, moonlight and stars.
  dream: {
    accent: '#cdb8ff',
    sky: ['#0d0f3b', '#2f2c80', '#7a55b0'], fog: '#3a3790', fogNear: 60, fogFar: 460, sun: '#fff6d8',
    hemiSky: '#8f93ff', hemiGround: '#2a1d5e', sunLight: '#bcc8ff',
    road: '#bdb4f2', roadLine: '#ffffff', curb: ['#ffd166', '#ffffff'], shoulder: '#9488e0',
    grass: '#8070dc', grass2: '#6458c0', dirt: '#9284d0', rock: '#4c3ca0', wall: '#d2caff', wallTop: '#ffffff',
    voidKind: 'clouds', cloud: '#ece6ff', cloudShade: '#8a7ad8', hill: 8, rim: 40,
    decor: ['moonflower', 'cloudpuff', 'cloudpuff', 'starpost', 'crystalspire'], ambient: 'stardust',
  },
};
