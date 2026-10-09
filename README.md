# Clay Kart: Party Grand Prix

A Mario Kart-style racer in the claymation look of *Super Clay Isles*. Up to four people race
on one big screen (a smart TV, desktop or tablet) and steer with their phones, or you race
seven clay bots on your own. Four courses run from a gentle meadow circuit to a run down a
whole mountain, with gliders, anti-gravity, boost rings and a staff ghost to chase. Every kart,
racer, tree and cloud is sculpted in code from lumpy clay primitives that "boil" twelve times a
second like stop-motion. There are no model, texture or audio files: everything is generated,
and the music and sound are synthesized.

## Play

### Party race (big screen + phones)

```sh
npm start            # or: node server.js   (no install needed, Node 18+)
```

1. Open `http://localhost:8080` on the big screen (the computer running the server, or a
   smart TV / tablet browser pointed at the address the server prints).
2. Choose **Party Race**. A QR code and a four-letter room code appear.
3. Each player scans the QR code (or opens `pad.html` and types the code). Phones must be on
   the same Wi-Fi as the server.
4. On the phone: pick a racer, kart, wheels and paint (buy more with the party's coins), then
   tap **I'm ready!**. The first player is the race leader and can choose the course, laps,
   engine class, bots and items from their phone; the big screen has the same controls.
   During the race the phone turns into a handheld console tinted in your player colour: the
   steering wheel on the left half, the A B X Y buttons on the right, and a little screen in
   the middle with your place, item, lap (or section), coins and key. It vibrates with what
   your kart feels (see **Haptics** below).

The server is a single dependency-free file (`server.js`): it serves the game and relays
messages between the big screen and the phones over WebSockets. If a phone drops out mid-race a
bot keeps its kart going until it reconnects, and a big screen that reloads gets its room back.

**Online mode.** If the game is opened from a static web host (no `server.js`), Party Race
falls back to peer-to-peer WebRTC through the public PeerJS broker, so phones can join over the
internet. That needs an internet connection; on a local network `npm start` is the reliable
choice. To use your own PeerJS server instead of the public one, add
`?peer=your.host:9000/path` to the big screen's address (the QR code passes it on to the
phones). Tilt steering is only offered on https pages (browsers only allow motion sensors in a
secure context); drag steering works everywhere.

How the big screen knows which mode to use: `js/served.js` says `CLAYKART_SERVER = false`, and
`server.js` answers that one file with `true` instead. A sandboxed preview that can't use WebRTC
can also set `window.CLAYKART_EMBED = true` there; the lobby then says phones can't join and
only offers keyboard, gamepad and touch racers.

**Hosting on GitHub Pages.** In the repository's *Settings → Pages*, choose *Deploy from a
branch*, pick this branch and `/ (root)`, and save. The game is then served at
`https://<user>.github.io/<repo>/` and Party Race uses online mode, so phones can join from any
network. The empty `.nojekyll` file tells Pages to serve the files as they are.

### Solo or same-screen

Choose **Quick Race** to race against bots. **+ Keyboard player** adds a second racer on the
same keyboard, gamepads join by pressing **A** in the lobby, and a tablet can use the on-screen
touch pad. Opening `index.html` straight from disk works for solo and same-screen play.
Switch **Bots** off when racing alone and you race the **Staff Ghost** instead.

### Controls

