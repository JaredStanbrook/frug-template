// worker/views/study/florals.tsx
//
// Hand-drawn floral ornaments. Pure decoration: every one is aria-hidden and
// coloured with theme tokens (`fill-chart-*`, `stroke-*`, `currentColor`), so
// they recolour with the theme instead of being artwork for one mode.
//
// Colour classes are written out whole — Tailwind only generates class names
// it can find complete in the source.

const PETAL_ANGLES = [0, 72, 144, 216, 288];

type Fill =
  | "fill-chart-1"
  | "fill-chart-2"
  | "fill-chart-3"
  | "fill-chart-4"
  | "fill-chart-5"
  | "fill-primary";

/** A five-petal blossom. */
export const Blossom = ({
  class: cls = "h-4 w-4",
  petal = "fill-chart-1",
  centre = "fill-chart-4",
}: {
  class?: string;
  petal?: Fill;
  centre?: Fill;
}) => (
  <svg viewBox="0 0 24 24" class={`shrink-0 ${cls}`} aria-hidden="true" focusable="false">
    {PETAL_ANGLES.map((a) => (
      <ellipse
        cx="12"
        cy="6.4"
        rx="3.7"
        ry="5.2"
        transform={`rotate(${a} 12 12)`}
        class={petal}
        opacity="0.9"
      />
    ))}
    <circle cx="12" cy="12" r="2.8" class={centre} />
  </svg>
);

/** A leaf, pointing right from the origin, for building sprigs and wreaths. */
const leaf = "M0 0C5-5 13-5 17 0 13 5 5 5 0 0Z";

/** A curving sprig with leaves, a bud and two blossoms. */
export const Sprig = ({ class: cls = "h-16 w-32" }: { class?: string }) => (
  <svg viewBox="0 0 140 70" class={cls} aria-hidden="true" focusable="false" fill="none">
    <path
      d="M6 64C34 50 64 38 118 16"
      class="stroke-chart-2"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="M60 41C66 30 70 24 80 18"
      class="stroke-chart-2"
      stroke-width="1.6"
      stroke-linecap="round"
    />
    {[
      [22, 56, -40],
      [36, 50, 30],
      [48, 45, -35],
      [92, 27, 25],
      [100, 23, -45],
    ].map(([x, y, r]) => (
      <path
        d={leaf}
        transform={`translate(${x} ${y}) rotate(${r})`}
        class="fill-chart-2"
        opacity="0.85"
      />
    ))}
    <g transform="translate(106 2) scale(1.25)">
      {PETAL_ANGLES.map((a) => (
        <ellipse
          cx="12"
          cy="6.4"
          rx="3.7"
          ry="5.2"
          transform={`rotate(${a} 12 12)`}
          class="fill-chart-1"
          opacity="0.9"
        />
      ))}
      <circle cx="12" cy="12" r="2.8" class="fill-chart-4" />
    </g>
    <g transform="translate(70 4) scale(.85)">
      {PETAL_ANGLES.map((a) => (
        <ellipse
          cx="12"
          cy="6.4"
          rx="3.7"
          ry="5.2"
          transform={`rotate(${a} 12 12)`}
          class="fill-chart-5"
          opacity="0.85"
        />
      ))}
      <circle cx="12" cy="12" r="2.8" class="fill-chart-4" />
    </g>
    <ellipse
      cx="14"
      cy="58"
      rx="3"
      ry="4.5"
      transform="rotate(-60 14 58)"
      class="fill-chart-1"
      opacity="0.7"
    />
  </svg>
);

