# AGENTS.md — thomasbrueggemann.com

Personal site of Thomas Brüggemann: a portfolio of artistic real-time 3D scenes that run in the browser
(code at <https://github.com/thomasbrueggemann>). It is **not** a games showcase any more (it was one until
October 2026). Hand-built static site, **no framework, no bundler, no build step**.
Deployed by GitHub Pages from `master` (custom domain in `CNAME`).

## Layout

| Path | Purpose |
| --- | --- |
| `index.html` | Static shell: hero, the scenes section container, the `<dialog id="viewer">`. The scene chapters are filled by JS. |
| `js/data.js` | **Single source of truth for all content.** Almost every change happens here. |
| `js/render.js` | Pure functions: data → HTML strings (`renderScene`, `renderViewer`). |
| `js/main.js` | Renders the scene chapters, scroll fade-in, nav state, viewer dialog. |
| `js/hero3d.js` | Hero scene in three.js: Skerryhead Light in a storm (Gerstner sea with surf foam and spray, storm sky, rain, lightning, rotating beam). Loaded via the import map in `index.html` (three.js 0.160.0 from jsDelivr). |
| `js/shade3d.js` | Second scene, fullscreen at `shade/`: an overgrown megacity against a low sun at the end of the avenue (a city jungle: towers swallowed by vines, hedges and trees bursting from the facades, a vault of braided arches and a web of lianas across the avenue and every side street, banyan megatrees, a canopy roof spanning from tower top to tower top (torn open where the sun looks in, fraying ~700 m out), a layered jungle floor, a meandering river (`riverX`/`riverW`, shared by JS and GLSL) that mirrors the previous frame (`post.js` `keepPrev`), a terraced arcology, screen-space god rays). A still frame with small motion to find: gusts over the canopy, swaying vine curtains, a swift flock, storks circling, gondolas, drifting seeds, cloud shadows, heat shimmer. A highway (`HWY`: an elevated viaduct on hammerhead piers through the first cross street, with a tied-arch bridge wrapped in lianas over the river, planted median and parapets, `HIGHWAY` material with worn lane paint, cracks and growth) carries pods, vans and buses left to right and back (instanced, moved in `traffic(t)`, each with a long shadow blob). The city exists all round the camera (the far side is generated after everything ahead, from its own RNG `RB`, so the view ahead never changes), and the view turns through 360°: drag, ←/→, or the Pan button (`yaw`, `__shade.setYaw(deg)`, `__shade.pan()`); instanced meshes are cut into 16 compass sectors and only those the camera can face are drawn. Moving the pointer into the lower half of the screen lowers the camera to street level over the canal (`STREET`); `__shade.setDrop(0..1)` jumps there for screenshots, `__shade.look([x,y,z],[x,y,z])` parks the camera anywhere. Seeded (`R` lays out the city, `D` decorates it), so the composition is the same on every load. Lit surfaces are `MeshStandardMaterial`s patched by `patch()` (shared sun shadow map, rendered once). `window.__shade` exposes `{frame, setDrop, scene, camera, stats}`. |
| `js/shade-audio.js` | Shade's soundscape, synthesised with WebAudio: cicadas, wind in the leaves, the river (louder as you descend), birds; `gust()` swells the wind. The page's controls: Sound (M), Gust (G, `__shade.gust()` sends a gust front rolling over the canopy), Descend (D, `__shade.toggleDescend()`), Pan 360° (P), Fullscreen (F). |
| `js/post.js` | Post chain shared by both scenes: HDR target, dual-filter bloom, and a scene-specific composite shader passed in. |
| `storm/`, `shade/` | Fullscreen pages for the two scenes, linked from the hero. |
| `js/hero.js` | Small raw-WebGL 2D shader; only used as a fallback when three.js cannot load (offline, blocked). |
| `css/style.css` | All styling. Tokens in `:root`; one accent colour for the whole site. |
| `assets/shots/` | Screenshots of the scenes, named `<slug>-<n>.webp` (`storm-1`…, `shade-1`…; 1600 px wide max). |
| `assets/og.jpg` | Social preview image (1200×630): storm and shade side by side, cropped from `storm-1` and `shade-1`. |
| `tools/shoot-scenes.mjs` | Re-shoots the scene screenshots in headless Chrome (reduced-motion, frame-stepped, so they are repeatable) and converts them to webp. |

ES modules are used, so the page **must be served over HTTP** (not `file://`):

```bash
python3 -m http.server 8090   # then open http://localhost:8090
```

(`.claude/launch.json` already defines this as the `site` preview server.)

## Page structure

The look is deliberately **quiet and minimal**: one near-black background, one warm accent used only for hover/focus, serif headings, plain sans body. The site shows **only the Scenes** (currently Storm and Shade). Earlier versions showed browser games, tools, hardware and an archive; they were removed on request, so do not add games or other sections back unless asked. Do not reintroduce decorative effects (grain, glows, marquee, per-project colours, tilt).

