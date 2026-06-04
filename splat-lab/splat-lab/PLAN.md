# splat-lab — build plan

## What it is (1 line)
A browser app that compresses a 3DGS `.ply` live — prune / SH / quantize sliders —
showing the size/quality tradeoff in real time. The visual demo of splat-slim.

## Why it matters for your profile
- A clickable live link that *shows* "87% smaller" beats any README table.
- Bridges CV → frontend: proves you ship real, deployed web apps, not just notebooks.
- Reuses splat-slim's math, so the two projects reinforce each other.

## Status

**Done + tested (this scaffold):**
- `compression.ts` — prune, outlier removal, channel-blocked SH reduction, quantization
  simulation, honest size estimate. 12/12 unit tests pass.
- `ply.ts` — binary PLY parse + serialize. 7/7 round-trip tests pass.
- App shell, control panel, metrics readout, dark UI.
- Vite + TypeScript + GitHub Pages deploy workflow.

**Verify in-browser (needs a GPU/browser — can't be tested headless):**
- The 3 calls in `viewer.ts` marked `VERIFY` against the installed GaussianSplats3D
  version (`addSplatScene` options, `removeSplatScene`, `SceneFormat.Ply`).
- That re-display on slider change looks smooth (debounced to 200ms).

## Day-by-day

**Day 1 — DONE.** Data layer + UI + deploy pipeline scaffolded and tested.
Your move: create the `splat-lab` repo, push, replace `Daceyyreal`.

**Day 2 — Wire the renderer for real.**
`npm install && npm run dev`, load a sample `.ply`, and fix the `VERIFY` calls in
`viewer.ts` so the splat actually renders and updates. Confirm sliders change both
the picture and the size number.

**Day 3 — Polish + ship.**
Drop your splat-slim Garden output as the default sample, record a short GIF for the
README, enable GitHub Pages (Actions mode), confirm the live link works, add it to
your profile and link it from the splat-slim README.

## Getting a sample splat
Use a public 3DGS `.ply`, or — better — your own splat-slim Garden output, so the
demo shows your real scene. Put it at `public/sample.ply`.
