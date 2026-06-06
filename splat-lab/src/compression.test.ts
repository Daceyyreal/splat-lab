import {
  type SplatData, pruneByOpacity, reduceSH, quantizeSim, estimateSizeMB, compress,
} from "./compression.ts";

function toy(n = 1000): SplatData {
  const rnd = (m = 0, s = 1) => Float32Array.from({ length: n }, () => m + s * (Math.random() * 2 - 1));
  const rndK = (k: number) => Float32Array.from({ length: n * k }, () => Math.random() * 2 - 1);
  return {
    count: n, positions: rndK(3), scales: Float32Array.from({ length: n * 3 }, () => -3 + Math.random()),
    rotations: rndK(4), opacities: rnd(0, 3), fDC: rndK(3), fRest: rndK(45), shDegree: 3,
  };
}

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); };

const d = toy();

ok("prune removes some splats", pruneByOpacity(d, 5).count < d.count);
ok("prune keeps most splats", pruneByOpacity(d, 5).count > d.count * 0.9);

ok("reduceSH 3->1 leaves 9 fRest/splat", reduceSH(d, 1).fRest.length / d.count === 9);
ok("reduceSH 3->2 leaves 24 fRest/splat", reduceSH(d, 2).fRest.length / d.count === 24);
ok("reduceSH 3->3 is identity", reduceSH(d, 3).fRest.length / d.count === 45);

const q = quantizeSim(d, "mixed");
ok("quantizeSim mixed preserves count", q.count === d.count);
ok("quantizeSim mixed changes fDC values", q.fDC.some((v, i) => v !== d.fDC[i]));
ok("quantizeSim mixed keeps positions close", q.positions.every((v, i) => Math.abs(v - d.positions[i]) < 0.01));

// Size ordering: none > fp16 > mixed, and SH1 < SH3
const sNone = estimateSizeMB(1000, 3, "none");
const sFp16 = estimateSizeMB(1000, 3, "fp16");
const sMixed = estimateSizeMB(1000, 3, "mixed");
ok("size: none > fp16 > mixed", sNone > sFp16 && sFp16 > sMixed);
ok("size: SH1 smaller than SH3", estimateSizeMB(1000, 1, "mixed") < estimateSizeMB(1000, 3, "mixed"));

const { data, sizeMB } = compress(d, { prunePct: 5, scaleCap: 1.0, shDegree: 1, quant: "mixed" });
ok("compress: full chain runs", data.count > 0 && sizeMB > 0);
ok("compress: reduces vs baseline", sizeMB < estimateSizeMB(d.count, 3, "none"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
