# AGENTS.md — thomasbrueggemann.com

Personal site of Thomas Brüggemann: a showcase of browser games, tools and hardware projects from
<https://github.com/thomasbrueggemann>. Hand-built static site, **no framework, no bundler, no build step**.
Deployed by GitHub Pages from `master` (custom domain in `CNAME`).

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Static shell: hero, section containers, the `<dialog id="viewer">`. Sections are filled by JS. |
| `js/data.js` | **Single source of truth for all content.** Almost every change happens here. |
| `js/render.js` | Pure functions: data → HTML strings (`renderWorld`, `renderCard`, `renderTool`, …). |
| `js/main.js` | Renders the sections, scroll fade-in, nav state, viewer dialog. |
| `js/hero3d.js` | Hero scene in three.js: Skerryhead Light in a storm (Gerstner sea with surf foam and spray, storm sky, rain, lightning, rotating beam). Loaded via the import map in `index.html` (three.js 0.160.0 from jsDelivr). |
| `js/shade3d.js` | Second scene, fullscreen at `shade/`: an overgrown megacity against a low sun at the end of the avenue (overgrown from the top, not the walls: trees on every roof and terrace, hedges spilling over the parapets with short fringes of vines under them, ivy only at street level, so the towers still read as buildings; a vault of braided arches and a web of lianas across the avenue and every side street, banyan megatrees, a canopy roof spanning from tower top to tower top (torn open where the sun looks in, fraying ~700 m out), a layered jungle floor, a meandering river (`riverX`/`riverW`, shared by JS and GLSL) that mirrors the previous frame (`post.js` `keepPrev`), a terraced arcology, screen-space god rays). A still frame with small motion to find: gusts over the canopy, swaying vine curtains, swifts wheeling over the avenue ahead and behind, parakeets flying up the avenue and back close past the camera, egrets gliding low along the river and under the bridge, storks circling (lit, flapping instanced birds, `BIRD_KINDS`, `birdPos`), and on the forest floor spotted deer grazing along the banks, capybaras at the waterline (some swimming) and troops of monkeys, each a `quadruped()` posed in the vertex shader (`ANIMAL`: a four-beat walk, the head down to graze, the tail swishing) and moved round its herd's patch in `animals(t)`, gondolas, drifting seeds, cloud shadows, heat shimmer. A highway (`HWY`: an elevated viaduct on hammerhead piers through the first cross street, with a tied-arch bridge wrapped in lianas over the river, planted median and parapets, `HIGHWAY` material with worn lane paint, cracks and growth) carries traffic left to right and back: hatchbacks, saloons, crossovers, vans, buses and box trucks, each a lofted body in metres (`loft()`: glass, pillars, door lines, lamps, plates, arches painted by `VEHICLE` per kind) on alloy wheels that spin with its speed (`WHEEL`), casting a shadow swept along the low sun (`SHADOW_BLOB`); instanced, moved in `traffic(t)`. The city exists all round the camera (the far side is generated after everything ahead, from its own RNG `RB`, so the view ahead never changes), and the view turns through 360°: move the mouse (the window's width is a full turn, following the movement, not the position; on touch screens, drag), ←/→, or the Pan button (`yaw`, `__shade.setYaw(deg)`, `__shade.pan()`); instanced meshes are cut into 16 compass sectors and only those the camera can face are drawn. Moving the pointer into the lower half of the screen lowers the camera to street level over the canal (`STREET`); `__shade.setDrop(0..1)` jumps there for screenshots, `__shade.look([x,y,z],[x,y,z])` parks the camera anywhere. Seeded (`R` lays out the city, `D` decorates it), so the composition is the same on every load. Lit surfaces are `MeshStandardMaterial`s patched by `patch()` (shared sun shadow map, rendered once). Up close the detail is real: a leaf atlas and a vine strand are rasterised in JS at startup (`paintLeaves`, `leafAtlas`, `vineStrand`: tone, normal tilt, coverage); crowns within `CARD_R` wear shells of alpha-to-coverage leaf cards (`LEAFCARD`, `cardShell`) that glow when backlit, near vines are crossed leafy ribbons (`VINELEAF`), grass, reeds, ferns and big-leaved plants cover the banks and the forest floor (`GRASS`, its own RNG), the ground has leaf litter, and windows show interior-mapped rooms (`roomCol`) behind frames and mullions; an apartment runs behind two or three windows and its ceiling lamp lights it unevenly; in the lit ones (about 6%) people are at home, drawn as animated figures on a plane in the room (`figure`: pacing to and fro, standing at the window with a cup, typing at a desk, dancing), some with a TV flickering, with leafy greenery on the facades. On coarse-pointer devices (`LITE`) cards, ribbons and grass reach less far. `window.__shade` exposes `{frame, setDrop, scene, camera, stats}`. |
| `js/shade-audio.js` | Shade's soundscape, synthesised with WebAudio: cicadas, wind in the leaves, the river (louder as you descend), birds; `gust()` swells the wind. The page's controls: Sound (M), Gust (G, `__shade.gust()` sends a gust front rolling over the canopy), Descend (D, `__shade.toggleDescend()`), Pan 360° (P), Fullscreen (F). |
| `js/torus3d.js` | Third scene, fullscreen at `torus/`: a Stanford torus seen from outside (ring radius `R` 895 m, tube radius `RT` 110 m), turning once a minute (`OMEGA`, about 1 g on the floor). The tube is glass from 65° round the tube (`PSI_GLASS`) over the top, inner face and bottom; the hull is below the land. Inside, a point is (θ round the ring, s across along the axis, h up toward the axis); the land lies `landF(s)` below the tube's centre (a valley, terraced near the glass). A river (`riverS`/`riverW`, duplicated in GLSL) runs round the whole ring with a monorail over it; quarters of blocks with roof gardens (density `urban(θ)`), parks, fields, tree-lined promenades and boulevards (`BLVD`) with walking people (points), boats, terraced houses. Everything on the station is drawn in the station's own spinning frame (`uInvSt`, `uCamL`, `uSunL`); interior surfaces add the air they are seen through (`airPath` traces back to the glass), and the glass's back faces add the lit air of the empty tube. Ground shadows are soft decals (`SHADOW_DIR`). The station orbits Earth ~8,000 km up in a dawn-dusk orbit (plane square to the sun, so no eclipses): Earth (`E_ANG` 26° angular radius, detailed procedural planet with clouds, glint, thin atmosphere, twilight band, city lights) rolls through the sky once per `E_PERIOD` (240 s; the real orbit is ~4.5 h), always half lit, along `ORBIT_U`/`ORBIT_W`; the Moon is a 0.7° disc at a fixed direction (`MOON_DIR`) that Earth occults as it passes. The sun stands to the right of the opening view (`VIEW0`). Earth lights the hull (earthshine) and shows in the glass (`earthSeen`). Earth and Moon are spheres drawn round the camera, so only their angular sizes matter. A shuttle docks at the hub every two minutes. Drag to orbit, wheel/pinch/±/arrows to zoom; the orbit target slides from the hub to the land on the far side, and close in the camera co-rotates (`ride`). Seeded (`L` lays out, `D` decorates). `window.__torus` exposes `{frame, setView(azDeg, elDeg, zoom 0..1), setTime(t), zoomBy, scene, camera, stats}`; with reduced motion it draws single frames, which is also the way to screenshot it in headless Chrome (call `frame(0)` and read the canvas in the same task). |
| `js/torus-audio.js` | Torus soundscape, synthesised with WebAudio: a deep rumble, a beating low drone, machinery hum and air handlers, a swell as each spoke comes round, groans and creaks of the structure, in a generated reverb; `near` (the zoom) brings machinery and groans closer. The page's controls: Sound (M), − / + zoom, Fullscreen (F). |
| `js/post.js` | Post chain shared by both scenes: HDR target, dual-filter bloom, and a scene-specific composite shader passed in. |
| `storm/`, `shade/`, `torus/` | Fullscreen pages for the three scenes, linked from the Worlds gallery. |
| `js/hero.js` | Small raw-WebGL 2D shader; only used as a fallback when three.js cannot load (offline, blocked). |
| `css/style.css` | All styling. Tokens in `:root`; one accent colour for the whole site. |
| `assets/shots/` | Screenshots, named `<slug>-<n>.webp` (1600 px wide max). |
| `assets/og.jpg` | Social preview image (1200×630). |
| `tools/shoot.mjs` | Headless-Chrome screenshot + webp conversion helper. |

