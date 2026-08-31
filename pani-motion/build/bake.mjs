/* ---------------------------------------------------------------------------
   Pani morph baker.

   Reads the three Figma exports' geometry, authors six intermediate keyframes
   between them, and emits:

     ../frames/keys/*.svg   nine standalone SVGs — the timeline, frame by frame
     ./baked.js             the same nine frames as interpolation-ready data
     ../pani-morph-rig.html the data spliced in between the BAKED markers

   All the shape correspondence work (resampling, ring alignment) happens here,
   once. The runtime never loads flubber: it lerps matched point arrays.
   ------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as G from "./geometry.mjs";

const flubber = createRequire(import.meta.url)("flubber");   // CJS build

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_KEYS = path.join(HERE, "..", "frames", "keys");
const RIG = path.join(HERE, "..", "pani-morph-rig.html");

const PIVOT = [32.1547, 32.0642];
const TILT = 75;
const BLUE = "#1570EF";

/* --- small math ---------------------------------------------------------- */
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const round = (n, d = 3) => +n.toFixed(d);

function spin(x, y, deg){
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = x - PIVOT[0], dy = y - PIVOT[1];
  return [PIVOT[0] + dx*c - dy*s, PIVOT[1] + dx*s + dy*c];
}

/* Rotate a whole path about the pivot. Figma writes absolute M/L/H/V/C/Z;
   H and V become L, because a rotated horizontal is no longer horizontal. */
function rotatePath(d, deg){
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const f = n => n.toFixed(4).replace(/\.?0+$/, "");
  const pt = (x, y) => {
    const dx = x - PIVOT[0], dy = y - PIVOT[1];
    return f(PIVOT[0] + dx*c - dy*s) + " " + f(PIVOT[1] + dx*s + dy*c);
  };
  const tok = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  const out = []; let i = 0, cmd = null, cx = 0, cy = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length){
    if (/[A-Za-z]/.test(tok[i])){ cmd = tok[i].toUpperCase(); i++; }
    if (cmd === "Z"){ out.push("Z"); continue; }
    if (cmd === "M" || cmd === "L"){ cx = num(); cy = num(); out.push(cmd + pt(cx, cy)); }
    else if (cmd === "H"){ cx = num(); out.push("L" + pt(cx, cy)); }
    else if (cmd === "V"){ cy = num(); out.push("L" + pt(cx, cy)); }
    else if (cmd === "C"){
      const a = num(), b = num(), c2 = num(), d2 = num(), e = num(), g = num();
      cx = e; cy = g;
      out.push("C" + pt(a, b) + " " + pt(c2, d2) + " " + pt(e, g));
    }
  }
  return out.join("");
}

/* --- rings ---------------------------------------------------------------
   flubber does the hard part: resample both outlines to a shared point count
   and rotate the index order so corresponding features line up. We only want
   the two aligned point arrays, so we evaluate the interpolator at its ends
   and parse them back. From there, morphing is a plain lerp forever after. */
function ringPair(a, b, seg){
  const f = flubber.interpolate(a, b, { maxSegmentLength: seg });
  const parse = s => (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []).map(Number);
  /* flubber hands back the untouched source strings at t=0 and t=1, so sample
     two interior points instead — the interior is an exact lerp of the two
     rings, which makes the endpoints recoverable by extrapolation. */
  const p1 = parse(f(0.25)), p2 = parse(f(0.75));
  if (p1.length !== p2.length) throw new Error("ring length mismatch");
  const A = p1.map((v, i) => v - (p2[i] - v) * 0.5);
  const B = A.map((v, i) => v + (p2[i] - p1[i]) * 2);
  return [A, B];
}
const ringLerp = (A, B, t) => A.map((v, i) => v + (B[i] - v) * t);
function ringToPath(r){
  let s = "M" + round(r[0], 2) + " " + round(r[1], 2);
  for (let i = 2; i < r.length; i += 2) s += "L" + round(r[i], 2) + " " + round(r[i+1], 2);
  return s + "Z";
}
function ringShift(r, dx, dy){
  const o = r.slice();
  for (let i = 0; i < o.length; i += 2){ o[i] += dx; o[i+1] += dy; }
  return o;
}
function ringScale(r, sx, sy, cx, cy){
  const o = r.slice();
  for (let i = 0; i < o.length; i += 2){
    o[i]   = cx + (o[i]   - cx) * sx;
    o[i+1] = cy + (o[i+1] - cy) * sy;
  }
  return o;
}
function ringCentre(r){
  let x = 0, y = 0;
  for (let i = 0; i < r.length; i += 2){ x += r[i]; y += r[i+1]; }
  return [x / (r.length / 2), y / (r.length / 2)];
}

