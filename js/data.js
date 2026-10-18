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
    kicker: "A city in a tree",
    tagline: "A village of crooked houses stacked up one giant tree, above the mist at moonrise.",
    description:
      "Some eighty houses crowd the trunk and the great limbs of a single tree: perched on brackets, stacked two and three high on each other's roofs at odd angles, a pod swinging on ropes, a barrel, an onion dome, a glass greenhouse, witch's-hat towers. Platforms ring the trunk in broken arcs, a spiral stair climbs inside them, rope bridges and strings of lights run between the houses, ivy hangs off the edges, and the mist lies far below. Fly round it on a circle, up and down, closer or further out.",
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
      { src: "aerie-1.webp", alt: "A giant tree carrying dozens of lit treehouses on platforms and limbs, the moon behind it, mist below", caption: "Moonrise over the mist" },
      { src: "aerie-2.webp", alt: "The tree city at night, paper lanterns rising into the sky past its lit windows", caption: "Lanterns let go at nightfall" },
      { src: "aerie-3.webp", alt: "The whole tree from further out: its dense crown above, houses stacked up the trunk below", caption: "The whole tree, from out over the mist" },
      { src: "aerie-4.webp", alt: "Close among the houses: shingled roofs, a stair between platforms, rooms stacked at angles, leaves all round", caption: "In among the houses" },
    ],
  },
  {
    slug: "hearth",
    title: "Hearth",
    kicker: "A cabin in the spruces",
    tagline: "An A-frame in an old spruce forest on a cold autumn evening.",
    description:
      "Mist between the trunks, a floor of needles, bracken gone rusty and larches turned gold. In a small clearing an A-frame glows: a lamp hangs in the double-height room, a fire burns in the stone hearth, someone walks past the windows, and a string of lights hangs over the deck. Smoke rises from the stone chimney, firewood is stacked under a lean-to and in a round stack, and roe deer, a fox and hares wander the trails round the house.",
    date: "2026-10",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Walk round the house and come closer: a flagstone path to the deck, a stone back wall with the chimney built into it",
      "The room behind the glass is ray-traced in a shader: loft, pendant lamp, string lights, a hearth that flares when you stoke it",
      "Spruce, pine and larch branches painted needle by needle at startup; wind in the crowns, a raven, the fire and at night an owl, all synthesised live",
    ],
    play: "hearth/",
    label: "Enter",
    shots: [
      { src: "hearth-1.webp", alt: "A glowing A-frame cabin in a misty spruce forest at dusk, smoke rising from its chimney, a flagstone path leading to it", caption: "Through the trunks at dusk" },
      { src: "hearth-2.webp", alt: "The front of the A-frame up close: a string of lights over the deck, lit windows, pumpkins on the steps, a chopping block with an axe", caption: "Up close: string lights over the deck" },
      { src: "hearth-3.webp", alt: "The back of the cabin: a stone gable wall with a stone chimney rising above the roof", caption: "The stone wall and chimney at the back" },
      { src: "hearth-4.webp", alt: "The cabin at night, only its windows lit, glowing in the mist", caption: "Nightfall" },
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
    shots: [
      { src: "storm-1.webp", alt: "A lighthouse on a rock at night, its beam sweeping through rain over a stormy sea", caption: "The beam through the rain" },
      { src: "storm-2.webp", alt: "The same lighthouse lit by a lightning strike", caption: "Lightning" },
    ],
  },
  {
    slug: "torus",
    title: "Torus",
    kicker: "A city in orbit",
    tagline: "A Stanford torus turning once a minute, 8,000 km above the Earth.",
    description:
      "A wheel 1.8 km across, glazed so you look in on a dense, green city: a river round the whole ring with a monorail over it, boats and ducks, people walking the promenades, cars on the boulevards, market squares full of stalls and crowds, sheep and cows in the fields, birds flying under the glass. Earth rolls through the sky as the station orbits, always half lit, and swallows the Moon on its way past. Zoom from the whole wheel through the glass into the air over the rooftops.",
    date: "2026-07",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "One turn a minute gives about 1 g on the floor; close in, the camera rides along with the spin and the stars wheel past",
      "Some 54,000 people, 5,000 animals, 564 cars, buses and vans, 70 boats, ten trains, five stations and eight markets, all moving",
      "Earth at its true size from 8,000 km, and sound synthesised live: a rumble, machinery hum, the structure groaning under the spin",
    ],
    play: "torus/",
    label: "Enter",
    shots: [
      { src: "torus-1.webp", alt: "A glazed ring station with spokes and a hub seen from below, the half-lit Earth behind it", caption: "The wheel from below, Earth rising behind it" },
      { src: "torus-2.webp", alt: "The city inside the ring seen through its glass: a river, a monorail, blocks and parks", caption: "The land on the far side, upright through the inner glass" },
      { src: "torus-3.webp", alt: "Close view of blocks, a river with a monorail, and a market square with striped stalls and a big tree", caption: "A market square by the river" },
      { src: "torus-4.webp", alt: "From 60 m over the river: a monorail station with planted canopies, boats, crowds on the promenades and a market", caption: "Over the river: a monorail station, boats and the market" },
      { src: "torus-5.webp", alt: "Street level beside the river: a monorail station on its piers, a river bus and a rowing boat, people walking under the trees", caption: "Down by the river, under the monorail" },
    ],
  },
  {
    slug: "shade",
    title: "Shade",
    kicker: "A city that grew its own shade",
    tagline: "An overgrown megacity against a low sun.",
    description:
      "Towers swallowed by vines, trees bursting from the facades, a vault of arches and lianas over the avenue, and a river where the lanes used to be. It holds still like a photograph; what moves has to be found: gusts over the canopy, swifts, storks circling, gondolas, traffic on an overgrown viaduct, drifting seeds and heat shimmer.",
    date: "2026-07",
    genre: "Scene",
    tags: ["three.js", "GLSL", "procedural", "WebAudio"],
    highlights: [
      "Turn the view through 360°, or move the pointer down to drop to street level over the river",
      "An elevated highway with a tied-arch bridge wrapped in lianas, carrying pods, vans and buses",
      "Cicadas, wind in the leaves, the river and birds, all synthesised live; send a gust rolling over the canopy",
    ],
    play: "shade/",
    label: "Enter",
    shots: [
      { src: "shade-1.webp", alt: "Overgrown towers and hanging vines against a low sun, traffic crossing on an elevated highway", caption: "Looking into the sun, the highway crossing the avenue" },
      { src: "shade-2.webp", alt: "Overgrown towers and a canopy roof seen from another direction", caption: "Turned round, away from the sun" },
      { src: "shade-3.webp", alt: "Street level over the river, looking up into a vault of arches and vines", caption: "Down at the river" },
    ],
  },
];