/** A ring of leaves with a blossom at its foot, framing an icon. */
export const Wreath = ({ class: cls = "h-20 w-20" }: { class?: string }) => {
  const leaves = [];
  // Leave a gap at the bottom (around 90°) for the blossom.
  for (let deg = 120; deg <= 420; deg += 22) {
    const rad = (deg * Math.PI) / 180;
    const x = 50 + 38 * Math.cos(rad);
    const y = 50 + 38 * Math.sin(rad);
    const flip = deg % 44 === 0 ? 1 : -1;
    leaves.push(
      <path
        d={leaf}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(deg + 90 + flip * 25).toFixed(0)}) scale(.62)`}
        class="fill-chart-2"
        opacity="0.8"
      />,
    );
  }
  return (
    <svg viewBox="0 0 100 100" class={cls} aria-hidden="true" focusable="false" fill="none">
      <circle cx="50" cy="50" r="38" class="stroke-chart-2" stroke-width="1.2" opacity="0.6" />
      {leaves}
      <g transform="translate(38 76)">
        {PETAL_ANGLES.map((a) => (
          <ellipse
            cx="12"
            cy="6.4"
            rx="3.7"
            ry="5.2"
            transform={`rotate(${a} 12 12)`}
            class="fill-chart-1"
          />
        ))}
        <circle cx="12" cy="12" r="2.8" class="fill-chart-4" />
      </g>
    </svg>
  );
};

/** A divider: a thread either side of a little blossom and two leaves. */
export const FloralRule = ({ class: cls = "" }: { class?: string }) => (
  <div class={`flex items-center gap-3 text-border ${cls}`} aria-hidden="true">
    <span class="h-px flex-1 bg-current"></span>
    <svg viewBox="0 0 60 20" class="h-5 w-14 shrink-0" focusable="false">
      <path d={leaf} transform="translate(8 10) scale(.85)" class="fill-chart-2" />
      <path d={leaf} transform="translate(52 10) rotate(180) scale(.85)" class="fill-chart-2" />
      <g transform="translate(21 1) scale(.75)">
        {PETAL_ANGLES.map((a) => (
          <ellipse
            cx="12"
            cy="6.4"
            rx="3.7"
            ry="5.2"
            transform={`rotate(${a} 12 12)`}
            class="fill-chart-1"
          />
        ))}
        <circle cx="12" cy="12" r="2.8" class="fill-chart-4" />
      </g>
    </svg>
    <span class="h-px flex-1 bg-current"></span>
  </div>
);

// ==========================================
// STAR JASMINE IN SPRING
// ==========================================
//
// The one memorable thing in the app (docs/design.md): a star jasmine in full
// spring growth, climbing around the greeting on Today. Two stems twine up
// together, a runner trails across the top, a low shoot sprawls sideways.
// Leaves unfurl as each growing tip passes them, tendrils curl, clusters of
// pinwheel flowers open with a quarter-turn, and a few loose petals drift
// down once and are gone.
//
// Wild, but not random on each load: the variation comes from a seeded
// generator, so the server renders the same vine every time and the page
// never shifts between requests.
//
// Every part carries `--t`, the second at which it should appear, computed
// from where it sits on its stem and when that stem starts growing. All of it
// is skipped under prefers-reduced-motion (see index.css), which shows the
// finished vine and no falling petals.

type Pt = [number, number];
type Seg = [Pt, Pt, Pt, Pt];

/** mulberry32: a tiny seeded PRNG, so the "random" vine is the same every render. */
const seeded = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Point and heading (degrees) at `u` ∈ [0, 1] along a chain of cubic segments. */
const sampler = (segs: Seg[]) => (u: number) => {
  const scaled = Math.min(Math.max(u, 0), 0.9999) * segs.length;
  const [p0, p1, p2, p3] = segs[Math.floor(scaled)];
  const t = scaled - Math.floor(scaled);
  const mt = 1 - t;
  const point = (i: 0 | 1) =>
    mt * mt * mt * p0[i] + 3 * mt * mt * t * p1[i] + 3 * mt * t * t * p2[i] + t * t * t * p3[i];
  const slope = (i: 0 | 1) =>
    3 * mt * mt * (p1[i] - p0[i]) + 6 * mt * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return { p: [point(0), point(1)] as Pt, deg: (Math.atan2(slope(1), slope(0)) * 180) / Math.PI };
};

const pathOf = (segs: Seg[]) =>
  `M${segs[0][0].join(" ")}${segs.map(([, a, b, c]) => `C${a.join(" ")} ${b.join(" ")} ${c.join(" ")}`).join("")}`;

const f = (n: number) => n.toFixed(1);
const when = (t: number) => `--t:${t.toFixed(2)}`;

interface Stem {
  segs: Seg[];
  /** Seconds after load that this stem starts growing. */
  start: number;
  /** Seconds it takes to reach its tip. */
  dur: number;
  width: number;
  /** Where along the stem flower clusters branch off, and to which side. */
  clusters: { u: number; side: 1 | -1; reach: number }[];
  leafScale: number;
}

const V1: Seg[] = [
  [
    [300, 418],
    [250, 360],
    [392, 332],
    [360, 272],
  ],
  [
    [360, 272],
    [330, 215],
    [248, 200],
    [300, 146],
  ],
  [
    [300, 146],
    [346, 96],
    [442, 122],
    [456, 62],
  ],
  [
    [456, 62],
    [466, 30],
    [430, 12],
    [398, 22],
  ],
];
const V2: Seg[] = [
  [
    [334, 418],
    [404, 372],
    [300, 322],
    [332, 262],
  ],
  [
    [332, 262],
    [362, 204],
    [424, 216],
    [396, 160],
  ],
  [
    [396, 160],
    [370, 110],
    [302, 106],
    [330, 54],
  ],
];
const onV1 = sampler(V1);
const RUNNER_FROM = onV1(0.62).p;
const V3: Seg[] = [
  [RUNNER_FROM, [270, 82], [206, 116], [160, 72]],
  [
    [160, 72],
    [122, 36],
    [70, 66],
    [36, 44],
  ],
];
const SPRAWL_FROM = onV1(0.16).p;
const V4: Seg[] = [[SPRAWL_FROM, [416, 388], [452, 338], [482, 346]]];

const STEMS: Stem[] = [
  {
    segs: V1,
    start: 0,
    dur: 2.6,
    width: 3,
    leafScale: 1,
    clusters: [
      { u: 0.3, side: 1, reach: 46 },
      { u: 0.5, side: -1, reach: 40 },
      { u: 0.78, side: 1, reach: 36 },
      { u: 1, side: 1, reach: 0 },
    ],
  },
  {
    segs: V2,
    start: 0.35,
    dur: 2.4,
    width: 2.4,
    leafScale: 0.9,
    clusters: [
      { u: 0.42, side: 1, reach: 42 },
      { u: 0.7, side: -1, reach: 34 },
      { u: 1, side: 1, reach: 0 },
    ],
  },
  {
    segs: V3,
    start: 0.62 * 2.6,
    dur: 1.9,
    width: 2,
    leafScale: 0.8,
    clusters: [
      { u: 0.35, side: 1, reach: 28 },
      { u: 0.62, side: -1, reach: 30 },
      { u: 1, side: 1, reach: 0 },
    ],
  },
  {
    segs: V4,
    start: 0.16 * 2.6,
    dur: 1.2,
    width: 1.8,
    leafScale: 0.75,
    clusters: [{ u: 1, side: 1, reach: 0 }],
  },
];

/** A glossy elliptic leaf with a pale midrib, pointing along +x from its base. */
const JasmineLeaf = ({ p, deg, scale, t }: { p: Pt; deg: number; scale: number; t: number }) => (
  <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${f(deg)}) scale(${scale.toFixed(2)})`}>
    <g class="grow" style={when(t)}>
      <path d="M0 0C4-5.5 13-7 21 0 13 7 4 5.5 0 0Z" class="fill-chart-2" />
      <path
        d="M1 0H17"
        class="stroke-background"
        stroke-width="0.9"
        stroke-linecap="round"
        opacity="0.5"
      />
    </g>
  </g>
);

