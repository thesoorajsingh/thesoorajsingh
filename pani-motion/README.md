# Pani motion rig

Three Figma exports of the Pani icon — `default`, `on Hover`, `Hover animation` —
rebuilt as one continuous timeline with six authored keyframes between them,
driven by a state machine.

```
frames/            the three source SVGs, unmodified
frames/keys/       nine standalone keyframe SVGs, emitted by the baker
build/geometry.mjs path data extracted from the sources
build/bake.mjs     the baker
build/baked.js     generated: the timeline as interpolation-ready numbers
pani-morph-rig.html the prototype (Artifact format — see below)
```

`npm install && npm run bake` regenerates `frames/keys/`, `build/baked.js`, and
splices the data into the rig between its `BAKED_START` / `BAKED_END` markers.

## Baked, not solved

The expensive part of morphing is correspondence: resampling two outlines to a
shared point count and rotating the index order until their features line up.
The baker does that once, with flubber, and writes the result out as plain
coordinate arrays — 372 matched points across five outlines, at nine keyframes.

The runtime therefore ships **no morph library, no JSX transform and no React**:
one script (Motion, Framer Motion's framework-agnostic bundle) plus ~53 kB of
numbers. Drawing a frame costs about 0.35 ms.

Between keyframes the rig runs a cubic Hermite with Catmull-Rom tangents
measured in `p`, so velocity carries through each knot instead of restarting at
it. The knots are unevenly spaced on purpose; uniform tangents would tick.

## The nine keyframes

| # | name | p | tilt | |
|---|------|---|------|---|
| 0 | rest | 0.00 | 0° | `default.svg` |
| 1 | stir | 0.30 | 0° | authored |
| 2 | blink | 0.62 | −1.2° | authored |
| 3 | greet | 1.00 | 0° | `on Hover.svg` |
| 4 | windup | 1.14 | −7° | authored |
| 5 | tip | 1.40 | 26° | authored |
| 6 | brim | 1.64 | 52° | authored |
| 7 | spill | 1.85 | 71° | authored |
| 8 | pour | 2.00 | 75° | `Hover animation.svg` |

The exports sit at 0, 1 and 2 untouched. The six in-betweens are where the
weight lives:

- **A wind-up.** The glass leans −7° and squashes before it tips.
- **Foam with inertia.** Bubble progress lags the rotation, then gravity pulls
  each one downhill in the glass's own frame.
- **Containment.** Foam is held inside the body outline, offset outward by a
  shell thickness — a white bubble inside the white shell is invisible, one on
  open blue is not. The baker holds every keyframe and the runtime re-applies
  the wall on every drawn frame, because a spline through two contained points
  can still bow outside.
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
