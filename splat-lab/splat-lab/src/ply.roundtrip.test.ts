import { parsePly, serializePly } from "./ply.ts";
import type { SplatData } from "./compression.ts";

const n = 300;
const rk = (k: number) => Float32Array.from({ length: n * k }, () => Math.random() * 2 - 1);
const base: SplatData = {
  count: n, positions: rk(3), scales: rk(3), rotations: rk(4),
  opacities: rk(1), fDC: rk(3), fRest: rk(45), shDegree: 3,
};

const parsed = parsePly(serializePly(base));
const close = (a: number, b: number) => Math.abs(a - b) < 1e-5;
let pass = 0, fail = 0;
const ok = (name: string, c: boolean) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}`); };

ok("count preserved", parsed.count === n);
ok("shDegree preserved", parsed.shDegree === 3);
ok("fRest/splat = 45", parsed.fRest.length / parsed.count === 45);
ok("position round-trips", close(parsed.positions[10], base.positions[10]));
ok("fDC round-trips", close(parsed.fDC[7], base.fDC[7]));
ok("fRest round-trips", close(parsed.fRest[100], base.fRest[100]));
ok("rotation round-trips", close(parsed.rotations[3], base.rotations[3]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
