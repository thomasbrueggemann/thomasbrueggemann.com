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
      "An A-frame in an old spruce forest. Cold and misty outside, warm and cosy inside, with the fire going and the lights on. Walk around it, look in through the windows, stoke the fire. Deer, a fox and hares come by now and then.",
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
      { src: "hearth-1.webp", alt: "A glowing A-frame cabin in a misty spruce forest at dusk, smoke rising from its chimney, a trodden path leading to it through rusty bracken", caption: "Through the trunks at dusk" },
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
      "The lighthouse from the top of this page, full screen. Waves break over the rocks and rain blows through the beam, but behind the windows it's warm and cosy, with the stove going. You can call in lightning, a passing ship or the foghorn.",
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

// ---------------------------------------------------------------------------
// UNLISTED — scenes that are live on the site (reachable by their own URL) but not
// shown on the front page yet. To list one, move its object into `worlds` above.
// ---------------------------------------------------------------------------
export const unlisted = [
  {
    slug: "aerie",
    title: "Aerie",
    kicker: "A city in the trees",
    tagline: "Crooked houses stacked up four giant trees of four kinds, their limbs reaching for each other over the mist at moonrise.",
    description:
      "Some two hundred and forty houses crowd four giant trees, each its own kind with its own town: a dense city in an old broad-crowned giant, a packed village of thatch and plaster in a baobab under a flat crown, slate-blue towers in a coiled tree that weeps wisteria, and a hamlet of red-roofed gables in a golden birch. Houses perch on brackets, stacked two and three high at odd angles, pods swinging on ropes, onion domes, glass greenhouses, witch's-hat towers. Limbs reach out toward the neighbouring trees, with a platform at each tip and a rope bridge across; one gap too wide to bridge has a platform slung on ropes between the trunks, and a cable car crosses high up. Washing hangs between houses, hammocks and rope swings sway, and the mist lies far below. Fly round the whole group or round one tree at a time.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Every house is planned, checked against everything already built and placed: the city is generated, and the same on every load",
      "Rooms behind the windows are traced in a shader: wallpaper, shelves of books, curtains, a lamp, a plant on the sill",
      "Let paper lanterns go into the sky, let night fall; crickets, frogs, wind chimes and creaking ropes synthesised live",
    ],
    play: "aerie/",
    label: "Enter",
    shots: [
      { src: "aerie-1.webp", alt: "Giant trees full of lit treehouses, rope bridges strung between their limbs, a cable car high up, the moon behind, mist below", caption: "Moonrise over the mist" },
      { src: "aerie-2.webp", alt: "A coiled tree hung with wisteria and slate-blue towers, beside it a golden birch with a few red-roofed houses", caption: "The weeping tree and the golden birch" },
      { src: "aerie-3.webp", alt: "A platform slung on ropes between two trees, a little tower house on it, rope bridges leading off to both", caption: "Halfway across: a platform slung between two trees" },
      { src: "aerie-4.webp", alt: "Close to the biggest tree: shingled roofs, rooms stacked at angles on platforms, a rope bridge, leaves all round", caption: "In among the houses" },
    ],
  },
];
