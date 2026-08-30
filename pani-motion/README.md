# Pani motion rig

Three Figma exports of the Pani icon — `default`, `on Hover`, `Hover animation` —
rebuilt as a single Framer Motion rig with a state machine driving the
transitions between them.

- `pani-morph-rig.html` — the prototype. Authored in Artifact format: a
  fragment (`<title>`, `<style>`, markup, scripts) that the Artifact publisher
  wraps in an HTML skeleton. To open it standalone, wrap it in
  `<!doctype html><html><head></head><body>…</body></html>`.
- `frames/` — the three source SVGs, unmodified.

## How it works

A single spring, `p ∈ [0, 2]`, drives everything: `0` resting, `1` greeting,
`2` pouring. Every path, circle and opacity is a pure function of `p`, so a
machine-driven transition and a hand-drag of the scrubber produce identical
frames.

The poured body turns out to be the upright body rotated **exactly 75° about
(32.1547, 32.0642)** — the badge centre — to four decimal places. The rig uses
that: it applies the real rotation to a group and morphs only the residual
shape difference (the spout). Handed the two silhouettes cold, flubber
collapses the glass into a lump halfway through the tip.

Foam rides inside that rotating group, so the sixteen circles lerp in the
bottle's own frame, starting slightly after the tip so the mass reads as
weight. Four of them clear the badge as droplets on staggered offsets.

The face stays in badge space and morphs directly, because in the source
artwork it stays upright to the viewer while the glass turns.

## State machine

```
resting  --HOVER-->  greeting  --POUR-->  pouring
resting  --POUR--------------------------> pouring
greeting --LEAVE-->  resting
pouring  --SETTLE--> greeting     (auto, after 1400ms, guarded on hover)
pouring  --LEAVE-->  resting
```

Libraries load from CDN at runtime: React 18, Framer Motion 11, Flubber 0.4,
Babel standalone (JSX is transformed in the browser).
