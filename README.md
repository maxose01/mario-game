# Clay Kart: Party Grand Prix

A Mario Kart-style racer in the claymation look of *Super Clay Isles*. Up to four people race
on one big screen (a smart TV, desktop or tablet) and steer with their phones, or you race
seven clay bots on your own. Every kart, racer, tree and cloud is sculpted in code from lumpy
clay primitives that "boil" twelve times a second like stop-motion. There are no model, texture
or audio files: everything is generated, and the music and sound are synthesized.

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

The server is a single dependency-free file (`server.js`): it serves the game and relays
messages between the big screen and the phones over WebSockets. If a phone drops out mid-race a
bot keeps its kart going until it reconnects, and a big screen that reloads gets its room back.

**Online mode.** If the game is opened from a static web host (no `server.js`), Party Race
falls back to peer-to-peer WebRTC through the public PeerJS broker, so phones can join over the
internet. That needs an internet connection; on a local network `npm start` is the reliable
choice. Tilt steering is only offered on https pages (browsers only allow motion sensors in a
secure context); drag steering works everywhere.

### Solo or same-screen

Choose **Quick Race** to race against bots. **+ Keyboard player** adds a second racer on the
same keyboard, gamepads join by pressing **A** in the lobby, and a tablet can use the on-screen
touch pad. Opening `index.html` straight from disk works for solo and same-screen play.

### Controls

