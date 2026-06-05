# splat-lab

**Live, in-browser 3D Gaussian Splatting compression — drag a slider, watch the size and quality change in real time.**

![Vite](https://img.shields.io/badge/vite-ready-646cff)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License](https://img.shields.io/badge/license-MIT-green)

![splat-lab demo — dragging the compression sliders and watching the file size drop live](assets/demo.gif)

splat-lab loads a trained 3DGS `.ply` in your browser, lets you prune Gaussians,
drop spherical-harmonic bands, and quantize — all live — and shows the resulting
file size and reduction the moment you move a control. It's the interactive
companion to [splat-slim](https://github.com/Daceyyreal/splat-slim): the same
compression math, made visual.

> **Live demo:** https://Daceyyreal.github.io/splat-lab/

## What you can do

- **Opacity prune** — drop near-transparent Gaussians by percentile.
- **Scale cap** — remove oversized blobs.
- **SH degree** — reduce spherical harmonics 3 → 2 → 1 → 0 and watch view-dependent color flatten.
- **Quantization** — fp16 / mixed / int8; the int8 setting visibly shows why naive INT8 is risky.

The size readout is computed honestly from the field layout and bit widths, so
the number you see is the size the model would actually be.

## Run locally

```bash
npm install
npm run dev      # open the printed localhost URL
```

Load a `.ply` with the **upload** button, or drop a sample at `public/sample.ply`
and click **load sample**. Your [splat-slim](https://github.com/Daceyyreal/splat-slim)
Garden output works directly.

## How it's built

| Layer | What it does | Tested |
|-------|--------------|--------|
| `compression.ts` | Prune / SH-reduce / quantize + honest size estimate (port of splat-slim) | ✅ |
| `ply.ts` | Binary PLY parse + serialize | ✅ |
| `viewer.ts` | Render via [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D); reload on change | in-browser |
| `main.ts` | UI controls, debounced live recompute, metrics | — |

```bash
npm test         # runs the compression + PLY round-trip tests
```

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via the included workflow
(`.github/workflows/deploy.yml`). Enable Pages → "GitHub Actions" in repo settings.

## License

MIT
