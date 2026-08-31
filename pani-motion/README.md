# Pani motion rig

Three Figma exports of the Pani icon — `default`, `on Hover`, `Hover animation` —
rebuilt as one continuous timeline with seven authored keyframes between them,
driven by a state machine. The shapes are baked; the water is solved.

```
frames/            the three source SVGs, unmodified
frames/keys/       nine standalone keyframe SVGs, emitted by the baker
build/geometry.mjs path data extracted from the sources
build/water.mjs    the liquid model, shared by the baker and the rig
build/bake.mjs     the baker
build/baked.js     generated: the timeline as interpolation-ready numbers
pani-morph-rig.html the prototype (Artifact format — see below)
```

`npm install && npm run bake` regenerates `frames/keys/` and `build/baked.js`,
and splices both the data (`BAKED_START` / `BAKED_END`) and the liquid model
itself (`WATER_START` / `WATER_END`) into the rig — so the solver that produced
the keyframes is byte-for-byte the one the page runs.

## Baked, not solved

The expensive part of morphing is correspondence: resampling two outlines to a
shared point count and rotating the index order until their features line up.
The baker does that once, with flubber, and writes the result out as plain
coordinate arrays — 372 matched points across five outlines, at nine keyframes.

The runtime therefore ships **no morph library, no JSX transform and no React**:
one script (Motion, Framer Motion's framework-agnostic bundle) plus ~54 kB of
numbers. The liquid is the one thing that cannot be baked, because it answers to
time as well as to `p`. Drawing a frame — spline, solve and all — costs about
0.36 ms.

Between keyframes the rig runs a cubic Hermite with Catmull-Rom tangents
measured in `p`, so velocity carries through each knot instead of restarting at
it. The knots are unevenly spaced on purpose; uniform tangents would tick.

## The water

The glass is a convex quad in its own frame. The water is that quad intersected
with a half-plane whose normal is world-down written in glass space, and the cut
is solved by bisection for a given volume. That one fact does all the work: the
surface stays level however far the glass turns, the mass pools to the low side,
climbs the wall as it tips, and reaches the rim at about **52°** on its own.
Nothing keyframes the spill — flow is just how far the lip has sunk below the
surface.

Pouring is not a pose. While flow is non-zero the level falls, which weakens the
flow, which slows the fall; stand the glass up and it fills back. Nothing floors
the drain — hold the glass over and it empties, coming to rest at about an eighth
full, which is the point where the surface has dropped to the lip and the flow
has stopped itself. The machine's own 1400 ms pour takes it from full to roughly
80%; scrub to `p = 2` and wait to see it run dry.

The face is painted on the water, so it rides down with the surface. At the
timeline's own fill the offset is zero and the exports are untouched; only drain
beyond what the timeline expected moves it.

The surface keeps the icon's bubbled edge: the top row of bubbles in
`default.svg` supplies the scallop radius and spacing. The bubble is sized to the
water beneath it, so as the glass empties the scallop shrinks with the sliver
instead of bulging out onto open blue. The spray leaves the lip as one body and scatters as
it falls, using the four droplets in the pour export — measured off the exit
parabola — as its break-up.

This replaced the original treatment, which carried the export's sixteen bubbles
around in the *glass's* frame. That is why it read as cargo rather than liquid.
The pour export itself gives the game away: its foam spans x 20→47 but y only
35→41, so the artist had already drawn the water level in world space.

## The ten keyframes

| # | name | p | tilt | flow | |
|---|------|---|------|------|---|
| 0 | rest | 0.00 | 0° | — | `default.svg` |
| 1 | stir | 0.30 | 0° | — | authored |
| 2 | blink | 0.62 | −1.2° | — | authored |
| 3 | greet | 1.00 | 0° | — | `on Hover.svg` |
| 4 | windup | 1.14 | −7° | — | authored |
| 5 | tip | 1.38 | 26° | — | authored |
| 6 | brim | 1.58 | 46° | — | authored |
| 7 | crest | 1.74 | 60° | 0.40 | authored |
| 8 | spill | 1.88 | 70° | 0.89 | authored |
| 9 | pour | 2.00 | 75° | 1.00 | `Hover animation.svg` |

The flow column is not authored — it is what the liquid model reports at that
tilt and fullness.

The exports sit at 0, 1 and 2 untouched. The six in-betweens are where the
weight lives:

- **A wind-up.** The glass leans −7° and squashes before it tips.
- **A real blink.** The closed eyes travel up into the open pair's seat as they
  thin away, so one eye opens rather than two eyes cross-fading.
- **A gasp.** The greeting export has no mouth, so the smile purses shut instead
  of dissolving, still morphing underneath and ready for the pour.

## The 75° the exports share

The poured body is the upright body rotated **exactly 75° about
(32.1547, 32.0642)** — the badge centre — to four decimal places. Two foam
bubbles land on their rotated twins too.

The rig applies that rotation for real and morphs only the residual silhouette
difference, which is just the spout. Handed the two outlines cold, a morph
collapses the glass into a lump halfway through the tip.

## The component

The mascot is one custom element with no dependencies beyond the spring:

```html
<pani-mascot state="greeting"></pani-mascot>
<pani-mascot auto></pani-mascot>   <!-- wires its own hover and click -->
```

```js
el.goTo("pouring")   // spring to a state, or to any p
el.scrub(1.4)        // take hand control, no spring
el.posture           // 0 … 2
el.addEventListener("pani:posture", e => e.detail.p)
```

Every mascot on the prototype page — the hero and all nine keyframe thumbnails —
is the same element at a different `p`.

## State machine

```
resting  --HOVER-->  greeting  --POUR-->  pouring
resting  --POUR--------------------------> pouring
greeting --LEAVE-->  resting
pouring  --SETTLE--> greeting     (auto, after 1400ms, guarded on hover)
pouring  --LEAVE-->  resting
```

## Note on the rig file

`pani-morph-rig.html` is authored in Artifact format: a fragment (`<title>`,
`<style>`, markup, scripts) that the Artifact publisher wraps in an HTML
skeleton. To open it standalone, wrap it in
`<!doctype html><html><head></head><body>…</body></html>`.
