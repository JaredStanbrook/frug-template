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
// STAR JASMINE
// ==========================================
//
// The one memorable thing in the app (docs/design.md): a star jasmine vine
// that grows up beside the greeting on Today. The stem draws itself in, each
// pair of leaves unfurls as the growing tip passes it, tendrils curl out, and
// the pinwheel flowers open last with a quarter-turn — the way star jasmine
// petals are twisted.
//
// Every part carries `--at`: how far along the vine it sits, from 0 at the
// root to 1 at the tip. The CSS turns that into a delay, so a leaf appears
// exactly when the stem reaches it. Leaf positions and angles are computed from
// the vine's own curve, so they sit on the stem rather than near it. All of it
// is skipped under prefers-reduced-motion (see index.css).

type Pt = [number, number];

/** The main vine: an S climbing from the pot line to the top right. */
const VINE: [Pt, Pt, Pt, Pt][] = [
  [
    [70, 296],
    [30, 250],
    [170, 232],
    [138, 180],
  ],
  [
    [138, 180],
    [110, 136],
    [40, 118],
    [96, 72],
  ],
  [
    [96, 72],
    [128, 46],
    [178, 58],
    [196, 22],
  ],
];

const vinePath = `M${VINE[0][0].join(" ")}${VINE.map(([, c1, c2, e]) => `C${c1.join(" ")} ${c2.join(" ")} ${e.join(" ")}`).join("")}`;

/** Point and heading (degrees) at `u` ∈ [0, 1] along the whole vine. */
const along = (u: number): { p: Pt; deg: number } => {
  const scaled = Math.min(u, 0.9999) * VINE.length;
  const [p0, p1, p2, p3] = VINE[Math.floor(scaled)];
  const t = scaled - Math.floor(scaled);
  const mt = 1 - t;
  const point = (i: 0 | 1) =>
    mt * mt * mt * p0[i] + 3 * mt * mt * t * p1[i] + 3 * mt * t * t * p2[i] + t * t * t * p3[i];
  const slope = (i: 0 | 1) =>
    3 * mt * mt * (p1[i] - p0[i]) + 6 * mt * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return {
    p: [point(0), point(1)],
    deg: (Math.atan2(slope(1), slope(0)) * 180) / Math.PI,
  };
};

const f = (n: number) => n.toFixed(1);
const at = (u: number) => `--at:${u.toFixed(3)}`;

/** A glossy elliptic leaf with a pale midrib, pointing along +x from its base. */
const JasmineLeaf = ({
  x,
  y,
  deg,
  scale,
  u,
}: {
  x: number;
  y: number;
  deg: number;
  scale: number;
  u: number;
}) => (
  <g transform={`translate(${f(x)} ${f(y)}) rotate(${f(deg)}) scale(${scale.toFixed(2)})`}>
    <g class="grow" style={at(u)}>
      <path d="M0 0C4-5.5 13-7 21 0 13 7 4 5.5 0 0Z" class="fill-chart-2" />
      <path
        d="M1 0H17"
        class="stroke-background"
        stroke-width="0.9"
        stroke-linecap="round"
        opacity="0.55"
      />
    </g>
  </g>
);

/** Five twisted petals, like a pinwheel: the shape that names star jasmine. */
const PETAL = "M0-1.6C1.6-4 6.2-7.2 5.7-11.3 4.2-13.8.2-12.8-.7-9.8-1.4-7.2-1-4-0-1.6Z";

