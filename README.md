# Super Clay Isles

A Super Mario World-style side-scroller in a claymation, floating-cloud-island style. Every
character, island and cloud is sculpted in code on a `<canvas>`: lumpy shaded clay blobs that
"boil" at 12 frames per second like stop-motion, thumbprints and grain baked into the terrain,
drippy grass caps, and tapering rocky roots under every island. All music and sound is
synthesized with WebAudio, so there are no asset files.

## Play

Open `index.html` in a browser. No build step and no server needed.

To serve it locally instead (for example to test on a phone on the same network):

```sh
npm start        # http://localhost:8080
```

### Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move / walk the map | Arrow keys or WASD | D-pad / left stick |
| Jump (hold to jump higher, hold while falling to glide with the cape) | Z, Space or K | A |
| Run, grab items, cape spin, Dumpling's tongue | X, Shift or J (hold) | X / Y |
| Spin jump (bounces off spiky enemies; hops off Dumpling) | C or L | B |
| Drop the reserve item | V | Select |
| Pause | Enter, P or Esc | Start |
| Edit Panel | Tab or ` | |
| Mute | M | |

On touch screens an on-screen pad appears, with a "Run lock" toggle so one thumb is free.

## What's in it

**The world map** is a branching graph of five floating islands. Paths appear pebble by
pebble when you find the exit that unlocks them.

```
                        [Cloud Switch Palace]      [Starlight Lookout]
                              ▲ L1 secret                 ▲ L3 secret
[Clay Hut] ── [Puffball Meadow] ── [Gusty Glade] ── [Thunderhead Keep] ── [Sunny Summit]
                  L1 normal          L2 normal  ╲       L3 normal             ▲
                                                 ╲_________ rainbow __________╱
                                                          L2 secret
```

- **Three levels**, each with a normal exit (goal gate or boss orb) and a secret exit.
- **Secret exits use keys.** Carry a key (hold run) into a keyhole to open a hidden route.
  Lock blocks crumble when a key touches them.
- **Unlockable paths.** Puffball Meadow's secret leads to the Cloud Switch Palace. Pressing
  its switch turns the dotted outline blocks in Gusty Glade and Thunderhead Keep solid,
  opening stairways to their keys. Gusty Glade's secret unrolls a rainbow straight to the
  summit; Thunderhead Keep's secret reveals the Starlight Lookout (and a stardust cape).
- **Running** builds the P-meter; at full charge you sprint.
- **Cape** (from feathers): glide by holding jump while falling, take off with a full
  P-meter, then dive (hold forward) and pull up (hold back) to swoop. X spins the cape.
- **Dumpling**, a rideable clay dino, hatches from egg blocks. Riding gives an extra hit,
  lets you stomp spiky enemies, and X flicks a tongue that swallows enemies (shells are
  kept in the mouth and spat back out). Dumpling follows you between levels, and bongos join
  the music while you ride.
- Shells to kick and carry, springs, moving cloud rafts, cannons, thorn brambles, a
  mid-level checkpoint, a reserve item box, three sun coins per level, and the King Mudlet
  boss in Thunderhead Keep.

## Edit Panel

Press Tab (or the **Edit Panel** button). Every gameplay value is a slider that applies on
the next frame and is remembered in the browser: run, sprint and acceleration, P-meter
charge time, gravity and jump strength, coyote time and jump buffering, glide speed and
every flight parameter, companion speed and tongue length, enemy and shell speeds, cannon
rate, boss HP, camera smoothing, game speed, and the clay look itself (stop-motion rate,
wobble, squash and stretch, grain, vignette, parallax).

It also has feel presets (Moon Clay, Turbo Run, Heavy Clay, Sky Glider, Chill Mode), a live
readout of speed and P-meter, playtest tools (give cape, summon Dumpling, drop a key,
toggle the switch, unlock every path, warp to any level), god mode, infinite flight,
hitbox display, and JSON copy/paste for sharing tweaks.

## Project layout

```
index.html          page shell, Edit Panel markup, touch pad
css/style.css       studio frame and panel styling
js/config.js        every tweakable parameter (drives the Edit Panel) and presets
js/levels.js        level builder DSL and the four level layouts
js/physics.js       tile collision (pure; shared with the tests)
js/clay.js          claymation drawing toolkit: blobs, boil, grain, clay text
js/terrain.js       contour-traced island terrain, chunk baking, parallax backdrops
js/entities.js      enemies, items, platforms, goal, keys and the boss
js/player.js        Pepper (movement, cape, carrying) and Dumpling
js/level.js         level runtime, interactions, camera, HUD
js/worldmap.js      overworld nodes, paths and unlock animations
js/game.js          state machine, saves, transitions, title and ending scenes
js/editpanel.js     Edit Panel
js/audio.js         synthesized sound effects and music
js/input.js         keyboard, gamepad and touch input
js/main.js          boot and fixed-timestep loop
```

Levels are written with a small builder (`g.ground(x, w, top)`, `g.island(...)`,
`g.cloud(...)`, `g.row(x, y, '?B?')`, `g.put(x, y, 'K')`); the legend is at the top of
`js/levels.js`.

## Tests

```sh
npm test               # both suites
npm run test:levels    # reachability analysis
npm run test:e2e       # browser playthrough (needs Playwright + Chromium)
```

- `tests/reachability.js` loads the real physics and level code in Node and explores every
  level by simulating jumps frame by frame. It checks that each exit, key and keyhole is
  reachable on foot, that switch-gated secrets need the switch, and that every sun coin and
  item block can be reached. `node tests/reachability.js --dump l2` prints a level as ASCII.
- `tests/smoke.mjs` boots the game in headless Chromium and plays through the mechanics
  with real input: the P-meter, blocks, stomps, hatching and riding Dumpling, the tongue,
  gliding and flight, cape spin, springs, the key and keyhole, the switch palace, the goal
  gate, dying, lock blocks, the boss fight and the Edit Panel.
