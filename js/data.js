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
    slug: "aerie",
    title: "Aerie",
    kicker: "A city in the trees",
    tagline: "A city of treehouses in four giant trees, over the mist at moonrise.",
    description:
      "Some two hundred and forty crooked houses crowd four giant trees, each its own kind with its own town: stacked two and three high at odd angles, perched on brackets, swinging in pods on ropes. Limbs reach for the neighbouring trees with rope bridges across, cable cars run between them and down to a station in the mist, lifts ride up timber towers, and water runs from cisterns down the bark in pipes and falls from tub to tub. Fly round the whole group or round one tree at a time.",
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
      { src: "aerie-1.webp", alt: "Giant trees full of lit treehouses, rope bridges strung between their limbs, lift towers rising from the mist, a cable car, the moon behind", caption: "Moonrise over the mist" },
      { src: "aerie-2.webp", alt: "A tank of water on a high platform, a copper pipe running from it along the railing to a spout, water falling from tub to tub down past the houses", caption: "Water from the cistern, falling from tub to tub" },
      { src: "aerie-3.webp", alt: "A coiled tree hung with wisteria and slate-blue towers, beside it a golden birch with a few red-roofed houses", caption: "The weeping tree and the golden birch" },
      { src: "aerie-4.webp", alt: "A cable car cabin on twin cables running down from the trees to a station hut on a timber tower standing in the mist", caption: "The cable car down to the valley station" },
      { src: "aerie-5.webp", alt: "Under a platform of red-roofed houses in the golden birch, water pouring from a pipe into the mist beside a lift tower", caption: "The last fall, into the mist" },
    ],
  },
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
