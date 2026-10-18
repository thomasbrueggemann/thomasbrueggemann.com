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
| `js/shade3d.js` | Second scene, fullscreen at `shade/`: an overgrown megacity against a low sun at the end of the avenue (a city jungle: towers swallowed by vines, hedges and trees bursting from the facades, a vault of braided arches and a web of lianas across the avenue and every side street, banyan megatrees, a canopy roof spanning from tower top to tower top (torn open where the sun looks in, fraying ~700 m out), a layered jungle floor, a meandering river (`riverX`/`riverW`, shared by JS and GLSL) that mirrors the previous frame (`post.js` `keepPrev`), a terraced arcology, screen-space god rays). A still frame with small motion to find: gusts over the canopy, swaying vine curtains, a swift flock, storks circling, gondolas, drifting seeds, cloud shadows, heat shimmer. A highway (`HWY`: an elevated viaduct on hammerhead piers through the first cross street, with a tied-arch bridge wrapped in lianas over the river, planted median and parapets, `HIGHWAY` material with worn lane paint, cracks and growth) carries pods, vans and buses left to right and back (instanced, moved in `traffic(t)`, each with a long shadow blob). The city exists all round the camera (the far side is generated after everything ahead, from its own RNG `RB`, so the view ahead never changes), and the view turns through 360°: drag, ←/→, or the Pan button (`yaw`, `__shade.setYaw(deg)`, `__shade.pan()`); instanced meshes are cut into 16 compass sectors and only those the camera can face are drawn. Moving the pointer into the lower half of the screen lowers the camera to street level over the canal (`STREET`); `__shade.setDrop(0..1)` jumps there for screenshots, `__shade.look([x,y,z],[x,y,z])` parks the camera anywhere. Seeded (`R` lays out the city, `D` decorates it), so the composition is the same on every load. Lit surfaces are `MeshStandardMaterial`s patched by `patch()` (shared sun shadow map, rendered once). `window.__shade` exposes `{frame, setDrop, scene, camera, stats}`. |
| `js/shade-audio.js` | Shade's soundscape, synthesised with WebAudio: cicadas, wind in the leaves, the river (louder as you descend), birds; `gust()` swells the wind. The page's controls: Sound (M), Gust (G, `__shade.gust()` sends a gust front rolling over the canopy), Descend (D, `__shade.toggleDescend()`), Pan 360° (P), Fullscreen (F). |
| `js/post.js` | Post chain shared by both scenes: HDR target, dual-filter bloom, and a scene-specific composite shader passed in. |
| `storm/`, `shade/` | Fullscreen pages for the two scenes, linked from the hero. |
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

The look is deliberately **quiet and minimal**: one near-black background, one warm accent used only for hover/focus, serif headings, plain sans body. The site shows **only the Worlds** (flagship browser games). Earlier versions also had smaller games, tools, hardware and archive sections; they were removed on request ("keep it simple"), so do not add sections back unless asked. Do not reintroduce decorative effects (grain, glows, marquee, per-project colours, tilt).

1. **Hero**: live 3D storm scene (`js/hero3d.js`; wave parameters and look follow the Skerryhead Light game), name, one-line lede, two buttons. `window.__hero` exposes `{frame, strike, scene, camera}` for debugging (e.g. `__hero.strike()` forces lightning). Camera, rock positions (`ROCKS`) and tower dimensions are constants at the top of the file. Check 1440x900 and 390x844 after any change; text sits bottom-left, the tower right of centre.
2. **Worlds** (`worlds[]` in `js/data.js`): one chapter each (screenshot, title, tagline, description, Play/Source, "Details" link). Chapters alternate left/right. Highlights, tags and the screenshot gallery live in the dialog.

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
     play: "https://.../",            // or null if there is no public demo
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