/** Five twisted petals, like a pinwheel: the shape that names star jasmine. */
const PETAL = "M0-1.6C1.6-4 6.2-7.2 5.7-11.3 4.2-13.8.2-12.8-.7-9.8-1.4-7.2-1-4-0-1.6Z";

const JasmineFlower = ({
  p,
  scale,
  turn,
  t,
}: {
  p: Pt;
  scale: number;
  turn: number;
  t: number;
}) => (
  <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${f(turn)}) scale(${scale.toFixed(2)})`}>
    <g class="open" style={when(t)}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          d={PETAL}
          transform={`rotate(${a})`}
          class="fill-blossom stroke-chart-2"
          stroke-width="0.5"
          stroke-opacity="0.45"
        />
      ))}
      <circle r="1.7" class="fill-chart-4" />
    </g>
  </g>
);

const JasmineBud = ({ p, deg, t }: { p: Pt; deg: number; t: number }) => (
  <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${f(deg)})`}>
    <g class="grow" style={when(t)}>
      <path
        d="M0 0C2.4-3 2.6-8.5 0-12-2.6-8.5-2.4-3 0 0Z"
        class="fill-blossom stroke-chart-2"
        stroke-width="0.6"
        stroke-opacity="0.5"
      />
    </g>
  </g>
);

