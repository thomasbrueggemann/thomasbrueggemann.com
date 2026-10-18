// Single source of truth for everything the page shows.
// See AGENTS.md for the schema and the "add a project" procedure.

const GH = "https://github.com/thomasbrueggemann/";
const PAGES = "https://thomasbrueggemann.github.io/";

// ---------------------------------------------------------------------------
// WORLDS — flagship projects, rendered as full "chapters" with screenshots.
// Order here = order on the page.
// shots: files in assets/shots/ (webp, 1600w max). First one is the hero image.
// play: live URL or null.
// ---------------------------------------------------------------------------
export const worlds = [
  {
    slug: "windward",
    title: "Windward",
    kicker: "A long walk into the wind",
    tagline: "Walk, sing and glide through sand, ruins, depths and snow.",
    description:
      "A long walk into the wind, built from scratch with three.js. Cross golden dunes, a ruined city at dusk, the blue depths and a final snowy ascent toward a glowing split in the mountain. Terrain, textures, models and the music are all procedural, so there are no assets at all.",
    date: "2026-10",
    genre: "Adventure",
    tags: ["three.js", "Vite", "procedural", "synthesised score"],
    highlights: [
      "Four chapters driven by one colour script: golden dunes, amber ruins at dusk, the blue depths, then snow and white-out",
      "Sand-surf down steep dunes, then flutter, glide, dive, loop and barrel-roll on a scarf that charges from the symbols you find",
      "A companion who follows you, buildings you can enter, and a score synthesised live in the browser",
    ],
    play: PAGES + "windward/",
    repo: GH + "windward",
    shots: [
      { src: "windward-1.webp", alt: "A red-robed traveler on golden dunes with a glowing mountain and light pillars ahead", caption: "The first dunes, with the mountain on the horizon" },
      { src: "windward-2.webp", alt: "A traveler sand-surfing a sunlit dune groove in the sunken city chapter", caption: "Chapter two: the sunken city" },
      { src: "windward-3.webp", alt: "A traveler in a blue canyon in front of rock arches and shafts of light", caption: "Chapter three: the depths" },
      { src: "windward-4.webp", alt: "A traveler in a white-out snowfield near a small stone hut", caption: "Chapter four: the ascent" },
    ],
  },
  {
    slug: "lighthouse",
    title: "Skerryhead Light",
    kicker: "A keeper's night",
    tagline: "Keep the light burning through a full gale.",
    description:
      "A first-person lighthouse-keeper game. You are alone on a granite rock in the Atlantic on the night of a full gale. Keep the lamp lit, make repairs, guide a lost steamer past the reef and find out what the old keeper hid inside the tower. Every texture, every sound and every polygon is generated in code: there are no asset files at all.",
    date: "2026-10",
    genre: "First-person",
    tags: ["three.js", "procedural", "WebAudio", "no assets"],
    highlights: [
      "Nine low-ceilinged storeys wound by one spiral stair, topped by a rotating Fresnel optic at 34 m",
      "Wind, rain, surf, thunder, foghorn and even the cat purring are synthesised live",
      "Quality tiers with shadows, SSAO and bloom that step themselves down when the frame rate drops",
    ],
    play: PAGES + "lighthouse/",
    repo: GH + "lighthouse",
    shots: [
      { src: "lighthouse-1.webp", alt: "The lighthouse on its rock at night, beam sweeping the clouds past a hazy moon", caption: "Skerryhead Light from the jetty" },
      { src: "lighthouse-2.webp", alt: "The tower on its granite rock above a stormy sea, beam sweeping the sky", caption: "The rock, the oil store and the sea stacks" },
      { src: "lighthouse-3.webp", alt: "Looking up at the lit tower, windows glowing, beam crossing the sky", caption: "Every window is lit by the keeper's lamps" },
    ],
  },
  {
    slug: "containership",
    title: "Triple-E Bridge Command",
    kicker: "Ship-handling simulator",
    tagline: "Dock a 399 m container ship from the bridge.",
    description:
      "Take the Triple-E class MAJESTIC MAERSK (399 m, 18,270 TEU) from the sea buoy into the fictional port of Westerhaven and put her alongside Berth 4. The wheelhouse, the crew, the VHF chatter and the hydrodynamics are all simulated in the browser.",
    date: "2026-09",
    genre: "Simulator",
    tags: ["three.js", "WebGPU", "physics", "speech synthesis"],
    highlights: [
      "A 3-DOF manoeuvring model: Clarke hull derivatives, twin rudders in prop wash, bow thrusters, tugs, wind, current and squat",
      "Crew voices synthesised in the browser by Kokoro-82M on WebGPU, routed through a VHF radio chain",
      "Authored as 30+ modules and concatenated into one file; every time of day, sea state and quality level is regression-tested",
    ],
    play: PAGES + "containership/",
    repo: GH + "containership",
    shots: [
      { src: "containership-1.webp", alt: "Ship bridge wheelhouse in daylight with gauges, consoles, an officer and a briefing panel", caption: "Morning on the bridge: engines on stand-by" },
      { src: "containership-2.webp", alt: "The same bridge at night with illuminated gauges", caption: "Same bridge, 23:20 local time" },
    ],
  },
  {
    slug: "canopy",
    title: "CANOPY",
    kicker: "The overgrown city, 2087",
    tagline: "Glide across a megacity swallowed by trees.",
    description:
      "The Warming moved civilisation into the shade. Engineered megaflora swallowed the cities, and people now live in cool green street-canyons beneath the leaves. Above the canopy the sun burns at 54 °C: you can climb out any time, you just cannot stay. An infinite, procedural, first-person city in one HTML file and one script.",
    date: "2026-07",
    genre: "Exploration",
    tags: ["three.js", "procedural", "climbing", "gliding"],
    highlights: [
      "Infinite city built from deterministic chunks: row-house blocks, towers, plazas, groves and abandoned overgrown cars",
      "Climb vine-covered facades, mantle onto rooftops, then unfurl the leaf-sail and glide from bough to bough",
      "Heat and a day/night cycle, errands from citizens, collectable glowseeds and a trial journal",
    ],
    play: PAGES + "canopy/",
    repo: GH + "canopy",
    shots: [
      { src: "canopy-1.webp", alt: "Street canyon between glass towers draped in vines and moss", caption: "Moss Court, in the shade of the deep green" },
      { src: "canopy-2.webp", alt: "A street at dusk, giant trunks rising between buildings", caption: "Trunks like towers" },
      { src: "canopy-3.webp", alt: "Canopy title screen with story intro", caption: "Intro" },
    ],
  },
  {
    slug: "halcyon-ring",
    title: "Halcyon Ring",
    kicker: "Stanford torus, 1.9 km across",
    tagline: "Gravity fails every few minutes. Fix the ring.",
    description:
      "You are the duty engineer aboard a Stanford torus cruising through space. The flywheel is failing: every few minutes the ring stops spinning, gravity dies and everything, you included, floats. Walk, run and drift the full 5.9 km circumference of the ring city to repair five systems before someone else's shift starts.",
    date: "2026-07",
    genre: "First-person",
    tags: ["three.js", "PBR", "procedural", "zero-g"],
    highlights: [
      "Every session generates a different ring from one world seed (?seed=12345 replays it): river, hills, waterfall, roads, buildings",
      "Full PBR materials built from a single height field: flagstones, clapboard, slate roofs, riveted and rusting steel",
      "Real zero-g thruster controls, swimming, trains with live countdown boards, and procedural audio",
    ],
    play: PAGES + "halcyon-ring/",
    repo: GH + "halcyon-ring",
    shots: [
      { src: "halcyon-ring-1.webp", alt: "Plaza with a stone fountain and apartment blocks inside a space habitat, hills curving up overhead", caption: "The inside of the torus: the ground curves up into the sky" },
      { src: "halcyon-ring-2.webp", alt: "A fountain close up in the ring city plaza", caption: "A fountain on the plaza" },
      { src: "halcyon-ring-3.webp", alt: "Halcyon Ring title screen", caption: "Begin shift" },
    ],
  },
  {
    slug: "wildfire-response",
    title: "Wildfire Response",
    kicker: "One HTML file, offline",
    tagline: "Hold the line. Embers are what kill the town.",
    description:
      "Drive a fire appliance, work the roof monitor and hold a wind-driven fire back from three mountain towns. Terrain, textures, truck models, sound and icons are generated at runtime, so the entire game builds down to a single 785 KB HTML file that plays straight off the disk.",
    date: "2026-08",
    genre: "Action / strategy",
    tags: ["three.js", "PWA", "single file", "simulation"],
    highlights: [
      "Fire runs uphill and downwind, spots ahead of itself with lofted embers, and crawls through clearings",
      "Roads and water are firebreaks; wet ground resists ignition, so you can lay a line ahead of the front",
      "Installable, fully offline PWA; the published site is always rebuilt from source by a GitHub Action",
    ],
    play: PAGES + "wildfire-response/",
    repo: GH + "wildfire-response",
    shots: [
      { src: "wildfire-response-1.webp", alt: "A red fire appliance driving toward a building in a mountain valley, with a minimap and gauges", caption: "Ranger Pumper on the road to Ashford" },
      { src: "wildfire-response-2.webp", alt: "Appliance selection screen with four trucks and their stats", caption: "Pick your appliance" },
    ],
  },
  {
    slug: "one-more-lane",
    title: "One More Lane",
    kicker: "Gridless traffic puzzle",
    tagline: "Draw roads at any angle. Fix the jams. Keep the city moving.",
    description:
      "A tiny, top-down, road-building traffic game. Draw smooth roads at any angle, fix jams with roundabouts, traffic lights and overpasses, and keep a growing city moving. It plays with a mouse on desktop and with fingers on a tablet, and installs as an offline PWA.",
    date: "2026-10",
    genre: "City builder",
    tags: ["three.js", "PWA", "touch", "traffic simulation"],
    highlights: [
      "Gridless roads that bend smoothly, snap to junctions and guides, and rise into overpasses and ramps",
      "Actuated traffic lights with a phase editor and protected left turns; routes adapt to live traffic",
      "Congestion heat-map, street/area removal with undo, dark theme",
    ],
    play: PAGES + "one-more-lane/",
    repo: GH + "one-more-lane",
    shots: [
      { src: "one-more-lane-1.webp", alt: "Curvy neighbourhood of roads and houses in the game", caption: "A curvy neighbourhood" },
      { src: "one-more-lane-2.webp", alt: "Traffic light editor beside a roundabout", caption: "Traffic-light phases next to a roundabout" },
      { src: "one-more-lane-3.webp", alt: "A big city with many roads", caption: "A big city" },
      { src: "one-more-lane-4.webp", alt: "The game in dark theme", caption: "Dark theme" },
      { src: "one-more-lane-5.webp", alt: "Start menu over the map", caption: "Start menu" },
    ],
  },
  {
    slug: "gemify",
    title: "Gemify",
    kicker: "Claude, the game designer",
    tagline: "Photograph a board game. Play it in 3D.",
    description:
      "Scan a QR code with your phone and photograph every rulebook page and every component. Claude works out the rules and writes a three.js game module; bots then playtest it headless, and if it breaks Claude gets the report and fixes it. Play the result against bots, on one screen, or online with friends. It needs a server and Claude credentials, so there is no public demo: run it yourself.",
    date: "2026-10",
    genre: "AI tool",
    tags: ["Claude", "three.js", "WebSocket", "multiplayer", "Playwright"],
    highlights: [
      "Phone-to-computer photo pipeline paired by QR code; each upload is confirmed on the phone",
      "Generated rules are played out by headless bots before anyone sees them, with up to two self-repair rounds",
      "Lobby with seats for same-screen, bot or online players, joined by invite link",
    ],
    play: null,
    repo: GH + "gemify",
    shots: [
      { src: "gemify-1.webp", alt: "Gemify home screen", caption: "Home: scan a new game" },
      { src: "gemify-2.webp", alt: "Host screen with QR code and received photos", caption: "Photos arrive from the phone" },
      { src: "gemify-3.webp", alt: "Build progress with rules test results", caption: "Claude builds; bots test the rules" },
      { src: "gemify-4.webp", alt: "Lobby with host and online player seats", caption: "Lobby" },
      { src: "gemify-5.webp", alt: "A 3D Connect Four board being played", caption: "Playing the built-in Connect Four demo" },
    ],
  },
];
