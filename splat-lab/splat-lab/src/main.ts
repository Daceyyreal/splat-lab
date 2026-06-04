import "./style.css";
import { parsePly, serializePly } from "./ply.ts";
import { compress, estimateSizeMB, type QuantMode, type SplatData } from "./compression.ts";
import { SplatViewer } from "./viewer.ts";

const el = (id: string) => document.getElementById(id) as HTMLElement;

let base: SplatData | null = null;
let baselineMB = 0;
let viewer: SplatViewer | null = null;

const controls = {
  prune: () => parseFloat((el("prune") as HTMLInputElement).value),
  scaleCap: () => parseFloat((el("scaleCap") as HTMLInputElement).value),
  sh: () => parseInt((el("sh") as HTMLInputElement).value, 10),
  quant: () => (el("quant") as HTMLSelectElement).value as QuantMode,
};

function setMetrics(sizeMB: number, count: number) {
  el("size").textContent = sizeMB.toFixed(1);
  el("count").textContent = count.toLocaleString();
  const pct = baselineMB > 0 ? (1 - sizeMB / baselineMB) * 100 : 0;
  el("reduction").textContent = pct.toFixed(0);
}

let timer: number | undefined;
function recompute() {
  if (!base) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    el("status").textContent = "compressing…";
    const { data, sizeMB } = compress(base!, {
      prunePct: controls.prune(), scaleCap: controls.scaleCap(),
      shDegree: controls.sh(), quant: controls.quant(),
    });
    setMetrics(sizeMB, data.count);
    if (viewer) await viewer.show(serializePly(data));
    el("status").textContent = "ready";
  }, 200);
}

async function loadBuffer(buf: ArrayBuffer) {
  el("status").textContent = "parsing…";
  base = parsePly(buf);
  baselineMB = estimateSizeMB(base.count, base.shDegree, "none");
  el("baseline").textContent = baselineMB.toFixed(1);
  if (!viewer) viewer = new SplatViewer(el("canvas-host"));
  recompute();
}

function init() {
  ["prune", "scaleCap", "sh"].forEach((id) =>
    el(id).addEventListener("input", () => {
      el(`${id}-val`).textContent = (el(id) as HTMLInputElement).value;
      recompute();
    }));
  el("quant").addEventListener("change", recompute);

  (el("file") as HTMLInputElement).addEventListener("change", async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await loadBuffer(await f.arrayBuffer());
  });

  el("sample").addEventListener("click", async () => {
    // Drop a sample .ply at public/sample.ply, or wire your splat-slim Garden output here.
    el("status").textContent = "loading sample…";
    const res = await fetch("sample.ply");
    if (!res.ok) { el("status").textContent = "no sample.ply found — upload a file instead"; return; }
    await loadBuffer(await res.arrayBuffer());
  });
}

init();