/* --- the glass, in its own frame ----------------------------------------- */
const SHELL_TILT_UP = rotatePath(G.SHELL_TILT, -TILT);
const BODY_TILT_UP  = rotatePath(G.BODY_TILT,  -TILT);

const [shellA, shellB] = ringPair(G.SHELL_UP, SHELL_TILT_UP, 1.2);
const [bodyA,  bodyB ] = ringPair(G.BODY_UP,  BODY_TILT_UP,  1.2);
const [eyeLA,  eyeLB ] = ringPair(G.EYE_L_UP, G.EYE_L_TILT, .3);
const [eyeRA,  eyeRB ] = ringPair(G.EYE_R_UP, G.EYE_R_TILT, .3);
const [mouthA, mouthB] = ringPair(G.MOUTH_UP, G.MOUTH_TILT, .3);

/* Poured foam targets, expressed in the glass's own frame. */
const FOAM = G.FOAM.map(b => {
  const q = spin(b.p[0], b.p[1], -TILT);
  return { ...b, q: [q[0], q[1], b.p[2]] };
});

/* The body outline barely changes in glass space, so one trapezoid holds foam
   for the whole tip. Keeping bubbles inside it is what stops the mid-morph
   splatter you get from letting them lerp freely.

   The wall is generous on purpose: several source bubbles already overlap it,
   and a white bubble sitting in the white shell is invisible. What has to be
   caught is a bubble reaching open blue. */
const GLASS = [[20, 18], [44.5, 18], [39.0563, 47.0801], [25.7106, 47.0801]];
const WALL = 2.2;
function containFoam(x, y, r){
  const need = r - WALL;
  for (let pass = 0; pass < 3; pass++){
    for (let i = 0; i < 4; i++){
      const [ax, ay] = GLASS[i], [bx, by] = GLASS[(i + 1) % 4];
      /* GLASS winds clockwise on a y-down canvas, so the inward normal of
         edge A→B is the direction rotated a quarter turn: (-dy, dx). */
      let nx = -(by - ay), ny = bx - ax;
      const len = Math.hypot(nx, ny); nx /= len; ny /= len;
      const dist = (x - ax) * nx + (y - ay) * ny;
      if (dist < need){ x += nx * (need - dist); y += ny * (need - dist); }
    }
  }
  return [x, y];
}

/* --- the authored timeline -----------------------------------------------
   Nine keyframes. The three exports sit at p = 0, 1 and 2 untouched; the six
   between them are where the weight lives — a wind-up before the tip, foam
   that lags and pools downhill, an overshoot on the way into the pour.       */
const KEYS = [
//  name       p      rot   sqx    sqy    shell  face  greet  foam   bScale bRot
  ["rest",   0.00,   0,   1,     1,     0,     0,    0,     0,     1,     0   ],
  ["stir",   0.30,   0,   1.014, 0.987, 0,     0.09, 0.26,  0.015, 1.006, -0.5],
  ["blink",  0.62,  -1.2, 0.992, 1.011, 0,     0.26, 0.74,  0.03,  1.021, -1.3],
  ["greet",  1.00,   0,   1,     1,     0,     0.5,  1,     0,     1.028, -1.6],
  ["windup", 1.14,  -7,   1.032, 0.966, 0.03,  0.57, 0.58, -0.07,  1.019, -2.6],
  ["tip",    1.40,  26,   0.984, 1.021, 0.30,  0.71, 0.10,  0.20,  1.002,  0.3],
  ["brim",   1.64,  52,   1.004, 0.998, 0.62,  0.85, 0,     0.54,  0.995,  0.9],
  ["spill",  1.85,  71,   1.014, 0.988, 0.88,  0.95, 0,     0.85,  0.990,  1.2],
  ["pour",   2.00,  75,   1,     1,     1,     1,    0,     1,     0.988,  1.0],
].map(([name, p, rot, sqx, sqy, shell, face, greet, foam, bScale, bRot]) =>
       ({ name, p, rot, sqx, sqy, shell, face, greet, foam, bScale, bRot }));