/** A loose petal that drifts down once after the vine has flowered. */
const FallingPetal = ({
  p,
  dx,
  dy,
  spin,
  t,
}: {
  p: Pt;
  dx: number;
  dy: number;
  spin: number;
  t: number;
}) => (
  <g transform={`translate(${f(p[0])} ${f(p[1])})`}>
    <g class="petal" style={`${when(t)};--dx:${f(dx)}px;--dy:${f(dy)}px;--spin:${f(spin)}deg`}>
      <path
        d={PETAL}
        class="fill-blossom stroke-chart-2"
        stroke-width="0.5"
        stroke-opacity="0.45"
      />
    </g>
  </g>
);

/** Build every part of the vine once, at module load, from the seeded generator. */
const buildGarden = () => {
  const rand = seeded(2026);
  const stems: { d: string; width: number; start: number; dur: number }[] = [];
  const tendrils: { p: Pt; deg: number; t: number }[] = [];
  const twigs: { d: string; t: number }[] = [];
  const leaves: { p: Pt; deg: number; scale: number; t: number }[] = [];
  const buds: { p: Pt; deg: number; t: number }[] = [];
  const flowers: { p: Pt; scale: number; turn: number; t: number }[] = [];
  const petals: { p: Pt; dx: number; dy: number; spin: number; t: number }[] = [];

  for (const stem of STEMS) {
    const at = sampler(stem.segs);
    const timeAt = (u: number) => stem.start + u * stem.dur;
    stems.push({ d: pathOf(stem.segs), width: stem.width, start: stem.start, dur: stem.dur });

    // Leaves: uneven spacing, mostly opposite pairs, sometimes a single one.
    let side: 1 | -1 = 1;
    for (let u = 0.03 + rand() * 0.03; u < 0.96; u += 0.045 + rand() * 0.035) {
      const { p, deg } = at(u);
      const scale = (1.3 - 0.55 * u) * (0.75 + rand() * 0.5) * stem.leafScale;
      const spread = 42 + rand() * 30;
      const t = timeAt(u);
      if (rand() < 0.78) {
        leaves.push({ p, deg: deg - spread, scale, t });
        leaves.push({
          p,
          deg: deg + spread + (rand() - 0.5) * 16,
          scale: scale * (0.85 + rand() * 0.3),
          t: t + 0.03,
        });
      } else {
        leaves.push({ p, deg: deg + side * spread, scale, t });
      }
      if (rand() < 0.22) tendrils.push({ p, deg: deg + 90 * side, t });
      side = side === 1 ? -1 : 1;
    }

    // Clusters: on a short twig off the stem, or right at the tip.
    for (const c of stem.clusters) {
      const { p, deg } = at(c.u);
      const t = timeAt(c.u);
      const heading = ((deg - 70 * c.side) * Math.PI) / 180;
      const end: Pt = [p[0] + Math.cos(heading) * c.reach, p[1] + Math.sin(heading) * c.reach];
      if (c.reach > 0) {
        const bend: Pt = [
          (p[0] + end[0]) / 2 + Math.cos(heading + c.side) * c.reach * 0.35,
          (p[1] + end[1]) / 2 + Math.sin(heading + c.side) * c.reach * 0.35,
        ];
        twigs.push({
          d: `M${f(p[0])} ${f(p[1])}Q${f(bend[0])} ${f(bend[1])} ${f(end[0])} ${f(end[1])}`,
          t,
        });
      }

      const count = 4 + Math.floor(rand() * 4);
      // Twigs take 0.5s to reach their end: nothing appears before the twig does.
      const reached = t + (c.reach > 0 ? 0.5 : 0);
      const bloomAt = reached + 0.2;
      for (let k = 0; k < count; k++) {
        const angle = rand() * Math.PI * 2;
        const dist = k === 0 ? 0 : 9 + rand() * 15;
        flowers.push({
          p: [end[0] + Math.cos(angle) * dist, end[1] + Math.sin(angle) * dist],
          scale: 0.8 + rand() * 0.55,
          turn: rand() * 72,
          t: bloomAt + k * 0.07,
        });
      }
      for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
        const angle = rand() * Math.PI * 2;
        const dist = 14 + rand() * 12;
        buds.push({
          p: [end[0] + Math.cos(angle) * dist, end[1] + Math.sin(angle) * dist],
          deg: (angle * 180) / Math.PI + 90,
          t: reached + k * 0.05,
        });
      }
      // One cluster in two lets a petal go.
      if (rand() < 0.5) {
        petals.push({
          p: end,
          dx: (rand() - 0.5) * 80,
          dy: 90 + rand() * 120,
          spin: 180 + rand() * 360,
          t: bloomAt + 1.2 + rand() * 1.4,
        });
      }
    }
  }
  return { stems, tendrils, twigs, leaves, buds, flowers, petals };
};

