// Single source of truth for everything the page shows.
// See AGENTS.md for the schema and the "add a project" procedure.

// ---------------------------------------------------------------------------
// WORLDS — the scenes, rendered as full "chapters" with screenshots.
// Order here = order on the page.
// shots: files in assets/shots/ (webp, 1600w max). First one is the hero image.
// play: live URL (or a path on this site) or null. label: the play button's text (default "Play").
// ---------------------------------------------------------------------------
export const worlds = [
  {
    slug: "hearth",
    title: "Hearth",
    kicker: "A cabin in the spruces",
    tagline: "A cabin in the woods on a cold autumn evening.",
    description:
      "An A-frame in an old spruce forest, with the fire going and the lights on. Walk around it, look in through the windows, stoke the fire. Deer, a fox and hares come by now and then.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Walk around the cabin and up to the windows",
      "The room behind the glass is ray-traced in a shader",
      "The trees are painted needle by needle when the page loads",
    ],
    play: "hearth/",
    label: "Enter",
    shots: [
      { src: "hearth-1.webp", alt: "A glowing A-frame cabin in a misty spruce forest at dusk, smoke rising from its chimney, a flagstone path leading to it", caption: "Through the trunks at dusk" },
      { src: "hearth-2.webp", alt: "The front of the A-frame up close: a string of lights over the deck, lit windows, pumpkins on the steps, a chopping block with an axe", caption: "String lights over the deck" },
      { src: "hearth-3.webp", alt: "The back of the cabin: a stone gable wall with a stone chimney rising above the roof", caption: "The back of the cabin" },
      { src: "hearth-4.webp", alt: "The cabin at night, only its windows lit, glowing in the mist", caption: "Nightfall" },
    ],
  },
  {
    slug: "storm",
    title: "Skerryhead Storm",
    kicker: "A lighthouse in a gale",
    tagline: "A lighthouse on a rock, at night, in a full gale.",
    description:
      "The lighthouse from the top of this page, full screen. Waves break over the rocks and rain blows through the beam. You can call in lightning, a passing ship or the foghorn.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "WebAudio"],
    highlights: [
      "Waves that break into foam and spray on the rocks",
      "Lightning, a passing ship, now and then a submarine",
      "Wind, rain, surf, thunder and the foghorn, all made in the browser",
    ],
    play: "storm/",
    label: "Enter",
    shots: [
      { src: "storm-1.webp", alt: "A lighthouse on a rock at night, its beam sweeping through rain over a stormy sea", caption: "The beam through the rain" },
      { src: "storm-2.webp", alt: "The same lighthouse lit by a lightning strike", caption: "Lightning" },
    ],
  },
  {
    slug: "torus",
    title: "Torus",
    kicker: "A city in orbit",
    tagline: "A city inside a spinning space station.",
    description:
      "A ring 1.8 km across, turning once a minute 8,000 km above the Earth. Zoom in through the glass and you're over a green, busy city with a river, trains, markets and a lot of people.",
    date: "2026-07",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "One turn a minute gives about 1 g inside",
      "Around 54,000 people, plus cars, boats, trains and animals, all moving",
      "Earth rolls past every four minutes",
    ],
    play: "torus/",
    label: "Enter",
    shots: [
      { src: "torus-1.webp", alt: "A glazed ring station with spokes and a hub seen from below, the half-lit Earth behind it", caption: "The station from below, Earth behind it" },
      { src: "torus-2.webp", alt: "The city inside the ring seen through its glass: a river, a monorail, blocks and parks", caption: "Through the glass, the far side of the ring" },
      { src: "torus-3.webp", alt: "Close view of blocks, a river with a monorail, and a market square with striped stalls and a big tree", caption: "A market by the river" },
      { src: "torus-4.webp", alt: "From 60 m over the river: a monorail station with planted canopies, boats, crowds on the promenades and a market", caption: "A monorail station from above" },
      { src: "torus-5.webp", alt: "Street level beside the river: a monorail station on its piers, a river bus and a rowing boat, people walking under the trees", caption: "Down by the river" },
    ],
  },
  {
    slug: "shade",
    title: "Shade",
    kicker: "A city that grew its own shade",
    tagline: "An overgrown city in the late afternoon sun.",
    description:
      "A big city taken over by trees and vines, with a river where the main road used to be. It looks still at first, then you start to notice the birds, the gondolas and the traffic on the old highway.",
    date: "2026-07",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Look all the way around, or drop down to the river",
      "Deer, capybaras and monkeys on the forest floor",
      "Cicadas, wind and birds, all made in the browser",
    ],
    play: "shade/",
    label: "Enter",
    shots: [
      { src: "shade-1.webp", alt: "Overgrown towers and hanging vines against a low sun, traffic crossing on an elevated highway", caption: "Into the sun" },
      { src: "shade-2.webp", alt: "Overgrown towers and a canopy roof seen from another direction", caption: "The other way" },
      { src: "shade-3.webp", alt: "Street level over the river, looking up into a vault of arches and vines", caption: "Down at the river" },
    ],
  },
];