/* Feature centres, used to author the blink and the gasp. */
const OPEN_L = [28.5284, 29.72], OPEN_R = [36.3018, 29.72];
const SHUT_L = ringCentre(eyeLA),  SHUT_R = ringCentre(eyeRA);
const MOUTH_C = ringCentre(mouthA);

function buildKey(k){
  const rot = k.rot, g = k.greet;

  /* Foam. Progress lags the tip, then gravity pulls each bubble downhill in
     glass space before the trapezoid pushes it back inside the walls. */
  const downAng = -rot * Math.PI / 180;
  const down = [Math.sin(downAng) * -1, Math.cos(downAng)];   // world "down", in glass space
  const pool = 2.6 * Math.sin(Math.PI * clamp01(Math.abs(rot) / TILT));
  const exact = k.p === 0 || k.p === 2;

  const foam = FOAM.map(b => {
    const raw = b.lag ? clamp01((k.foam - b.lag) / (1 - b.lag)) : clamp01(k.foam);
    const t = raw * raw * (3 - 2 * raw);
    let x = lerp(b.i[0], b.q[0], t);
    let y = lerp(b.i[1], b.q[1], t);
    const r = lerp(b.i[2], b.q[2], t);
    const o = b.fade ? 1 - t : 1;
    if (!exact && !b.out){
      x += down[0] * pool; y += down[1] * pool;
      [x, y] = containFoam(x, y, r);
    }
    return [round(x), round(y), round(r), round(o, 3)];
  });

  /* Eyes. Rather than cross-fading a closed eye out and an open one in, the
     closed pair travels up to the open pair's seat as it thins away — so one
     eye opens instead of two eyes swapping. */
  const liftL = [OPEN_L[0] - SHUT_L[0], OPEN_L[1] - SHUT_L[1]];
  const liftR = [OPEN_R[0] - SHUT_R[0], OPEN_R[1] - SHUT_R[1]];
  const eyeL = ringScale(ringShift(ringLerp(eyeLA, eyeLB, k.face), liftL[0]*g, liftL[1]*g),
                         1 - .25*g, 1 - .8*g, OPEN_L[0], OPEN_L[1]);
  const eyeR = ringScale(ringShift(ringLerp(eyeRA, eyeRB, k.face), liftR[0]*g, liftR[1]*g),
                         1 - .25*g, 1 - .8*g, OPEN_R[0], OPEN_R[1]);

  /* Mouth. Absent from the greeting export, so it purses shut rather than
     dissolving — a gasp, with the smile still morphing underneath. */
  const mouth = ringScale(ringLerp(mouthA, mouthB, k.face),
                          1 - .55*g, 1 - .9*g, MOUTH_C[0], MOUTH_C[1]);

  return {
    ...k,
    shell: ringLerp(shellA, shellB, k.shell),
    body:  ringLerp(bodyA,  bodyB,  k.shell),
    eyeL, eyeR, mouth, foam,   /* `foam` here is the bubble table, not k.foam */
    shutO: round(1 - g, 3),
    openO: round(clamp01(g * 1.25 - .12), 3),
    openSY: round(.08 + .92 * (g * g * (3 - 2 * g)), 3),
    mouthO: round(clamp01(1 - g * 1.45), 3),
    flourO: round(clamp01(g * 1.15 - .08), 3),
    flourS: round(.45 + .55 * g, 3),
    dripO: round(clamp01(k.foam * 1.6 - .45), 3),
    fizz: G.FIZZ.map((f, i) => [
      round(clamp01(g * 1.9 - i * .16), 3),
      round((1 - clamp01(g * 1.55 - i * .13)) * 3.6, 3),
      round(.22 + .78 * clamp01(g * 1.55 - i * .13), 3),
    ]),
    lash: G.LASHES.map((l, i) => [
      round(clamp01(g * 1.85 - (i % 3) * .17), 3),
      round((1 - clamp01(g * 1.5 - (i % 3) * .11)) * -1.7, 3),
    ]),
  };
}

const FRAMES = KEYS.map(buildKey);

/* How far past the outer edge of the shell does any bubble reach? Anything
   above zero is foam on open blue. The exports are reported too, untouched,
   so the wall can be tuned without disturbing them. */