| Action | Keyboard (solo) | Two on one keyboard | Gamepad | Phone |
| --- | --- | --- | --- | --- |
| Steer | ← → or A D | A D / ← → | Left stick, d-pad | Drag the wheel (or tilt, or ◀ ▶ buttons) |
| Gas | ↑ or W | W / ↑ | A or RT | Automatic (switch it off and Y is the gas) |
| Brake / reverse | ↓ or S | S / ↓ | B or LT | B |
| Hop & drift (hold) | Space, Shift or Z | Left Shift / Right Shift or / | RB or LB | A |
| Use item | X, E or Q | Q / . | X | X |
| Throw backwards / look back | hold C or R | R / , | Y | Y, or swipe down on X |
| Pause | Esc or P | | Start | + (− opens the controller settings) |
| Edit Panel | Tab or ` | | | |
| Mute / fullscreen | M / F | | | |

Menus work with a mouse, touch, arrow keys + Enter (TV remotes) or a gamepad's d-pad.

### Haptics

The phones feel the race. Every frame the big screen works out what each phone's kart is going
through (`js/haptics.js`) and streams it over: one-shot jolts with a strength, and one
continuous rumble. The phone plays them on its vibration motor (`js/buzz.js`).

- **Hits**: a wall hit by its impact speed, bumping another kart (both phones), bumpers, cows
  and poles, a locked gate, shells and bombs (a crash), bananas, penguins and skiers (a slippery
  wobble), being squashed by a stomper, falling off and the rescue cloud.
- **The road**: kerbs buzz once per red-and-white stripe at your speed, off-road gravel rumbles
  coarse and irregular, wooden planks rattle faster the faster you go, cobbles, dirt, snow and
  water each have their own texture, moguls and ramp bases kick the wheels, and landings thud
  by how far you fell. Glassy ice, smooth tarmac, anti-gravity hover and the air are quiet, so
  you feel when the grip goes.
- **Driving**: braking judders (harder the faster you go, gone once you have stopped), drifting
  scrubs, mini-turbo sparks tick blue, orange and purple, boosts surge and roar, a star beats,
  and a spin-out wobbles until you recover. On the grid you feel the engine rev: rough when it
  floods, smooth in the rocket-start window.
- **Around you**: a stomper slamming down or a bomb going off next to you, the countdown,
  checkpoints, laps and the finish. Key presses click, and the drag wheel clicks through its
  centre and knocks at full lock.

A vibration motor has no volume knob, so strength becomes pulse length and a rumble becomes a
train of pulses whose duty cycle is its amplitude. **Haptics** (Off, Light, Strong) is in the
controller settings (the − button). Android phones get all of it. iPhones don't let web pages
drive the vibration motor; the controller falls back to the tap that Safari's switch control
makes, so an iPhone feels single taps for key presses and the bigger moments where iOS allows
it, but no rumble.

## What's in it

**Four courses**, from easiest to hardest, each with a key-locked hidden route. The lobby cards
show each course's difficulty (one to four pips), laps or sections, whether you've found its
secret route, and its staff time once the course has one.

| Course | Race | World | Hidden route |
| --- | --- | --- | --- |
| Puffball Circuit | laps · easy (779 per lap) | Floating clay meadow: banked corners, windmills and balloons, giant mushrooms, a bridge over the clouds, a jump ramp, Mudlets on the road and Moo Meadow farm, where cows wander by the road and moles pop out of the dirt beside a red barn | **Hollow Log Shortcut** through the infield |
| Sherbet Slopes | laps · medium (997 per lap) | A pastel sherbet-ice mountain: a banked switchback climb past giant ice-cream scoops, the summit by the ice castle, the first glider leap over a crevasse, a ski jump, a frozen lake full of sliding penguins and a rink with skaters | **Crystal Cave**, an icy tunnel with falling icicles |
| Magma Keep | laps · hard (1167 per lap) | King Mudlet's castle over a lava sea: the stomper hall inside the keep, boulders rolling across the rampart, fireballs leaping over a narrow lava bridge past a lava fall, fire bars, the **Tower Twist** (an anti-gravity hairpin around the great spire), lava geysers before the lava-pit jump and a fire-breathing King Mudlet statue | **Rainbow Bridge** arching over the lava lake |
| Mount Wobble | point-to-point, 3 sections · hardest (a 4.1 km run) | One run from the summit to the valley. **Summit Drop**: jump out of a cargo plane onto the ice shelf, sweepers, a snowball gully, a cliff ledge, an anti-gravity spiral with bumpers and falling icicles in the ice cave, then a glider leap over the crevasse. **Wobble Dam**: across the top of the dam, then an anti-gravity water chute that doubles back down the canyon at its foot past the spillway waterfalls, a fork through the pine woods (the Woodcutter Trail has moles and boost pads) and a log bridge. **Ski Run**: slalom gates, skiers and a moving ski lift, then the bobsleigh run (a narrow ice channel of steeply banked curves, from the wooden start house past cheering grandstands to the finish arch), moguls and a giant anti-gravity ski jump that launches the gliders through boost rings to the log-cabin finish | **Frozen Falls** beside the reservoir |

**Point-to-point runs.** Mount Wobble is raced once, top to bottom, through checkpoint arches
that split it into sections. The HUD and the phones count sections instead of laps, and every
section has its own song: when the human racer furthest down the mountain passes an arch, the
music changes on the next beat (no final-lap speed-up here). The race starts with the whole
field dropping out of a cargo plane on gliders.

**Course features.** Glide ramps unfold a glider that flies the same arc at any speed, so the
jump suits every engine class; steer it gently through the air. On glowing blue anti-gravity
road the wheels fold flat and bumping another kart (or a bumper) sends both of you off with a
**spin boost**. Golden **boost rings** hang over the big jumps. Water streams carry you along
like a conveyor, shallows slow you down, moguls throw fast karts into the air, corners are
banked, and some roads fork into two routes of similar length.

**Moving hazards**: wandering Mudlets, stompers, fire bars and snowmen, plus rolling snowballs
and boulders, sliding penguins, skiing critters, cows, moles that pop out of the ground, water
and lava geysers, leaping fireballs, anti-gravity bumpers, falling icicles and slalom poles.
The sneaky ones give themselves away first (a shaking mound, a bubbling geyser, a trembling
icicle), and star power bowls the critters and snowballs over.

**Staff ghost.** Race alone with bots off and a translucent Staff Ghost drives the course at
full pace (it touches nothing and takes no place). Courses can set a staff time per engine
class; the results say whether you beat it (or the ghost).

**Keys and hidden routes.** A golden key floats somewhere risky on every course (over a jump,
at the edge of a lava bridge, out on the ice). Carry it into the locked gate and the door
sinks into the ground for a few seconds: a shortcut with coins, item boxes and boost pads.
Anyone right behind you can slip through too. Finding a route the first time adds 15 coins to
the bank, and bots hunt for keys as well.

**Racing.** Hop-drifts charge blue, orange and purple sparks for mini-turbos, rocket starts
(hit the gas as the **1** appears), trick boosts off ramps, boost pads, off-road and mud,
slippery ice, coins that raise your top speed (up to 10), kart-to-kart bumping by weight, a
cloud that fishes you back when you fall, wrong-way warnings, laps (or sections), positions
and a podium.

**Items** from rainbow **?** boxes, weighted by position so the back of the pack gets the good
stuff: mushroom, triple mushroom, banana, green shell (bounces off walls), red shell (homes in
on the racer ahead), clay bomb, star and coin pouch.

**Bots** follow their own racing lines, take the inside of bends, drift for mini-turbos, dodge
hazards (moving ones too, by predicting where they'll be), pick a side at forks, steer their
gliders through the rings, use items with a little cunning, take hidden routes when they have a
key, and rubber-band gently around the human racers.

**Split screen** for two to four people (side by side or stacked for two players), each with
their own camera, HUD, item slot and position, plus a shared minimap.

**Garage & store.** Eight racers (Pepper, Dumpling, Shelly, Sprout, Puff, Thornbun, Flapper,
King Mudlet), six kart bodies, four wheel sets and eleven paints (including shimmering Gold Leaf
and Rainbow).
Each part changes speed, acceleration, weight, handling, traction and mini-turbo; the stat bars
preview the difference before you buy. Coins collected in races plus a placing bonus fill a
shared party bank, saved in the big screen's browser.

## Edit Panel

Press **Tab** (or the **Edit Panel** button). Every gameplay value is a slider that applies on the
next frame and is remembered in the browser: top speed, acceleration, steering, grip, off-road,
wall bounce and bumping; drift turn rate, spark times and mini-turbo strengths; boost, mushroom,
pad, trick and rocket-start boosts; gravity and ramp launch; the glider (gravity, sink, steering,
launch and landing dive), boost rings, anti-gravity spin boosts, water currents and how fast the
moving hazards move; ice grip; item box respawn, roulette, catch-up luck, shell speed and
homing, spin-out times, bomb blast, star power; bot pace, cornering, rubber-banding, item use,
aggression, key hunting and the staff ghost; the chase camera (including how far it leans on
banked roads, and boost speed lines); and the clay look itself (stop-motion rate, wobble, rim
shading, squash and stretch, grain, vignette, haze, particles, real-time shadows, glow, scenery
draw distance and render resolution, with automatic resolution scaling for slow TVs).

It also has feel presets (Drift King, 200cc Rush, Ice Rink, Moon Clay, Item Frenzy, Chill Bots),
a live readout (FPS, resolution, speed, surface, drift charge, boost, place, lap or section,
road position), playtest tools (give any item, hand out keys, open every gate, star power, max
coins, skip a lap (on a point-to-point run: skip to the next checkpoint), finish the race, +100
garage coins, unlock every part, autopilot) and JSON copy/paste for sharing tweaks.

## Project layout

```
index.html          big screen: menus, HUD canvas, touch pad, Edit Panel
pad.html            phone controller
server.js           zero-dependency static server + WebSocket room relay
js/served.js        "is the party server here?" flag (rewritten by server.js)
css/style.css       big-screen look (shared with Super Clay Isles)
css/pad.css         phone controller look (the handheld console)
vendor/             three.js r159, qrcode-generator, PeerJS (all MIT)
js/config.js        every tweakable parameter (drives the Edit Panel), presets, engine classes
js/parts.js         racers, karts, wheels, paints, stats and prices
js/tracks.js        the course format (documented), road styles and colour themes
js/courses/*.js     one file per course, pure data (also raced by the Node tests)
js/scenery/*.js     course-specific 3D landmark builders
js/track.js         turtle-built roads (circuits or point-to-point runs with sections), banking,
                    anti-gravity, branches and forks, zones, rings, spatial queries (pure)
js/kart.js          kart physics: grip, drifting, mini-turbos, air, gliders, anti-gravity,
                    currents, walls, falls (pure)
js/items.js         item boxes, shells, bananas, bombs, coins, keys, gates, boost rings, hazards (pure)
js/ai.js            bot drivers (pure)
js/race.js          grid, countdown, laps or sections, positions, bumping, rubber-banding, the
                    cargo-plane intro, staff ghosts (pure)
js/haptics.js       what each phone's racer feels: jolts and the continuous rumble (pure)
js/clay3d.js        clay materials (boil, rim shading, fingerprints) and lumpy geometry kit
js/world3d.js       builds a course in 3D: terrain, roads, walls, water and lava, scenery
js/sky3d.js         lights and sun shadows, sky, clouds and distant backdrops
js/kart3d.js        clay karts and drivers (gliders, hover wheels)
js/fx3d.js          particles, item boxes, coins, keys, shells, rings, hazards, rescue clouds
js/view.js          split-screen cameras and the race HUD
js/scenes3d.js      the clay showroom behind the lobby, garage and podium
js/party.js         player slots, phones, the coin bank and garage unlocks
js/net.js           local WebSocket and online WebRTC transports
js/screens.js       menu screens
js/icons.js         2D clay icons (items, racers, parts) for the HUD and the phone
js/clay.js          2D claymation drawing toolkit (from Super Clay Isles)
js/audio.js         synthesized music (a song per world, one per Mount Wobble section),
                    sound effects, engine hum, glider wind and the cargo plane's drone
js/input.js         keyboard, gamepad and touch input, menu navigation
js/editpanel.js     Edit Panel
js/main.js          app flow, race sounds and section music, the fixed-timestep loop
js/pad.js           phone controller logic
js/buzz.js          the phone's haptics engine (vibration patterns, iPhone taps)
tests/sim.js        headless race and mechanics tests (Node)
tests/load.js       loads the pure simulation scripts into Node
tests/e2e.mjs       the party flow in Chromium with emulated phones
tests/shots.mjs     screenshot harness for courses and menus
```

Courses are written as turtle walks (`{ s: 80 }` straight, `{ r: 90, rad: 30 }` right turn,
with elevation, width, banking, anti-gravity, road style and wall flags), closed automatically
(or left open for a point-to-point run), and decorated with placements along them
(`{ seg: 7, t: 0.3, d: -4 }` = segment 7, 30% along, 4 units left of centre). `js/tracks.js`
documents every field.

## Tests

```sh
npm test             # both suites
npm run test:sim     # headless races on every course (Node only)
npm run test:e2e     # big screen + two phones in Chromium (needs Playwright)
```

- `tests/sim.js` (about 20 s) loads the real track, kart, item, bot and race code in Node and
  runs full eight-bot races on every course: everyone must finish, nobody may get stuck or keep
  falling off, bots must drift and use items, a key must open each hidden route (and no
  keyless kart may pass a locked gate), and each ramp must clear its chasm. On the
  point-to-point run the sections must come in order, every bot must glide both chasms and
  fly through the rings, and some must take each side of the fork. Mechanics checks cover the
  glider, boost rings, anti-gravity spin boosts, currents, banking, the road-end barriers,
  moguls, rescue spots, the cargo-plane intro, the staff ghost and every hazard kind, and the
  haptics: brake judder, quiet tarmac and ice against off-road, kerbs and planks, moguls, wall
  hits by impact, bumps on both phones, the revving engine, nearby stompers, and a vibration
  pattern on the phone for every jolt the big screen can send.
- `tests/e2e.mjs` starts the server, opens the big screen and two emulated phones, joins the
  room from the QR link, customises and buys parts, readies up, starts from the leader's phone,
  steers with phone input, checks split screen, finishes the race and checks the results, the
  coin bank, the garage and the Edit Panel. Then it picks Mount Wobble from the leader's phone
  (all four courses listed, laps disabled), starts the run and checks the phone's HUD counts
  the sections and the music follows them. On the phone it also checks the Y button throws the
  item backwards, key presses click, a wall hit jolts and braking judders the vibration motor,
  and Haptics Off keeps it still.
- `tests/shots.mjs` photographs a course for eyeballing scenery, hazards and effects:

  ```sh
  node tests/shots.mjs --track mount --at 100,600,1200 --out /tmp/shots    # spots along the road
  node tests/shots.mjs --track meadow --at log:0.5 --gas --wait 2000        # a branch, driving
  node tests/shots.mjs --track mount --intro --out /tmp/shots               # the cargo-plane drop
  node tests/shots.mjs --title --lobby --out /tmp/shots                     # menus
  ```

  Other options: `--players 2..4` (split screen), `--bots 0`, `--d` (lateral offset),
  `--speed`, `--perf` (draw calls and triangles per shot), `--params '{"shadows":false}'`
  (Edit Panel values) and `--eval "js"` (run in the page once the race has started).