ES modules are used, so the page **must be served over HTTP** (not `file://`):

```bash
python3 -m http.server 8090   # then open http://localhost:8090
```

(`.claude/launch.json` already defines this as the `site` preview server.)

## Page structure

The look is deliberately **quiet and minimal**: one near-black background, one warm accent used only for hover/focus, serif headings, plain sans body. The site shows **only the Worlds**, and the Worlds are **only the three scenes on this site** (Torus, Shade, Skerryhead Storm). Earlier versions also had smaller games, tools, hardware and archive sections, and later the browser games (Windward, Skerryhead Light, Containership, Canopy, Halcyon Ring, Wildfire Response, One More Lane, Gemify) in the gallery; all were removed on request ("keep it simple", then "only the new scenes"), and remain in git history. Do not add them back unless asked. Do not reintroduce decorative effects (grain, glows, marquee, per-project colours, tilt).

1. **Hero**: live 3D storm scene (`js/hero3d.js`; wave parameters and look follow the Skerryhead Light game), name, one-line lede, one button ("See the work ↓" to the gallery). The scenes are linked from the gallery only, not from the hero. `window.__hero` exposes `{frame, strike, scene, camera}` for debugging (e.g. `__hero.strike()` forces lightning). Camera, rock positions (`ROCKS`) and tower dimensions are constants at the top of the file. Check 1440x900 and 390x844 after any change; text sits bottom-left, the tower right of centre.
2. **Worlds** (`worlds[]` in `js/data.js`): one chapter each (screenshot, title, tagline, description, Enter/Source, "Details" link). For the scenes, `play` is a path on this site (opens in the same tab), `label` is "Enter", and `repo` points at the scene's source file in this repo. Chapters alternate left/right. Highlights, tags and the screenshot gallery live in the dialog.