function overhang(f){
  let worst = -Infinity;
  f.foam.forEach(([x, y, r], i) => {
    if (FOAM[i].out || r < 0.05) return;
    let inside = Infinity;
    for (let e = 0; e < 4; e++){
      const [ax, ay] = GLASS[e], [bx, by] = GLASS[(e + 1) % 4];
      let nx = -(by - ay), ny = bx - ax;
      const len = Math.hypot(nx, ny); nx /= len; ny /= len;
      inside = Math.min(inside, (x - ax) * nx + (y - ay) * ny);
    }
    worst = Math.max(worst, r - WALL - inside);
  });
  return worst;
}

/* --- emit one standalone SVG per keyframe -------------------------------- */
function frameSVG(f, i){
  const gt = `rotate(${round(f.rot)} ${PIVOT[0]} ${PIVOT[1]}) translate(${PIVOT[0]} ${PIVOT[1]}) `
           + `scale(${round(f.sqx, 4)} ${round(f.sqy, 4)}) translate(${-PIVOT[0]} ${-PIVOT[1]})`;
  const bt = `translate(32.78 32) rotate(${round(f.bRot)}) scale(${round(f.bScale, 4)}) translate(-32.78 -32)`;
  const id = `pani_${f.name}`;
  const on = v => v > 0.005;
  const op = v => (v >= 0.999 ? "" : ` opacity="${v}"`);
  const L = [];
  L.push(`<svg width="66" height="64" viewBox="0 0 66 64" fill="none" xmlns="http://www.w3.org/2000/svg">`);
  L.push(`<title>Pani — keyframe ${i} of ${FRAMES.length - 1}: ${f.name} (p = ${f.p.toFixed(2)})</title>`);
  L.push(`<defs><clipPath id="${id}"><rect width="65.5517" height="64" rx="11"/></clipPath></defs>`);
  L.push(`<g clip-path="url(#${id})"><g transform="${bt}">`);
  L.push(`<path d="${G.BADGE}" fill="${BLUE}"/>`);
  if (on(f.flourO)) for (const [d, ox, oy, dir] of [[G.FLOURISH_L, 20.9, 43.7, -1], [G.FLOURISH_R, 43.5, 42.7, 1]])
    L.push(`<path d="${d}" fill="white"${op(f.flourO)} transform="translate(${ox} ${oy}) scale(${f.flourS}) rotate(${round((1 - f.greet) * dir * 14, 2)}) translate(${-ox} ${-oy})"/>`);
  L.push(`<g transform="${gt}">`);
  L.push(`<path d="${ringToPath(f.shell)}" fill="white"/>`);
  L.push(`<path d="${ringToPath(f.body)}" fill="${BLUE}"/>`);
  for (const [x, y, r, o] of f.foam) if (r > 0.01 && o > 0.005)
    L.push(`<circle cx="${x}" cy="${y}" r="${r}"${op(o)} fill="white"/>`);
  f.fizz.forEach(([o, dy, s], j) => { if (on(o)){
    const [cx, cy] = G.FIZZ[j].o;
    L.push(`<path d="${G.FIZZ[j].d}" fill="white"${op(o)} transform="translate(0 ${dy}) translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})"/>`);
  }});
  L.push(`</g>`);
  if (on(f.shutO)){
    L.push(`<path d="${ringToPath(f.eyeL)}" fill="${BLUE}"${op(f.shutO)}/>`);
    L.push(`<path d="${ringToPath(f.eyeR)}" fill="${BLUE}"${op(f.shutO)}/>`);
  }
  if (on(f.openO)){
    const eg = (d, c) => `<path d="${d}" fill="${c}" transform="translate(0 29.72) scale(1 ${f.openSY}) translate(0 -29.72)"/>`;
    L.push(`<g${op(f.openO)}>${eg(G.EYE_OPEN_L, "white")}${eg(G.EYE_OPEN_R, "white")}${eg(G.PUPIL_L, BLUE)}${eg(G.PUPIL_R, BLUE)}</g>`);
  }
  f.lash.forEach(([o, dy], j) => { if (on(o))
    L.push(`<path d="${G.LASHES[j].d}" fill="${BLUE}"${op(o)} transform="translate(0 ${dy})"/>`); });
  if (on(f.mouthO)) L.push(`<path d="${ringToPath(f.mouth)}" fill="${BLUE}"${op(f.mouthO)}/>`);
  if (on(f.dripO)) for (const d of [G.DRIP_A, G.DRIP_B])
    L.push(`<path d="${d}" fill="${BLUE}"${op(f.dripO)}/>`);
  L.push(`</g></g></svg>`);
  return L.join("\n") + "\n";
}