const JasmineFlower = ({
  x,
  y,
  scale = 1,
  turn = 0,
  u,
}: {
  x: number;
  y: number;
  scale?: number;
  turn?: number;
  u: number;
}) => (
  <g transform={`translate(${f(x)} ${f(y)}) rotate(${turn}) scale(${scale})`}>
    <g class="open" style={at(u)}>
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

const JasmineBud = ({ x, y, deg, u }: { x: number; y: number; deg: number; u: number }) => (
  <g transform={`translate(${f(x)} ${f(y)}) rotate(${deg})`}>
    <g class="grow" style={at(u)}>
      <path
        d="M0 0C2.4-3 2.6-8.5 0-12-2.6-8.5-2.4-3 0 0Z"
        class="fill-blossom stroke-chart-2"
        stroke-width="0.6"
        stroke-opacity="0.5"
      />
    </g>
  </g>
);

/** A cluster of flowers and buds at the end of a stem. */
const Cluster = ({
  x,
  y,
  u,
  flip = false,
}: {
  x: number;
  y: number;
  u: number;
  flip?: boolean;
}) => {
  const s = flip ? -1 : 1;
  return (
    <g>
      <JasmineBud x={x - 9 * s} y={y + 8} deg={-150 * s} u={u + 0.02} />
      <JasmineBud x={x + 15 * s} y={y + 9} deg={130 * s} u={u + 0.05} />
      <JasmineFlower x={x} y={y} scale={1.25} turn={10} u={u} />
      <JasmineFlower x={x + 17 * s} y={y - 5} scale={1.05} turn={40} u={u + 0.04} />
      <JasmineFlower x={x - 13 * s} y={y - 11} scale={0.95} turn={-20} u={u + 0.07} />
      <JasmineFlower x={x + 5 * s} y={y + 16} scale={0.85} turn={70} u={u + 0.1} />
    </g>
  );
};

/** A side stem leaving the vine at `u`, ending in a flower cluster. */
const Branch = ({ u, end, bend }: { u: number; end: Pt; bend: Pt }) => {
  const { p } = along(u);
  return (
    <path
      class="stem stroke-chart-2"
      pathLength="1"
      style={`${at(u)};--dur:0.7s`}
      d={`M${f(p[0])} ${f(p[1])}Q${bend.join(" ")} ${end.join(" ")}`}
      stroke-width="1.8"
      stroke-linecap="round"
    />
  );
};

/** A tendril curling off the stem at `u`, on one side or the other. */
const Tendril = ({ u, side }: { u: number; side: 1 | -1 }) => {
  const { p, deg } = along(u);
  return (
    <g transform={`translate(${f(p[0])} ${f(p[1])}) rotate(${f(deg + 90 * side)})`}>
      <path
        class="stem stroke-chart-2"
        pathLength="1"
        style={`${at(u)};--dur:0.9s`}
        d="M0 0C7-1 13 3 12 9 11 14 4 14 4 9 4 6 8 5 9 8"
        stroke-width="1.1"
        stroke-linecap="round"
        fill="none"
      />
    </g>
  );
};

/** Opposite pairs of leaves, smaller towards the growing tip. */
const LEAF_NODES = [0.07, 0.17, 0.27, 0.4, 0.52, 0.64, 0.76, 0.87];

export const StarJasmine = ({ class: cls = "h-72 w-60" }: { class?: string }) => (
  <svg
    viewBox="0 0 260 300"
    class={`jasmine ${cls}`}
    aria-hidden="true"
    focusable="false"
    fill="none"
  >
    <path
      class="stem stroke-chart-2"
      pathLength="1"
      style="--at:0;--dur:2.4s"
      d={vinePath}
      stroke-width="2.6"
      stroke-linecap="round"
    />

    <Branch u={0.33} bend={[196, 150]} end={[212, 118]} />
    <Branch u={0.6} bend={[46, 104]} end={[42, 70]} />

    <Tendril u={0.22} side={-1} />
    <Tendril u={0.47} side={1} />
    <Tendril u={0.8} side={-1} />

    {LEAF_NODES.flatMap((u) => {
      const { p, deg } = along(u);
      const scale = 1.3 - 0.55 * u;
      return [
        <JasmineLeaf x={p[0]} y={p[1]} deg={deg - 58} scale={scale} u={u} />,
        <JasmineLeaf x={p[0]} y={p[1]} deg={deg + 58} scale={scale} u={u + 0.01} />,
      ];
    })}

    <Cluster x={212} y={116} u={0.42} />
    <Cluster x={42} y={68} u={0.7} flip />
    <Cluster x={196} y={24} u={0.93} />
  </svg>
);
