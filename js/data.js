// Single source of truth for everything the page shows.
// See AGENTS.md for the schema and the "add a scene" procedure.

const SRC = "https://github.com/thomasbrueggemann/thomasbrueggemann.com/blob/master/js/";

// ---------------------------------------------------------------------------
// SCENES — real-time 3D pictures that run in the browser, rendered as full
// "chapters" with screenshots. Order here = order on the page.
// shots: files in assets/shots/ (webp, 1600w max). First one is the chapter image.
// href: the fullscreen page of the scene, relative to the site root.
// ---------------------------------------------------------------------------
export const scenes = [
  {
    slug: "storm",
    title: "Skerryhead Storm",
    meta: "Night · open sea",
    tagline: "A lighthouse holds on in a gale.",
    description:
      "A granite rock in the Atlantic, one lit tower and a storm that never lets up. The sea, the sky, the rain and the lightning are all computed live in three.js, and the beam keeps turning through the weather. There are no models, textures or sound files: everything is generated in code.",
    date: "2026-10",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "A Gerstner-wave sea with crest, trail and surf foam, and white water breaking over the rocks",
      "Storm sky lit by a hidden moon, rain streaks, branching lightning and a rotating beam through the weather",
      "HDR rendering with bloom and a light grade; wind, rain, surf and thunder synthesised live (key M for sound, L for lightning)",
    ],
    href: "storm/",
    source: SRC + "hero3d.js",
    shots: [
      { src: "storm-1.webp", alt: "A striped lighthouse on a rock in a stormy sea at night, the beam sweeping across the clouds below a hazy moon", caption: "The tower, with the beam crossing the clouds" },
      { src: "storm-2.webp", alt: "A lightning bolt over the dark sea, lighting up the clouds behind the lighthouse", caption: "A bolt lights up the whole sky" },
      { src: "storm-3.webp", alt: "The lighthouse seen from a low angle above the breaking surf", caption: "From the water's edge" },
    ],
  },
  {
    slug: "shade",
    title: "Shade",
    meta: "Late afternoon · a megacity",
    tagline: "A city that grew its own shade.",
    description:
      "A megacity swallowed by its own vegetation, seen against a low sun at the end of the avenue. Towers wear vines, trees burst from the facades and a vault of arches and lianas closes over the street. It is a still frame with small things moving in it: gusts in the canopy, swaying vines, a flock of swifts, pods and buses on a highway viaduct. Everything is generated in code.",
    date: "2026-10",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Towers, hedges, banyan megatrees, a canopy roof and a web of lianas, laid out from a seeded generator so the composition is the same on every load",
      "A river that mirrors the frame before it, screen-space god rays, and a highway on piers carrying instanced traffic",
      "The city exists all round you: drag or use the arrow keys to turn 360°, or move the pointer down to stand at street level (keys G for a gust, M for sound)",
    ],
    href: "shade/",
    source: SRC + "shade3d.js",
    shots: [
      { src: "shade-1.webp", alt: "A sun low behind a vault of vines and tree crowns above a viaduct with pods and buses, towers on both sides", caption: "The avenue, with the sun at the far end" },
      { src: "shade-2.webp", alt: "A river at street level reflecting the sun, with vines hanging from a canopy overhead", caption: "Descend: street level over the river" },
      { src: "shade-3.webp", alt: "A banyan trunk lit by the low sun beside a vine-covered tower with lit windows, with buses on the highway below", caption: "Turned 40°: sunlit trunk, towers and the highway" },
    ],
  },
];