fs.mkdirSync(OUT_KEYS, { recursive: true });
for (const f of fs.readdirSync(OUT_KEYS)) fs.unlinkSync(path.join(OUT_KEYS, f));
FRAMES.forEach((f, i) => {
  const name = `k${i}-${f.name}.svg`;
  fs.writeFileSync(path.join(OUT_KEYS, name), frameSVG(f, i));
});

/* --- emit the runtime table ---------------------------------------------- */
const flat = a => a.map(v => round(v, 2));
const BAKED = {
  P: FRAMES.map(f => f.p),
  names: FRAMES.map(f => f.name),
  anchors: [0, 3, 8],                                  // the three exports
  sources: ["default.svg", "on Hover.svg", "Hover animation.svg"],
  pivot: PIVOT,
  badge: G.BADGE,
  /* The runtime re-applies containment: the spline between two contained
     keyframes can still bulge past the wall. */
  glass: GLASS, wall: WALL,
  hold: FOAM.map(b => (b.out ? 0 : 1)),
  rings: {
    shell: FRAMES.map(f => flat(f.shell)),
    body:  FRAMES.map(f => flat(f.body)),
    eyeL:  FRAMES.map(f => flat(f.eyeL)),
    eyeR:  FRAMES.map(f => flat(f.eyeR)),
    mouth: FRAMES.map(f => flat(f.mouth)),
  },
  foam: FOAM.map((_, i) => FRAMES.map(f => f.foam[i])),
  tracks: {
    rot:    FRAMES.map(f => f.rot),
    sqx:    FRAMES.map(f => f.sqx),
    sqy:    FRAMES.map(f => f.sqy),
    bScale: FRAMES.map(f => f.bScale),
    bRot:   FRAMES.map(f => f.bRot),
    shutO:  FRAMES.map(f => f.shutO),
    openO:  FRAMES.map(f => f.openO),
    openSY: FRAMES.map(f => f.openSY),
    mouthO: FRAMES.map(f => f.mouthO),
    flourO: FRAMES.map(f => f.flourO),
    flourS: FRAMES.map(f => f.flourS),
    flourR: FRAMES.map(f => round((1 - f.greet) * 14, 2)),
    dripO:  FRAMES.map(f => f.dripO),
  },
  fizz: G.FIZZ.map((f, j) => ({ d: f.d, o: f.o, k: FRAMES.map(fr => fr.fizz[j]) })),
  lash: G.LASHES.map((l, j) => ({ d: l.d, k: FRAMES.map(fr => fr.lash[j]) })),
  statics: {
    openL: G.EYE_OPEN_L, openR: G.EYE_OPEN_R, pupilL: G.PUPIL_L, pupilR: G.PUPIL_R,
    flourL: G.FLOURISH_L, flourR: G.FLOURISH_R, dripA: G.DRIP_A, dripB: G.DRIP_B,
    flourAt: [[20.9, 43.7, -1], [43.5, 42.7, 1]],
  },
};

const js = "const BAKED = " + JSON.stringify(BAKED) + ";";
fs.writeFileSync(path.join(HERE, "baked.js"), js + "\n");

const rig = fs.readFileSync(RIG, "utf8");
const A = "/* BAKED_START */", B = "/* BAKED_END */";
if (rig.includes(A) && rig.includes(B)){
  const out = rig.slice(0, rig.indexOf(A) + A.length) + "\n" + js + "\n" + rig.slice(rig.indexOf(B));
  fs.writeFileSync(RIG, out);
  console.log("spliced into pani-morph-rig.html");
} else {
  console.log("markers not found in rig — wrote build/baked.js only");
}

console.log(`${FRAMES.length} keyframes → frames/keys/`);
console.log(FRAMES.map((f, i) => `  k${i}-${f.name}.svg  p=${f.p.toFixed(2)}  rot=${f.rot}°`).join("\n"));
console.log("foam overhang past the shell (negative = contained):");
console.log(FRAMES.map(f => `  ${f.name.padEnd(7)} ${overhang(f) >= 0 ? "+" : ""}${overhang(f).toFixed(2)}`).join("\n"));
console.log(`ring points: shell ${shellA.length / 2}, body ${bodyA.length / 2}, `
          + `eyes ${eyeLA.length / 2}, mouth ${mouthA.length / 2}`);
console.log(`baked.js ${(js.length / 1024).toFixed(1)} kB`);
