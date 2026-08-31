/* ---------------------------------------------------------------------------
   The liquid model. One definition, used twice: the baker imports it, and
   inlines this file's source into the rig between its WATER markers.

   The glass is a convex quad in its own frame. Water is that quad intersected
   with a half-plane whose normal is world-down written in glass space — so the
   surface stays level however far the glass turns. The cut is solved for a
   given volume, which is what makes the mass behave like a mass: it pools to
   the low side, climbs the wall, finds the rim on its own, and starts pouring
   without anyone keyframing it.

   The numbers come from default.svg — the top row of bubbles is the resting
   surface, and its radius and spacing set the scallop along every surface after.
   --------------------------------------------------------------------------- */

const GLASS = [[20, 18], [44.5, 18], [39.0563, 47.0801], [25.7106, 47.0801]];
const MOUTH = [[20, 18], [44.5, 18]];
const PIVOT = [32.1547, 32.0642];

const REST_LEVEL = 31.6327;   /* y of the top bubble row in default.svg */
const SCALLOP_R = 3.3905;     /* its radius */
const SCALLOP_GAP = 5;        /* its spacing */
const WALL_INSET = 1.2;
const SCALLOP_MAX = 24;   /* pool size the rig allocates */
const FLOW_DEPTH = 5.5;       /* how far the lip sits under the surface at full flow */

const dot = (p, d) => p[0] * d[0] + p[1] * d[1];

function polyArea(poly){
  let a = 0;
  for (let i = 0; i < poly.length; i++){
    const A = poly[i], B = poly[(i + 1) % poly.length];
    a += A[0] * B[1] - B[0] * A[1];
  }
  return Math.abs(a) / 2;
}

/* Sutherland–Hodgman against one half-plane: keep the deep side, dot >= c. */
function clipDeep(poly, d, c){
  const out = [];
  for (let i = 0; i < poly.length; i++){
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const da = dot(A, d) - c, db = dot(B, d) - c;
    if (da >= 0) out.push(A);
    if ((da >= 0) !== (db >= 0)){
      const t = da / (da - db);
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  return out;
}

/* World "down", written in the glass's own frame. */
function downIn(deg){ const r = deg * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; }

/* Bisect for the surface height that holds `vol`. Area falls as c rises. */
function levelFor(d, vol){
  let lo = Infinity, hi = -Infinity;
  for (const p of GLASS){ const v = dot(p, d); if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < 30; i++){
    const mid = (lo + hi) / 2;
    if (polyArea(clipDeep(GLASS, d, mid)) > vol) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const REST_VOL = polyArea(clipDeep(GLASS, [0, 1], REST_LEVEL));
const lipDepth = d => Math.max(dot(MOUTH[0], d), dot(MOUTH[1], d));
const lipPoint = d => (dot(MOUTH[0], d) > dot(MOUTH[1], d) ? MOUTH[0] : MOUTH[1]);

function spinTo(p, deg){
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = p[0] - PIVOT[0], dy = p[1] - PIVOT[1];
  return [PIVOT[0] + dx * c - dy * s, PIVOT[1] + dx * s + dy * c];
}

/* The body of water at a given tilt and fullness, in glass space. */
function water(deg, fill){
  const d = downIn(deg);
  const c = levelFor(d, Math.max(3, fill * REST_VOL));
  const poly = clipDeep(GLASS, d, c);

  /* The two vertices the cut just created are the surface; scallop them so the
     mass keeps the icon's bubbled edge at any angle. The bubble is sized to the
     water under it — at rest that is the export's own radius, and as the glass
     empties it shrinks with the sliver instead of bulging out onto blue. */
  const surf = poly.filter(p => Math.abs(dot(p, d) - c) < 1e-6);
  const scallops = [];
  if (surf.length >= 2){
    const A = surf[0], B = surf[1];
    let ux = B[0] - A[0], uy = B[1] - A[1];
    const len = Math.hypot(ux, uy);
    if (len > 0.6){
      ux /= len; uy /= len;
      let depth = 0;
      for (const q of poly) depth = Math.max(depth, dot(q, d) - c);
      const r = Math.min(SCALLOP_R, depth * 0.85, len * 0.55);
      const gap = SCALLOP_GAP * (r / SCALLOP_R);
      const inset = WALL_INSET * (r / SCALLOP_R);
      const span = len - 2 * inset;
      if (r > 0.15 && span > 0.5){
        const n = Math.min(SCALLOP_MAX, Math.max(2, Math.round(span / gap) + 1));
        for (let i = 0; i < n; i++){
          const t = inset + span * (i / (n - 1));
          scallops.push([A[0] + ux * t, A[1] + uy * t, r]);
        }
      } else if (r > 0.15){
        scallops.push([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, r]);
      }
    }
  }

  const flow = Math.max(0, Math.min(1, (lipDepth(d) - c) / FLOW_DEPTH));
  return { poly, scallops, flow, level: c, lip: lipPoint(d) };
}

/* Where the surface sits on screen. The face is painted on the water, so when
   the glass drains further than the timeline expected, this is how far it has
   to ride down to stay on it. */
function surfaceY(deg, fill){
  const d = downIn(deg);
  return PIVOT[1] + levelFor(d, Math.max(3, fill * REST_VOL)) - dot(PIVOT, d);
}

/* ---------------------------------------------------------------------------
   The spray, in world space. Water leaves along the mouth's outward normal and
   gravity bends it down; it holds together near the lip and scatters as it
   goes. The scatter table is the four droplets from the pour export, measured
   off that parabola — the artist's spread, reused as break-up.
   --------------------------------------------------------------------------- */
const SPRAY = [[0.1, 0.4], [0.2, 2.2], [0.3, -4.2], [0.4, -3.9], [0.5, 0.7], [0.2, -1.4],
               [0.35, 2.6], [0.3, -2.2], [0.45, 1.1], [0.15, -0.9], [0.4, 1.7], [0.25, -2.9]];
const SPRAY_N = SPRAY.length;
const SPRAY_LEN = 10.5;    /* how far a drop travels along the exit normal */
const SPRAY_G = 6.4;       /* how hard gravity bends it over that distance */
const SPRAY_MAX = 1.35;    /* where the trail ends */
const SPRAY_HOLD = 0.34;   /* it leaves the lip as one body, and breaks after this */

function sprayAt(s, i, lipW, nrm){
  const j = SPRAY[i % SPRAY_N];
  /* coherent at the lip, scattering as it falls — a stream, then droplets */
  const k = Math.max(0, Math.min(1, (s - SPRAY_HOLD) / 0.5));
  return [lipW[0] + nrm[0] * SPRAY_LEN * s + j[0] * k,
          lipW[1] + nrm[1] * SPRAY_LEN * s + SPRAY_G * s * s + j[1] * k];
}
/* Thick and overlapping at the lip so the drops read as one ligature, thinning
   as they accelerate away until they separate into the export's droplets. */
const sprayR = s => Math.max(1.15, 2.95 - 1.15 * s);
const sprayFade = s => Math.min(1, s / 0.04) * Math.min(1, (SPRAY_MAX - s) / 0.28);
const mouthNormal = deg => { const r = deg * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; };

export { GLASS, MOUTH, PIVOT, REST_LEVEL, REST_VOL, SCALLOP_R, SCALLOP_MAX, water, surfaceY, spinTo,
         sprayAt, sprayR, sprayFade, mouthNormal, SPRAY_N, SPRAY_MAX, polyArea, clipDeep, downIn };