| Action | Keyboard (solo) | Two on one keyboard | Gamepad | Phone |
| --- | --- | --- | --- | --- |
| Steer | ← → or A D | A D / ← → | Left stick, d-pad | Drag (or tilt, or ◀ ▶ buttons) |
| Gas | ↑ or W | W / ↑ | A or RT | Automatic (can be switched off) |
| Brake / reverse | ↓ or S | S / ↓ | B or LT | Brake button |
| Hop & drift (hold) | Space, Shift or Z | Left Shift / Right Shift or / | RB or LB | Drift button |
| Use item | X, E or Q | Q / . | X | Item button |
| Throw backwards / look back | hold C or R | R / , | Y | Swipe down on Item |
| Pause | Esc or P | | Start | ⚙ → Pause |
| Edit Panel | Tab or ` | | | |
| Mute / fullscreen | M / F | | | |

Menus work with a mouse, touch, arrow keys + Enter (TV remotes) or a gamepad's d-pad.

## What's in it

**Three courses**, each with a key-locked hidden route:

| Course | World | Hidden route |
| --- | --- | --- |
| Puffball Circuit | Floating clay meadow: hedges, windmills, giant mushrooms, a cloud bridge, a jump ramp and Mudlets wandering across the road | **Hollow Log Shortcut** through the infield |
| Sherbet Slopes | Snow and ice: a summit climb, a ski jump over a crevasse, a frozen lake that slides, snowmen and an ice castle | **Crystal Cave**, an icy tunnel through the mountain |
| Magma Keep | King Mudlet's castle over a lava sea: stompers, fire bars, a lava bridge, a lava-pit jump and a volcano | **Rainbow Bridge** arching over the lava lake |

**Keys and hidden routes.** A golden key floats somewhere risky on every course (over a jump,
at the edge of a lava bridge, out on the ice). Carry it into the locked gate and the door
sinks into the ground for a few seconds: a shortcut with coins, item boxes and boost pads.
Anyone right behind you can slip through too. Finding a route the first time adds 15 coins to
the bank, and bots hunt for keys as well.

**Racing.** Hop-drifts charge blue, orange and purple sparks for mini-turbos, rocket starts
(hit the gas as the **1** appears), trick boosts off ramps, boost pads, off-road and mud,
slippery ice, coins that raise your top speed (up to 10), kart-to-kart bumping by weight, a
cloud that fishes you back when you fall, wrong-way warnings, laps, positions and a podium.

**Items** from rainbow **?** boxes, weighted by position so the back of the pack gets the good
stuff: mushroom, triple mushroom, banana, green shell (bounces off walls), red shell (homes in
on the racer ahead), clay bomb, star and coin pouch.

**Bots** follow their own racing lines, take the inside of bends, drift for mini-turbos, dodge
hazards, use items with a little cunning, take hidden routes when they have a key, and rubber-
band gently around the human racers.

**Split screen** for two to four people (side by side or stacked for two players), each with
their own camera, HUD, item slot and position, plus a shared minimap.

**Garage & store.** Six racers (Pepper, Dumpling, Shelly, Thornbun, Flapper, King Mudlet), six
kart bodies, four wheel sets and eleven paints (including shimmering Gold Leaf and Rainbow).
Each part changes speed, acceleration, weight, handling, traction and mini-turbo; the stat bars
preview the difference before you buy. Coins collected in races plus a placing bonus fill a
shared party bank, saved in the big screen's browser.

## Edit Panel

Press **Tab** (or the **Edit Panel** button). Every gameplay value is a slider that applies on the
next frame and is remembered in the browser: top speed, acceleration, steering, grip, off-road,
wall bounce and bumping; drift turn rate, spark times and mini-turbo strengths; boost, mushroom,
pad, trick and rocket-start boosts; gravity and ramp launch; ice grip; item box respawn, roulette,
catch-up luck, shell speed and homing, spin-out times, bomb blast, star power; bot pace,
cornering, rubber-banding, item use, aggression and key hunting; the chase camera; and the clay
look itself (stop-motion rate, wobble, rim shading, squash and stretch, grain, vignette, haze,
particles and render resolution, with automatic resolution scaling for slow TVs).

It also has feel presets (Drift King, 200cc Rush, Ice Rink, Moon Clay, Item Frenzy, Chill Bots),
a live readout (FPS, resolution, speed, surface, drift charge, boost, place, road position),
playtest tools (give any item, hand out keys, open every gate, star power, max coins, skip a
lap, finish the race, +100 garage coins, unlock every part, autopilot) and JSON copy/paste for
sharing tweaks.

## Project layout

```
index.html          big screen: menus, HUD canvas, touch pad, Edit Panel
pad.html            phone controller
server.js           zero-dependency static server + WebSocket room relay
css/style.css       big-screen look (shared with Super Clay Isles)
css/pad.css         phone controller look
vendor/             three.js r159, qrcode-generator, PeerJS (all MIT)
js/config.js        every tweakable parameter (drives the Edit Panel), presets, engine classes
js/parts.js         racers, karts, wheels, paints, stats and prices
js/tracks.js        the three courses and their colour themes
js/track.js         turtle-built racing lines, hidden branches, spatial queries (pure)
js/kart.js          kart physics: grip, drifting, mini-turbos, air, walls, falls (pure)
js/items.js         item boxes, shells, bananas, bombs, coins, keys, gates, hazards (pure)
js/ai.js            bot drivers (pure)
js/race.js          grid, countdown, laps, positions, bumping, rubber-banding (pure)
js/clay3d.js        clay materials (boil, rim shading, fingerprints) and lumpy geometry kit
js/world3d.js       builds a course in 3D: island terrain, roads, walls, scenery, sky
js/kart3d.js        clay karts and drivers
js/fx3d.js          particles, item boxes, coins, keys, shells, hazards, rescue clouds
js/view.js          split-screen cameras and the race HUD
js/scenes3d.js      the clay showroom behind the lobby, garage and podium
js/party.js         player slots, phones, the coin bank and garage unlocks
js/net.js           local WebSocket and online WebRTC transports
js/screens.js       menu screens
js/icons.js         2D clay icons (items, racers, parts) for the HUD and the phone
js/clay.js          2D claymation drawing toolkit (from Super Clay Isles)
js/audio.js         synthesized music, sound effects and engine hum
js/input.js         keyboard, gamepad and touch input, menu navigation
js/editpanel.js     Edit Panel
js/main.js          app flow and the fixed-timestep loop
js/pad.js           phone controller logic
```

Courses are written as turtle walks (`{ s: 80 }` straight, `{ r: 90, rad: 30 }` right turn,
with elevation, width and wall flags), closed automatically, and decorated with placements
along them (`{ seg: 7, t: 0.3, d: -4 }` = segment 7, 30% along, 4 units left of centre).

## Tests

```sh
npm test             # both suites
npm run test:sim     # headless races on every course (Node only)
npm run test:e2e     # big screen + two phones in Chromium (needs Playwright)
```

- `tests/sim.js` loads the real track, kart, item, bot and race code in Node and runs full
  eight-bot races on every course: everyone must finish, nobody may get stuck or keep falling
  off, bots must drift and use items, a key must open each hidden route (and no keyless kart
  may pass a locked gate), and each ramp must clear its chasm.
- `tests/e2e.mjs` starts the server, opens the big screen and two emulated phones, joins the
  room from the QR link, customises and buys parts, readies up, starts from the leader's phone,
  steers with phone input, checks split screen, finishes the race and checks the results, the
  coin bank, the garage and the Edit Panel.