## Procedure: add a world

1. Make sure the project has a live URL (usually `https://thomasbrueggemann.github.io/<repo>/`) or is explicitly self-hosted (`play: null`).
2. **Read the repo README** (`gh api repos/thomasbrueggemann/<repo>/readme --jq .content | base64 -d`) and write copy from it. Do not invent features, numbers or claims; every highlight must be traceable to the README or code.
3. Capture 2-5 screenshots, best one first (see "Screenshots").
4. Append an object to `worlds` in `js/data.js` (newest/most impressive first):

   ```js
   {
     slug: "lighthouse",              // = repo name, unique; used for ids and #w-<slug> anchors
     title: "Skerryhead Light",
     kicker: "A keeper's night",      // short label
     tagline: "Keep the light burning through a full gale.",   // one sentence
     description: "2-4 sentences.",
     date: "2026-10",                 // YYYY-MM, shown as "Oct 2026"
     genre: "First-person",           // shown above the title
     tags: ["three.js", "procedural"],// shown in the dialog; 3-5
     highlights: ["...", "...", "..."],// exactly three, one line each; shown in the dialog
     play: "https://.../",            // or a path on this site ("torus/"), or null if there is no public demo
     label: "Enter",                  // optional text for the play button (default "Play")
     repo: "https://github.com/thomasbrueggemann/<repo>",
     shots: [{ src: "lighthouse-1.webp", alt: "...", caption: "..." }],  // first = chapter image; alt is required
   }
   ```

## Screenshots

Use `tools/shoot.mjs` (needs Google Chrome, ImageMagick, and `npm i --no-save puppeteer-core`):

```bash
node tools/shoot.mjs lighthouse 1 https://thomasbrueggemann.github.io/lighthouse/ --click "take up the watch" --wait 9000
node tools/shoot.mjs halcyon-ring 2 https://thomasbrueggemann.github.io/halcyon-ring/ --click "begin shift" --keys "KeyW:3000"
```

Notes learned the hard way:
- Skerryhead Light has dev hooks: after starting the game, `skerry.shot(x, y, z, yaw, pitch)` parks the camera (tower at the origin, plateau y=7, jetty at z≈36; yaw 0 looks toward -z). Hide the hand lantern with `skerry.player.lantern.g.visible=false` and the HTML overlays before shooting. `lighthouse-1.webp` is `skerry.shot(3, 2.4, 34, 0.25, 0.62)`.
- The GPU flags in the script are required, otherwise WebGL games render black. Headless Chrome on macOS handles the three.js games fine.
- Games that need pointer lock or a "click to start" overlay: use `--click-xy 700,450`.
- Containership needs ~30 s to boot (`--wait 35000`); URL options like `?tod=morning|night` are in its README. An invalid value throws and leaves the loader stuck.
- Some repos already commit screenshots (`docs/…`, README images); fetch those from `raw.githubusercontent.com` instead of re-shooting.
- Output is webp, ≤1600 px wide, ~50–150 KB. Aim for 16:10; the frame crops with `object-fit: cover`.
- Prefer actual gameplay over title screens; use the title screen as the last image.

## Design rules (keep it calm and coherent)

- Dark, single accent (`--accent`, hover/focus only), serif display (Instrument Serif) + sans body (Inter Tight). Fonts come from Google Fonts in `index.html`.
- No decorative motion: only a slow fade-in on scroll and the hero shader. Everything must respect `prefers-reduced-motion`.
- Images: always give `width`/`height`, `alt` text, `loading="lazy"` (done in `render.js`).
- Dependencies: none, except three.js for the hero (pinned in the import map, with a 2D fallback). Do not add more.
- Layout must hold from 360 px wide up, with no horizontal scroll. Check mobile after any CSS change.
- Copy: direct, concrete, no hype. Facts from READMEs only.
- Do not publish Thomas's email or employer unless he asks; the only contact link is GitHub.

## Verifying a change

```bash
python3 -m http.server 8090
```

1. Open the page in the browser pane (or `node` + `puppeteer-core` for screenshots at 1440×900 and 390×844).
2. Console must be clean (no 404s for new screenshots: file names in `data.js` are case-sensitive).
3. Scroll the whole page: the new item appears, no layout overflow.
4. Click a card → dialog opens, arrow keys switch images, Esc closes.
5. `document.documentElement.scrollWidth - innerWidth` should be `0` at 390 px.

## Deploy

Pushing to `master` runs `.github/workflows/pages.yml`, which publishes the repo root to GitHub Pages (Settings > Pages > Source is "GitHub Actions"). `CNAME` holds `thomasbrueggemann.com`, and `.nojekyll` disables Jekyll processing. Never delete either file. Check a deploy with `gh run list --limit 3`.

## History

The previous contents (photo albums `autumn2022/`, `falsterbo2022/`, `india2022/`, a Three.js corridor `index.html` and a WASM `test/` page) were removed when this site was rebuilt in October 2026; they remain in git history.
