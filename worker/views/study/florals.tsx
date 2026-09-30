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
// STAR JASMINE GARLAND
// ==========================================
//
// The one memorable thing in the app (docs/design.md): a single long spray of
// star jasmine running the width of the page under the greeting, like a
// garland border in an old book. Neat on purpose — one stem in an even wave,
// leaf pairs at regular intervals, five flower clusters evenly spaced and
// alternating above and below the stem.
//
// It grows from left to right: the stem draws in, each leaf pair unfurls as
// the tip passes it, and each cluster opens once the stem has reached it, with
// the quarter-turn of star jasmine's twisted petals. Every part carries `--t`,
// the second at which it appears. Skipped under prefers-reduced-motion (see
// index.css), which shows the finished garland.

type Pt = [number, number];
type Seg = [Pt, Pt, Pt, Pt];

/** Width and height of the drawing, in viewBox units. */
const W = 1000;
const H = 150;
const MID = 78;
const SWING = 16;
/** Seconds for the stem to grow from end to end. */
const GROW = 3;

/** An even wave: crests and troughs every 125 units, level tangents at each. */
const WAVE: Seg[] = Array.from({ length: 8 }, (_, i) => {
  const x0 = 12 + i * 122;
  const x1 = x0 + 122;
  const y0 = MID + (i % 2 === 0 ? -SWING : SWING);
  const y1 = MID + (i % 2 === 0 ? SWING : -SWING);
  return [
    [x0, y0],
    [x0 + 48, y0],
    [x1 - 48, y1],
    [x1, y1],
  ];
});

/** Point and heading (degrees) at `u` ∈ [0, 1] along the wave. */
const along = (u: number) => {
  const scaled = Math.min(Math.max(u, 0), 0.9999) * WAVE.length;
  const [p0, p1, p2, p3] = WAVE[Math.floor(scaled)];
  const t = scaled - Math.floor(scaled);
  const mt = 1 - t;
  const point = (i: 0 | 1) =>
    mt * mt * mt * p0[i] + 3 * mt * mt * t * p1[i] + 3 * mt * t * t * p2[i] + t * t * t * p3[i];
  const slope = (i: 0 | 1) =>
    3 * mt * mt * (p1[i] - p0[i]) + 6 * mt * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return { p: [point(0), point(1)] as Pt, deg: (Math.atan2(slope(1), slope(0)) * 180) / Math.PI };
};

const WAVE_PATH = `M${WAVE[0][0].join(" ")}${WAVE.map(([, a, b, c]) => `C${a.join(" ")} ${b.join(" ")} ${c.join(" ")}`).join("")}`;

const f = (n: number) => n.toFixed(1);
const when = (t: number) => `--t:${t.toFixed(2)}`;
/** The stem reaches `u` at this second. */
const reach = (u: number) => u * GROW;

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
  <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${turn}) scale(${scale})`}>
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
  <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${deg})`}>
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

/** Leaf pairs at a steady rhythm, a touch smaller towards either end. */
const LEAF_STEP = 1 / 36;
const LEAVES = Array.from({ length: 35 }, (_, i) => (i + 0.6) * LEAF_STEP).flatMap((u) => {
  const { p, deg } = along(u);
  const taper = 1 - Math.abs(u - 0.5) * 0.5;
  const t = reach(u);
  return [
    { p, deg: deg - 52, scale: 1.05 * taper, t },
    { p, deg: deg + 52, scale: 1.05 * taper, t: t + 0.04 },
  ];
});

/**
 * Five clusters, evenly spaced and alternating sides. Each is the same tidy
 * arrangement — a centre flower, two either side, two buds — on a short stalk.
 */
const CLUSTERS = [0.1, 0.3, 0.5, 0.7, 0.9].map((u, i) => {
  const side = i % 2 === 0 ? -1 : 1; // -1 above the stem, 1 below
  const { p } = along(u);
  const end: Pt = [p[0] + 6, p[1] + side * 34];
  const t = reach(u) + 0.25;
  return {
    stalk: {
      d: `M${f(p[0])} ${f(p[1])}Q${f(p[0] - 4)} ${f(p[1] + side * 18)} ${f(end[0])} ${f(end[1])}`,
      t: reach(u),
    },
    flowers: [
      { p: end, scale: 1.35, turn: 8, t },
      { p: [end[0] - 18, end[1] + side * 5] as Pt, scale: 1.05, turn: 40, t: t + 0.12 },
      { p: [end[0] + 18, end[1] + side * 5] as Pt, scale: 1.05, turn: -24, t: t + 0.18 },
    ],
    buds: [
      { p: [end[0] - 9, end[1] + side * 13] as Pt, deg: side === -1 ? -25 : 205, t: t - 0.05 },
      { p: [end[0] + 10, end[1] + side * 13] as Pt, deg: side === -1 ? 25 : 155, t: t - 0.02 },
    ],
  };
});

export const StarJasmine = ({ class: cls = "w-full" }: { class?: string }) => (
  <svg
    viewBox={`0 0 ${W} ${H}`}
    preserveAspectRatio="xMinYMid slice"
    class={`jasmine ${cls}`}
    aria-hidden="true"
    focusable="false"
    fill="none"
  >
    <path
      class="stem stroke-chart-2"
      pathLength="1"
      style={`--t:0;--dur:${GROW}s`}
      d={WAVE_PATH}
      stroke-width="2.4"
      stroke-linecap="round"
    />
    {CLUSTERS.map((c) => (
      <path
        class="stem stroke-chart-2"
        pathLength="1"
        style={`${when(c.stalk.t)};--dur:0.35s`}
        d={c.stalk.d}
        stroke-width="1.6"
        stroke-linecap="round"
      />
    ))}
    {LEAVES.map((l) => (
      <JasmineLeaf {...l} />
    ))}
    {CLUSTERS.flatMap((c) => c.buds.map((b) => <JasmineBud {...b} />))}
    {CLUSTERS.flatMap((c) => c.flowers.map((fl) => <JasmineFlower {...fl} />))}
  </svg>
);
