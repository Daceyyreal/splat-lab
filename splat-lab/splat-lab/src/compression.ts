/**
 * Compression core — a JS port of the splat-slim pipeline.
 *
 * Operates on a SplatData struct of typed arrays so the same logic drives both
 * the live render (apply ops, re-render) and the honest size readout (compute
 * bytes from the resulting field layout + bit widths).
 *
 * SH layout matches the .ply convention: fRest is channel-blocked, 15 coeffs
 * per RGB channel for degree 3 (channel c occupies indices c*15 .. c*15+14).
 */

export interface SplatData {
  count: number;
  positions: Float32Array; // count * 3
  scales: Float32Array;    // count * 3 (log-scale, as stored)
  rotations: Float32Array; // count * 4
  opacities: Float32Array; // count (logit)
  fDC: Float32Array;       // count * 3
  fRest: Float32Array;     // count * (3 * coeffsPerChannel)
  shDegree: number;        // 0..3
}

export type QuantMode = "none" | "fp16" | "int8" | "mixed";

const COEFFS_PER_CHANNEL: Record<number, number> = { 0: 0, 1: 3, 2: 8, 3: 15 };

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function percentile(values: ArrayLike<number>, p: number): number {
  const arr = Float64Array.from(values as number[]).sort();
  if (arr.length === 0) return 0;
  const idx = (p / 100) * (arr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

/** Gather the kept rows into a new, smaller SplatData. */
function gather(d: SplatData, keep: number[]): SplatData {
  const coeffs = (d.fRest.length / d.count) | 0;
  const pick = (src: Float32Array, stride: number) => {
    const out = new Float32Array(keep.length * stride);
    keep.forEach((row, i) => out.set(src.subarray(row * stride, row * stride + stride), i * stride));
    return out;
  };
  return {
    count: keep.length,
    positions: pick(d.positions, 3),
    scales: pick(d.scales, 3),
    rotations: pick(d.rotations, 4),
    opacities: pick(d.opacities, 1),
    fDC: pick(d.fDC, 3),
    fRest: pick(d.fRest, coeffs),
    shDegree: d.shDegree,
  };
}

/** Stage 1 — adaptive opacity pruning (drop below the Pth-percentile sigmoid). */
export function pruneByOpacity(d: SplatData, percentileP = 5): SplatData {
  const sig = Array.from(d.opacities, sigmoid);
  const thr = percentile(sig, percentileP);
  const keep: number[] = [];
  for (let i = 0; i < d.count; i++) if (sig[i] >= thr) keep.push(i);
  return gather(d, keep);
}

/** Stage 2 — drop spatial / scale outliers; hard scale cap on the upper bound. */
export function removeOutliers(d: SplatData, scaleCap = 1.0): SplatData {
  const axis = (src: Float32Array, a: number, stride: number) =>
    Array.from({ length: d.count }, (_, i) => src[i * stride + a]);
  const bounds = (src: Float32Array, stride: number, lo: number, hi: number, cap = Infinity) =>
    Array.from({ length: stride }, (_, a) => {
      const col = axis(src, a, stride);
      return [percentile(col, lo), Math.min(percentile(col, hi), cap)] as const;
    });
  const sp = bounds(d.positions, 3, 0.5, 99.5);
  const sc = bounds(d.scales, 3, 1.0, 99.0, scaleCap);
  const keep: number[] = [];
  for (let i = 0; i < d.count; i++) {
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const x = d.positions[i * 3 + a], s = d.scales[i * 3 + a];
      if (x < sp[a][0] || x > sp[a][1] || s < sc[a][0] || s > sc[a][1]) ok = false;
    }
    if (ok) keep.push(i);
  }
  return gather(d, keep);
}

/** Stage 3 — channel-blocked SH reduction to targetDegree (1/2/3). */
export function reduceSH(d: SplatData, targetDegree: number): SplatData {
  if (targetDegree === d.shDegree) return d;
  const perCh = (d.fRest.length / d.count / 3) | 0; // 15 for full SH3
  const keepCoeffs = COEFFS_PER_CHANNEL[targetDegree];
  const kept: number[] = [];
  for (let c = 0; c < 3; c++) for (let k = 0; k < keepCoeffs; k++) kept.push(c * perCh + k);
  const newFRest = new Float32Array(d.count * kept.length);
  for (let i = 0; i < d.count; i++)
    kept.forEach((src, j) => (newFRest[i * kept.length + j] = d.fRest[i * (perCh * 3) + src]));
  return { ...d, fRest: newFRest, shDegree: targetDegree };
}

/** Round-trip a value through fp16 precision (for a faithful render preview). */
function toFp16(x: number): number {
  const f = new Float32Array(1); f[0] = x;
  const bits = new Uint32Array(f.buffer)[0];
  // truncate mantissa to 10 bits (approximate fp16 round-to-nearest)
  const sign = (bits >>> 16) & 0x8000;
  let exp = ((bits >>> 23) & 0xff) - 127 + 15;
  let mant = bits & 0x7fffff;
  if (exp <= 0) return sign ? -0 : 0;
  if (exp >= 31) return sign ? -Infinity : Infinity;
  const half = (sign | (exp << 10) | (mant >> 13)) & 0xffff;
  // decode back
  const s = half & 0x8000 ? -1 : 1;
  const e = (half >> 10) & 0x1f;
  const m = half & 0x3ff;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

function int8RoundTrip(arr: Float32Array): Float32Array {
  let mn = Infinity, mx = -Infinity;
  for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const rng = Math.max(mx - mn, 1e-9);
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const q = Math.min(255, Math.max(0, Math.round(((arr[i] - mn) / rng) * 255)));
    out[i] = (q / 255) * rng + mn;
  }
  return out;
}

const GEOMETRY: (keyof SplatData)[] = ["positions", "scales", "rotations"];
const APPEARANCE: (keyof SplatData)[] = ["opacities", "fDC", "fRest"];

/** Stage 4 — simulate quantization on the arrays so the render shows its quality. */
export function quantizeSim(d: SplatData, mode: QuantMode): SplatData {
  if (mode === "none") return d;
  const out: SplatData = { ...d };
  const apply = (key: keyof SplatData, kind: "fp16" | "int8") => {
    const src = d[key] as Float32Array;
    out[key] = (kind === "fp16" ? Float32Array.from(src, toFp16) : int8RoundTrip(src)) as never;
  };
  for (const k of GEOMETRY) apply(k, mode === "int8" ? "int8" : "fp16");
  for (const k of APPEARANCE) apply(k, mode === "fp16" ? "fp16" : "int8");
  return out;
}

/** Honest size estimate (MB, 1e6 bytes) from count, SH degree, and quant mode. */
export function estimateSizeMB(count: number, shDegree: number, mode: QuantMode): number {
  const coeffs = COEFFS_PER_CHANNEL[shDegree];
  const geomFloats = 3 + 3 + 4;            // pos + scale + rot
  const apprFloats = 1 + 3 + 3 * coeffs;   // opacity + fDC + fRest
  const bytesFor = (m: QuantMode, group: "geom" | "appr") => {
    if (m === "none") return 4;
    if (m === "fp16") return 2;
    if (m === "int8") return 1;
    return group === "geom" ? 2 : 1; // mixed
  };
  const perSplat = geomFloats * bytesFor(mode, "geom") + apprFloats * bytesFor(mode, "appr");
  return (count * perSplat) / 1e6;
}

/** Apply the full chain and report the resulting data + size. */
export function compress(
  base: SplatData,
  opts: { prunePct: number; scaleCap: number; shDegree: number; quant: QuantMode },
): { data: SplatData; sizeMB: number } {
  let d = pruneByOpacity(base, opts.prunePct);
  d = removeOutliers(d, opts.scaleCap);
  d = reduceSH(d, opts.shDegree);
  const rendered = quantizeSim(d, opts.quant);
  return { data: rendered, sizeMB: estimateSizeMB(d.count, opts.shDegree, opts.quant) };
}