1. **Hero**: live 3D storm scene (`js/hero3d.js`; wave parameters and look follow the Skerryhead Light game), name, one-line lede, buttons (scenes, Enter the storm, Enter the shade, GitHub). `window.__hero` exposes `{frame, strike, scene, camera}` for debugging (e.g. `__hero.strike()` forces lightning). Camera, rock positions (`ROCKS`) and tower dimensions are constants at the top of the file. Check 1440x900 and 390x844 after any change; text sits bottom-left, the tower right of centre.
2. **Scenes** (`scenes[]` in `js/data.js`): one chapter each (screenshot, title, tagline, description, "Enter the scene" link to its fullscreen page, "Source" link to the scene's JS file, "Details" link). Chapters alternate left/right. Highlights, tags and the screenshot gallery live in the dialog.

## Procedure: add a scene

1. Build the scene as a fullscreen page (`<slug>/index.html`, script in `js/`) that exposes a debug object on `window` with a manual `frame(dt)` (like `__hero`, `__shade`), so that screenshots are repeatable under `prefers-reduced-motion`.
2. Write the copy from the code and from the scene's file header. Do not invent features, numbers or claims; every highlight must be traceable to the code.
3. Add the shots to `SHOTS` in `tools/shoot-scenes.mjs` and run it (see "Screenshots"). 3 shots, best one first.
4. Append an object to `scenes` in `js/data.js`:

   ```js
   {
     slug: "storm",                   // = fullscreen page folder; used for ids and #s-<slug> anchors
     title: "Skerryhead Storm",
     meta: "Night · open sea",        // short label above the title
     tagline: "A lighthouse holds on in a gale.",   // one sentence
     description: "2-4 sentences.",
     date: "2026-10",                 // YYYY-MM, shown in the dialog as "Oct 2026"
     tags: ["three.js", "GLSL"],      // shown in the dialog; 3-5
     highlights: ["...", "...", "..."],// exactly three, one line each; shown in the dialog
     href: "storm/",                  // the fullscreen page
     source: SRC + "hero3d.js",       // the scene's code on GitHub
     shots: [{ src: "storm-1.webp", alt: "...", caption: "..." }],  // first = chapter image; alt is required
   }
   ```
5. Update the og image if the new scene should be in it (`assets/og.jpg`, 1200×630).

## Screenshots

Use `tools/shoot-scenes.mjs` (needs Chrome/Chromium, ImageMagick, and `npm i --no-save puppeteer-core`; run the site on `localhost:8090` first):

```bash
CHROME=/path/to/chrome node tools/shoot-scenes.mjs          # both scenes
CHROME=/path/to/chrome node tools/shoot-scenes.mjs shade    # one scene
```

Notes:
- The pages are loaded with `prefers-reduced-motion`, so each scene renders a single frame and then waits. The tool then calls `frame(dt)` itself and parks the camera, so a shot is the same every time. `Math.random` is pinned before `__hero.strike()` to force a big bolt.
- Software GL (SwiftShader) works, only slowly: Shade takes minutes per shot. Real GPUs are quick.
- A scene that resets its camera every frame (storm) needs `position.set`/`lookAt` stubbed after parking; see `stormCam` in the tool. Shade has `__shade.setYaw`, `setDrop` and `look` for this.
- Output is webp, ≤1600 px wide, ~50–150 KB. Aim for 16:10; the frame crops with `object-fit: cover`.
- Prefer moments with something moving or lit (a bolt, the sun through the vault) over a plain default frame.

## Design rules (keep it calm and coherent)

- Dark, single accent (`--accent`, hover/focus only), serif display (Instrument Serif) + sans body (Inter Tight). Fonts come from Google Fonts in `index.html`.
- No decorative motion: only a slow fade-in on scroll and the hero shader. Everything must respect `prefers-reduced-motion`.
- Images: always give `width`/`height`, `alt` text, `loading="lazy"` (done in `render.js`).
- Dependencies: none, except three.js for the scenes (pinned in the import map; the hero has a 2D fallback). Do not add more.
- Layout must hold from 360 px wide up, with no horizontal scroll. Check mobile after any CSS change.
- Copy: direct, concrete, no hype. Facts from the code only.
- Do not publish Thomas's email or employer unless he asks; the only contact link is GitHub.

## Verifying a change

```bash
python3 -m http.server 8090
```

1. Open the page in the browser pane (or `node` + `puppeteer-core` for screenshots at 1440×900 and 390×844).
2. Console must be clean (no 404s for new screenshots: file names in `data.js` are case-sensitive).
3. Scroll the whole page: both scene chapters appear, no layout overflow.
4. Click a card → dialog opens, arrow keys switch images, Esc closes.
5. `document.documentElement.scrollWidth - innerWidth` should be `0` at 390 px.

## Deploy

Pushing to `master` runs `.github/workflows/pages.yml`, which publishes the repo root to GitHub Pages (Settings > Pages > Source is "GitHub Actions"). `CNAME` holds `thomasbrueggemann.com`, and `.nojekyll` disables Jekyll processing. Never delete either file. Check a deploy with `gh run list --limit 3`.

## History

The previous contents (photo albums `autumn2022/`, `falsterbo2022/`, `india2022/`, a Three.js corridor `index.html` and a WASM `test/` page) were removed when this site was rebuilt in October 2026; they remain in git history.

The games that used to be on the front page (Windward, Skerryhead Light, Triple-E Bridge Command, CANOPY, Halcyon Ring, Wildfire Response, One More Lane, Gemify) and their screenshots were removed in October 2026 when the site became a portfolio of scenes; they remain in git history. The games themselves still live in their own repositories.
