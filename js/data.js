// Single source of truth for everything the page shows.
// See AGENTS.md for the schema and the "add a project" procedure.

const SRC = "https://github.com/thomasbrueggemann/thomasbrueggemann.com/blob/master/";

// ---------------------------------------------------------------------------
// WORLDS — the scenes, rendered as full "chapters" with screenshots.
// Order here = order on the page.
// shots: files in assets/shots/ (webp, 1600w max). First one is the hero image.
// play: live URL (or a path on this site) or null. label: the play button's text (default "Play").
// ---------------------------------------------------------------------------
export const worlds = [
  {
    slug: "torus",
    title: "Torus",
    kicker: "A city in orbit",
    tagline: "A Stanford torus turning once a minute, 8,000 km above the Earth.",
    description:
      "A wheel 1.8 km across, glazed over the top so you look down into a dense, green city: a river round the whole ring with a monorail over it, boats, people on the promenades, blocks with roof gardens, fields and terraced houses climbing to the glass. Earth rolls through the sky as the station orbits, always half lit, and swallows the Moon on its way past. Zoom from the whole wheel down to people on the riverbanks.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "One turn a minute gives about 1 g on the floor; close in, the camera rides along with the spin and the stars wheel past",
      "Earth at its true size from 8,000 km: clouds and their shadows, the sun's glint, a thin atmosphere, a twilight band and cities on the night side",
      "Sound synthesised live: a rumble, a beating drone, machinery hum and the structure groaning under the spin",
    ],
    play: "torus/",
    label: "Enter",
    repo: SRC + "js/torus3d.js",
    shots: [
      { src: "torus-1.webp", alt: "A glazed ring station with spokes and a hub, the half-lit Earth behind it", caption: "The wheel, with Earth rising behind it" },
      { src: "torus-2.webp", alt: "Looking down through the glass of the ring at a river, a monorail, blocks and parks", caption: "The far side of the ring, seen through its inner glass" },
      { src: "torus-3.webp", alt: "Close view of blocks with roof gardens, trees, a monorail over a river and people on the promenade", caption: "Close in: roof gardens, the river and the monorail" },
      { src: "torus-4.webp", alt: "The small ring station against the half-lit Earth with city lights on its night side", caption: "From afar, against the night side" },
    ],
  },
  {
    slug: "shade",
    title: "Shade",
    kicker: "A city that grew its own shade",
    tagline: "An overgrown megacity against a low sun.",
    description:
      "Towers swallowed by vines, trees bursting from the facades, a vault of arches and lianas over the avenue, and a river where the lanes used to be. It holds still like a photograph; what moves has to be found: gusts over the canopy, swifts, storks circling, gondolas, traffic on an overgrown viaduct, drifting seeds and heat shimmer.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Turn the view through 360°, or move the pointer down to drop to street level over the river",
      "An elevated highway with a tied-arch bridge wrapped in lianas, carrying pods, vans and buses",
      "Cicadas, wind in the leaves, the river and birds, all synthesised live; send a gust rolling over the canopy",
    ],
    play: "shade/",
    label: "Enter",
    repo: SRC + "js/shade3d.js",
    shots: [
      { src: "shade-1.webp", alt: "Overgrown towers and hanging vines against a low sun, traffic crossing on an elevated highway", caption: "Looking into the sun, the highway crossing the avenue" },
      { src: "shade-2.webp", alt: "Overgrown towers and a canopy roof seen from another direction", caption: "Turned round, away from the sun" },
      { src: "shade-3.webp", alt: "Street level over the river, looking up into a vault of arches and vines", caption: "Down at the river" },
    ],
  },
  {
    slug: "storm",
    title: "Skerryhead Storm",
    kicker: "A lighthouse in a gale",
    tagline: "A lighthouse on a rock in a full gale, at night.",
    description:
      "The lighthouse from the top of this page, fullscreen: a Gerstner sea with surf foam and spray, a storm sky, rain, lightning and the rotating beam. Wave parameters and look follow the Skerryhead Light game.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "WebAudio"],
    highlights: [
      "A Gerstner sea with surf foam and spray breaking on the rocks",
      "Lightning on demand, lighting the clouds and the sea",
      "Wind, rain, surf and thunder synthesised live",
    ],
    play: "storm/",
    label: "Enter",
    repo: SRC + "js/hero3d.js",
    shots: [
      { src: "storm-1.webp", alt: "A lighthouse on a rock at night, its beam sweeping through rain over a stormy sea", caption: "The beam through the rain" },
      { src: "storm-2.webp", alt: "The same lighthouse lit by a lightning strike", caption: "Lightning" },
    ],
  },
];