const GARDEN = buildGarden();

export const StarJasmine = ({ class: cls = "h-[26rem] w-[32rem]" }: { class?: string }) => (
  <svg
    viewBox="0 0 520 420"
    preserveAspectRatio="xMaxYMid meet"
    class={`jasmine ${cls}`}
    aria-hidden="true"
    focusable="false"
    fill="none"
  >
    {GARDEN.stems.map((s) => (
      <path
        class="stem stroke-chart-2"
        pathLength="1"
        style={`${when(s.start)};--dur:${s.dur}s`}
        d={s.d}
        stroke-width={s.width}
        stroke-linecap="round"
      />
    ))}
    {GARDEN.twigs.map((tw) => (
      <path
        class="stem stroke-chart-2"
        pathLength="1"
        style={`${when(tw.t)};--dur:0.5s`}
        d={tw.d}
        stroke-width="1.5"
        stroke-linecap="round"
      />
    ))}
    {GARDEN.tendrils.map(({ p, deg, t }) => (
      <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${f(deg)})`}>
        <path
          class="stem stroke-chart-2"
          pathLength="1"
          style={`${when(t)};--dur:0.9s`}
          d="M0 0C7-1 13 3 12 9 11 14 4 14 4 9 4 6 8 5 9 8"
          stroke-width="1.1"
          stroke-linecap="round"
        />
      </g>
    ))}
    {GARDEN.leaves.map((l) => (
      <JasmineLeaf {...l} />
    ))}
    {GARDEN.buds.map((b) => (
      <JasmineBud {...b} />
    ))}
    {GARDEN.flowers.map((fl) => (
      <JasmineFlower {...fl} />
    ))}
    {GARDEN.petals.map((pt) => (
      <FallingPetal {...pt} />
    ))}
  </svg>
);
